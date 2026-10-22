"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assignCards, assignModule1Cases, assignModule2Recordings, assignSections, type FacilitatorRef, type ScenarioRef } from "@/lib/assignment";
import { requireRole } from "@/lib/auth";
import { siteUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { REGIONS, type Role } from "@/lib/types";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

// ---------------------------------------------------------------------------
// Cohorts
// ---------------------------------------------------------------------------
export async function createCohort(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const { data: program } = await supabase.from("programs").select("id").order("created_at").limit(1).single();
  const region = str(formData, "region");
  const { data, error } = await supabase
    .from("cohorts")
    .insert({
      name: str(formData, "name"),
      region: REGIONS.includes(region as never) ? region : null,
      week_start: str(formData, "week_start"),
      program_id: program!.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  redirect(`/admin/cohorts/${data.id}`);
}

export async function setTeachBack(cohortId: string, formData: FormData) {
  const { supabase } = await requireRole("admin");
  const at = str(formData, "teach_back_at");
  const tz = Number(formData.get("tz_offset") ?? 0);
  const iso = at ? new Date(new Date(`${at}:00Z`).getTime() + tz * 60_000).toISOString() : null;
  await supabase.from("cohorts").update({ teach_back_at: iso }).eq("id", cohortId);
  revalidatePath(`/admin/cohorts/${cohortId}`);
}

/** Adds a facilitator: membership, an attempt and one submission per module. */
export async function addMember(cohortId: string, formData: FormData) {
  const { supabase } = await requireRole("admin");
  const facilitatorId = str(formData, "facilitator_id");
  if (!facilitatorId) return;
  await supabase.from("cohort_members").upsert({ cohort_id: cohortId, facilitator_id: facilitatorId });
  const { data: attempt, error } = await supabase
    .from("attempts")
    .upsert({ cohort_id: cohortId, facilitator_id: facilitatorId }, { onConflict: "facilitator_id,cohort_id" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await supabase
    .from("module_submissions")
    .upsert([1, 2, 3].map((module) => ({ attempt_id: attempt.id, module, try_no: 1 })), {
      onConflict: "attempt_id,module,try_no",
      ignoreDuplicates: true,
    });
  revalidatePath(`/admin/cohorts/${cohortId}`);
}

export async function removeMember(cohortId: string, facilitatorId: string) {
  const { supabase } = await requireRole("admin");
  await supabase.from("attempts").delete().eq("cohort_id", cohortId).eq("facilitator_id", facilitatorId);
  await supabase.from("cohort_members").delete().eq("cohort_id", cohortId).eq("facilitator_id", facilitatorId);
  revalidatePath(`/admin/cohorts/${cohortId}`);
}

export async function addGrader(cohortId: string, formData: FormData) {
  const { supabase } = await requireRole("admin");
  const graderId = str(formData, "grader_id");
  if (graderId) await supabase.from("cohort_graders").upsert({ cohort_id: cohortId, grader_id: graderId });
  revalidatePath(`/admin/cohorts/${cohortId}`);
}

export async function removeGrader(cohortId: string, graderId: string) {
  const { supabase } = await requireRole("admin");
  await supabase.from("cohort_graders").delete().eq("cohort_id", cohortId).eq("grader_id", graderId);
  revalidatePath(`/admin/cohorts/${cohortId}`);
}

/** Opens the second try of a module that was not passed; it gets the alternate version on auto-assign. */
export async function createReassessment(cohortId: string, submissionId: string) {
  const { supabase } = await requireRole("admin");
  const { data: s } = await supabase.from("module_submissions").select("attempt_id, module, try_no, result").eq("id", submissionId).single();
  if (!s || s.result !== "not_passed" || s.try_no !== 1) return;
  await supabase.from("module_submissions").insert({ attempt_id: s.attempt_id, module: s.module, try_no: 2, dashboard_version: "B" });
  await autoAssign(cohortId);
}

type SubRow = { id: string; attempt_id: string; module: number; try_no: number; scenario_id: string | null; section_id: string | null };

/** Fills every unassigned case, recording, section and learner card in the cohort. */
export async function autoAssign(cohortId: string) {
  const { supabase } = await requireRole("admin");
  const warnings: string[] = [];

  const { data: cohort } = await supabase.from("cohorts").select("id, week_start").eq("id", cohortId).single();
  const { data: attempts } = await supabase
    .from("attempts")
    .select("id, facilitator_id, cycle, profiles(region)")
    .eq("cohort_id", cohortId);
  const { data: scenarioRows } = await supabase.from("scenarios").select("id, module, family, version, is_spare").eq("active", true);
  const scenarios: ScenarioRef[] = (scenarioRows ?? []).map((s) => ({ id: s.id, module: s.module, family: s.family, version: s.version, isSpare: s.is_spare }));
  const byId = new Map(scenarios.map((s) => [s.id, s]));
  const attemptIds = (attempts ?? []).map((a) => a.id);
  if (!cohort || attemptIds.length === 0) redirect(`/admin/cohorts/${cohortId}`);

  const { data: subs } = await supabase
    .from("module_submissions")
    .select("id, attempt_id, module, try_no, scenario_id, section_id")
    .in("attempt_id", attemptIds)
    .returns<SubRow[]>();

  // Everything each facilitator has ever been given, across cycles: never repeat a scenario.
  const facIds = (attempts ?? []).map((a) => a.facilitator_id);
  const { data: history } = await supabase
    .from("module_submissions")
    .select("scenario_id, attempts!inner(facilitator_id)")
    .in("attempts.facilitator_id", facIds)
    .not("scenario_id", "is", null);
  const seen = new Map<string, string[]>();
  for (const h of history ?? []) {
    const f = (h.attempts as unknown as { facilitator_id: string }).facilitator_id;
    seen.set(f, [...(seen.get(f) ?? []), h.scenario_id as string]);
  }

  // Families already used by other cohorts in the same week, and Case 3 coverage per region.
  const { data: weekSubs } = await supabase
    .from("module_submissions")
    .select("scenario_id, attempts!inner(cohort_id, cohorts!inner(week_start))")
    .eq("module", 1)
    .eq("attempts.cohorts.week_start", cohort.week_start)
    .neq("attempts.cohort_id", cohortId)
    .not("scenario_id", "is", null);
  const familiesUsedThisWeek = (weekSubs ?? []).map((w) => byId.get(w.scenario_id as string)?.family).filter(Boolean) as string[];

  const { data: cycleM1 } = await supabase
    .from("module_submissions")
    .select("scenario_id, try_no, attempts!inner(cycle, profiles(region))")
    .eq("module", 1)
    .eq("try_no", 1)
    .eq("attempts.cycle", attempts![0].cycle)
    .not("scenario_id", "is", null);
  const regionStats: Record<string, { total: number; case3: number }> = {};
  for (const r of cycleM1 ?? []) {
    const region = (r.attempts as unknown as { profiles: { region: string | null } }).profiles?.region ?? "Unassigned";
    const st = (regionStats[region] ??= { total: 0, case3: 0 });
    st.total += 1;
    if (byId.get(r.scenario_id as string)?.family === "case-3") st.case3 += 1;
  }

  const attemptById = new Map((attempts ?? []).map((a) => [a.id, a]));
  const refFor = (s: SubRow): FacilitatorRef => {
    const a = attemptById.get(s.attempt_id)!;
    return {
      id: s.id, // keyed by submission so each try gets its own assignment
      region: (a.profiles as unknown as { region: string | null })?.region ?? null,
      isReassessment: s.try_no > 1,
      seenScenarioIds: seen.get(a.facilitator_id) ?? [],
    };
  };

  // Module 1
  const m1Open = (subs ?? []).filter((s) => s.module === 1 && !s.scenario_id);
  const m1Taken = (subs ?? []).filter((s) => s.module === 1 && s.scenario_id).map((s) => byId.get(s.scenario_id!)?.family).filter(Boolean) as string[];
  if (m1Open.length) {
    const r = assignModule1Cases({
      facilitators: m1Open.map(refFor),
      scenarios,
      familiesUsedThisWeek: [...familiesUsedThisWeek, ...m1Taken],
      regionStats,
    });
    warnings.push(...r.warnings);
    for (const [subId, scenarioId] of Object.entries(r.assignments)) {
      await supabase.from("module_submissions").update({ scenario_id: scenarioId, dashboard_version: byId.get(scenarioId)!.version }).eq("id", subId);
    }
  }

  // Module 2
  const m2Open = (subs ?? []).filter((s) => s.module === 2 && !s.scenario_id);
  if (m2Open.length) {
    const r = assignModule2Recordings({ facilitators: m2Open.map(refFor), scenarios });
    warnings.push(...r.warnings);
    for (const [subId, scenarioId] of Object.entries(r.assignments)) {
      await supabase.from("module_submissions").update({ scenario_id: scenarioId, dashboard_version: byId.get(scenarioId)!.version }).eq("id", subId);
    }
  }

  // Module 3: sections and learner cards
  const m3 = (subs ?? []).filter((s) => s.module === 3 && s.try_no === 1);
  const { data: sections } = await supabase.from("sections").select("id, priority").eq("active", true);
  const open3 = m3.filter((s) => !s.section_id);
  if (open3.length && sections?.length) {
    const taken = new Set(m3.map((s) => s.section_id).filter(Boolean));
    const free = sections.filter((s) => !taken.has(s.id));
    const out = assignSections(open3.map((s) => s.id), free.length >= open3.length ? free : sections);
    for (const [subId, sectionId] of Object.entries(out)) {
      await supabase.from("module_submissions").update({ section_id: sectionId }).eq("id", subId);
    }
  }
  if (m3.length >= 2) {
    const { count } = await supabase.from("card_assignments").select("id", { count: "exact", head: true }).in("submission_id", m3.map((s) => s.id));
    if (!count) {
      const { data: cards } = await supabase.from("learner_cards").select("id, plays_during");
      const presenterBySub = new Map(m3.map((s) => [s.id, attemptById.get(s.attempt_id)!.facilitator_id]));
      const subByPresenter = new Map([...presenterBySub].map(([sub, f]) => [f, sub]));
      const rows = assignCards([...subByPresenter.keys()], (cards ?? []).map((c) => ({ id: c.id, playsDuring: c.plays_during })));
      await supabase.from("card_assignments").insert(
        rows.map((r) => ({ submission_id: subByPresenter.get(r.presenterId)!, card_id: r.cardId, peer_id: r.peerId })),
      );
    }
  } else if (m3.length === 1) {
    warnings.push("Learner cards need at least two facilitators in the cohort.");
  }

  revalidatePath(`/admin/cohorts/${cohortId}`);
  redirect(`/admin/cohorts/${cohortId}${warnings.length ? `?warnings=${encodeURIComponent(warnings.join("\n"))}` : ""}`);
}

/** Manual override of a single assignment. */
export async function overrideAssignment(cohortId: string, submissionId: string, formData: FormData) {
  const { supabase } = await requireRole("admin");
  const value = str(formData, "value") || null;
  const { data: s } = await supabase.from("module_submissions").select("module, status").eq("id", submissionId).single();
  if (!s || s.status !== "assigned") return;
  if (s.module === 3) {
    await supabase.from("module_submissions").update({ section_id: value }).eq("id", submissionId);
  } else {
    const { data: sc } = value ? await supabase.from("scenarios").select("version").eq("id", value).single() : { data: null };
    await supabase.from("module_submissions").update({ scenario_id: value, dashboard_version: sc?.version ?? "A" }).eq("id", submissionId);
  }
  revalidatePath(`/admin/cohorts/${cohortId}`);
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export async function inviteUser(formData: FormData) {
  const { profile } = await requireRole("admin");
  const email = str(formData, "email").toLowerCase();
  const role = str(formData, "role") as Role;
  const region = str(formData, "region") || null;
  const fullName = str(formData, "full_name") || null;
  if (!["facilitator", "grader", "admin", "leader"].includes(role)) throw new Error("Invalid role");

  const admin = createAdminClient();
  // Lets invited people in even when sign-ups are limited to work email domains.
  await admin.from("signup_allowlist").upsert({ email, added_by: profile.id });
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${siteUrl()}/auth/confirm`,
  });
  if (error) redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
  await admin.auth.admin.updateUserById(data.user.id, { app_metadata: { role, region } });
  await admin.from("profiles").upsert({ id: data.user.id, email, full_name: fullName, role, region });
  revalidatePath("/admin/users");
  redirect(`/admin/users?invited=${encodeURIComponent(email)}`);
}

export async function updateUser(userId: string, formData: FormData) {
  const { supabase } = await requireRole("admin");
  const role = str(formData, "role") as Role;
  const region = str(formData, "region") || null;
  const { error } = await supabase
    .from("profiles")
    .update({ role, region, full_name: str(formData, "full_name") || null })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  await createAdminClient().auth.admin.updateUserById(userId, { app_metadata: { role, region } });
  revalidatePath("/admin/users");
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export async function saveTimers(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const n = (k: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(formData.get(k)))));
  await supabase.from("settings").upsert({
    key: "timers",
    value: {
      m1_dashboard_sec: n("m1_dashboard_min", 1, 60) * 60,
      m1_readout_sec: n("m1_readout_min", 1, 30) * 60,
      m2_debrief_sec: n("m2_debrief_min", 1, 90) * 60,
      grace_sec: n("grace_sec", 0, 120),
      m2_max_plays: n("m2_max_plays", 1, 5),
    },
    updated_at: new Date().toISOString(),
  });
  revalidatePath("/admin/settings");
}

export async function saveSignupDomains(formData: FormData) {
  const { supabase } = await requireRole("admin");
  const allowed = str(formData, "allowed_domains")
    .split(/[\s,;]+/)
    .map((d) => d.toLowerCase().replace(/^@/, ""))
    .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d));
  await supabase.from("settings").upsert({ key: "signup", value: { allowed_domains: allowed }, updated_at: new Date().toISOString() });
  revalidatePath("/admin/settings");
}

export async function saveDimension(id: number, formData: FormData) {
  const { supabase } = await requireRole("admin");
  await supabase
    .from("dimensions")
    .update({
      name: str(formData, "name"),
      level_1: str(formData, "level_1"),
      level_2: str(formData, "level_2"),
      level_3: str(formData, "level_3"),
      level_4: str(formData, "level_4"),
    })
    .eq("id", id);
  revalidatePath("/admin/settings");
}
