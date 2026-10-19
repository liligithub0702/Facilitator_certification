"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { draftExecSummary } from "@/lib/exec-summary";
import { evaluateModule, maxLevel, tallyAnswerKey, type ModuleNo, type Outcome, type PassStandard } from "@/lib/rules";
import type { AnswerKeyItem, ExecSummaryContent } from "@/lib/types";

export type GradingInput = {
  scores: Record<number, { level?: number; evidence?: string }>;
  readout: { observations?: number; hypothesis?: number; questions?: number };
  hits: string[];
  redFlags: string[];
  submit: boolean;
};

export async function saveGrading(submissionId: string, input: GradingInput) {
  const { supabase, profile } = await requireRole("grader", "admin");

  // RLS returns the submission only if this grader is assigned to its cohort.
  const { data: sub } = await supabase
    .from("module_submissions")
    .select("id, module, scenario_id, attempt_id, status")
    .eq("id", submissionId)
    .single();
  if (!sub) return { error: "Submission not found or not in your cohorts." };
  const mod = sub.module as ModuleNo;

  const { data: dims } = await supabase.from("module_dimensions").select("dimension_id, weight").eq("module", mod);
  const allowed = new Set((dims ?? []).map((d) => d.dimension_id as number));
  const primary = (dims ?? []).filter((d) => d.weight === "primary").map((d) => d.dimension_id as number);

  let answerKey: { tally: ReturnType<typeof tallyAnswerKey>; standard: PassStandard } | undefined;
  if (mod === 2 && sub.scenario_id) {
    const [{ data: items }, { data: scenario }] = await Promise.all([
      supabase.from("answer_key_items").select("id, kind").eq("scenario_id", sub.scenario_id).returns<Pick<AnswerKeyItem, "id" | "kind">[]>(),
      supabase.from("scenarios").select("brief").eq("id", sub.scenario_id).single(),
    ]);
    const standard = (scenario?.brief as { pass_standard?: PassStandard })?.pass_standard ?? { critical: 1, clear: 0, subtle: 0, effective: 0 };
    answerKey = { tally: tallyAnswerKey(items ?? [], input.hits), standard };
  }

  const scores: Record<number, number | undefined> = {};
  for (const [k, v] of Object.entries(input.scores)) {
    const d = Number(k);
    if (allowed.has(d) && v.level) scores[d] = Math.min(Math.max(1, v.level), maxLevel(mod, d, input.redFlags));
  }
  const evaluation = evaluateModule({ module: mod, primaryDimensions: primary, scores, redFlags: input.redFlags, answerKey });
  if (input.submit && evaluation.result === null) return { error: evaluation.reasons.join("; ") };

  // One grading per grader per submission. A second grader's grading is a calibration grading.
  const { data: existing } = await supabase.from("gradings").select("id, grader_id, is_calibration").eq("submission_id", submissionId);
  const mine = existing?.find((g) => g.grader_id === profile.id);
  const isCalibration = mine ? mine.is_calibration : (existing ?? []).some((g) => !g.is_calibration);

  const clamp02 = (n?: number) => (n == null ? undefined : Math.min(2, Math.max(0, Math.round(n))));
  const row = {
    submission_id: submissionId,
    grader_id: profile.id,
    is_calibration: isCalibration,
    readout_scores: { observations: clamp02(input.readout.observations), hypothesis: clamp02(input.readout.hypothesis), questions: clamp02(input.readout.questions) },
    answer_key_hits: input.hits,
    computed_result: evaluation.result,
    submitted_at: input.submit ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const { data: grading, error } = mine
    ? await supabase.from("gradings").update(row).eq("id", mine.id).select("id").single()
    : await supabase.from("gradings").insert(row).select("id").single();
  if (error || !grading) return { error: error?.message ?? "Could not save grading." };

  await supabase.from("scores").delete().eq("grading_id", grading.id);
  const scoreRows = Object.entries(input.scores)
    .filter(([k, v]) => allowed.has(Number(k)) && v.level)
    .map(([k, v]) => ({ grading_id: grading.id, dimension_id: Number(k), level: scores[Number(k)]!, evidence: v.evidence?.slice(0, 1000) ?? null }));
  if (scoreRows.length) {
    const { error: e } = await supabase.from("scores").insert(scoreRows);
    if (e) return { error: e.message };
  }

  await supabase.from("red_flags").delete().eq("grading_id", grading.id);
  const flags = [...new Set([...input.redFlags, ...evaluation.autoRedFlags])];
  if (flags.length) {
    const { error: e } = await supabase.from("red_flags").insert(flags.map((code) => ({ grading_id: grading.id, code })));
    if (e) return { error: e.message };
  }

  // The primary grading sets the module result; calibration gradings never do.
  if (input.submit && !isCalibration) {
    const { error: e } = await supabase
      .from("module_submissions")
      .update({ result: evaluation.result, status: "graded", result_set_at: new Date().toISOString() })
      .eq("id", submissionId);
    if (e) return { error: e.message };
  }

  revalidatePath(`/grader/submission/${submissionId}`);
  revalidatePath("/grader");
  return { result: evaluation.result, reasons: evaluation.reasons, isCalibration };
}

export async function addRecording(submissionId: string, formData: FormData) {
  const { supabase, profile } = await requireRole("grader", "admin");
  const url = String(formData.get("url") ?? "").trim();
  if (!/^https:\/\//i.test(url)) throw new Error("Recording link must start with https://");
  const { error } = await supabase.from("recordings").insert({
    submission_id: submissionId,
    url,
    label: String(formData.get("label") ?? "").trim() || "Teams recording",
    added_by: profile.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/grader/submission/${submissionId}`);
}

export async function removeRecording(submissionId: string, recordingId: string) {
  const { supabase } = await requireRole("grader", "admin");
  await supabase.from("recordings").delete().eq("id", recordingId);
  revalidatePath(`/grader/submission/${submissionId}`);
}

export async function setSession(submissionId: string, formData: FormData) {
  const { supabase } = await requireRole("grader", "admin");
  const at = String(formData.get("session_at") ?? "");
  const tz = Number(formData.get("tz_offset") ?? 0);
  const iso = at ? new Date(new Date(`${at}:00Z`).getTime() + tz * 60_000).toISOString() : null;
  await supabase.from("module_submissions").update({ session_at: iso }).eq("id", submissionId);
  revalidatePath(`/grader/submission/${submissionId}`);
}

export async function setOutcome(attemptId: string, formData: FormData) {
  const { supabase, profile } = await requireRole("grader", "admin");
  const outcome = String(formData.get("outcome")) as Outcome;
  const { error } = await supabase.from("outcomes").upsert({
    attempt_id: attemptId,
    outcome,
    development_plan: String(formData.get("development_plan") ?? "") || null,
    reassess_by: String(formData.get("reassess_by") ?? "") || null,
    feedback: String(formData.get("feedback") ?? "") || null,
    set_by: profile.id,
    set_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/grader/attempt/${attemptId}`);
}

export async function generateExecSummary(attemptId: string) {
  await requireRole("grader", "admin");
  try {
    await draftExecSummary(attemptId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not draft the summary." };
  }
  revalidatePath(`/grader/attempt/${attemptId}`);
  return {};
}

export async function saveExecSummary(attemptId: string, content: ExecSummaryContent, approve: boolean) {
  const { supabase, profile } = await requireRole("grader", "admin");
  const { error } = await supabase.from("exec_summaries").upsert({
    attempt_id: attemptId,
    content,
    status: approve ? "approved" : "draft",
    approved_by: approve ? profile.id : null,
    approved_at: approve ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  revalidatePath(`/grader/attempt/${attemptId}`);
  return {};
}
