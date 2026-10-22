"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Thin wrappers over the SECURITY DEFINER functions in Postgres, which own every rule
// (consent, Module 2 gate, timers, replay limit). Nothing here trusts the browser's clock.

export async function acceptConsent(attemptId: string) {
  const { supabase } = await requireRole("facilitator");
  const { error } = await supabase.rpc("accept_consent", { p_attempt: attemptId });
  if (error) throw new Error(error.message);
  revalidatePath("/facilitator");
}

export async function startModule(submissionId: string) {
  const { supabase } = await requireRole("facilitator");
  const { error } = await supabase.rpc("start_module", { p_submission: submissionId });
  if (error) return { error: error.message };
  revalidatePath(`/facilitator/module/${submissionId}`);
  return {};
}

export async function advancePhase(submissionId: string) {
  const { supabase } = await requireRole("facilitator");
  const { error } = await supabase.rpc("advance_phase", { p_submission: submissionId });
  if (error) return { error: error.message };
  revalidatePath(`/facilitator/module/${submissionId}`);
  return {};
}

export async function saveResponse(submissionId: string, content: Record<string, string>, final: boolean) {
  const { supabase } = await requireRole("facilitator");
  const { data, error } = await supabase
    .rpc("save_response", { p_submission: submissionId, p_content: content, p_final: final })
    .single<{ status: string; phase: string }>();
  if (error) return { error: error.message };
  // The Module 1 coaching form is editable by phase alone (grading may already have started).
  const locked = data.phase === "documentation" ? false : data.status !== "in_progress";
  if (final || locked) revalidatePath(`/facilitator/module/${submissionId}`);
  return { status: data.status, locked };
}

export async function recordPlay(submissionId: string) {
  const { supabase } = await requireRole("facilitator");
  const { data, error } = await supabase
    .rpc("record_play", { p_submission: submissionId })
    .single<{ video_plays: number }>();
  if (error) return { error: error.message };
  return { plays: data.video_plays };
}

export async function addTag(submissionId: string, atSeconds: number, note: string) {
  const { supabase } = await requireRole("facilitator");
  const { data, error } = await supabase
    .rpc("add_tag", { p_submission: submissionId, p_at_seconds: atSeconds, p_note: note })
    .single<{ id: string; at_seconds: number; note: string }>();
  if (error) return { error: error.message };
  return { tag: data };
}

/** Signed URL for the assigned Module 2 recording, only while the module is in progress. */
export async function getVideoUrl(submissionId: string): Promise<string | null> {
  const { supabase } = await requireRole("facilitator");
  // RLS: returns a row only if this facilitator owns the submission.
  const { data: sub } = await supabase
    .from("module_submissions")
    .select("id, module, status, scenario_id")
    .eq("id", submissionId)
    .single();
  if (!sub || sub.module !== 2 || sub.status !== "in_progress" || !sub.scenario_id) return null;

  const admin = createAdminClient();
  const { data: scenario } = await admin.from("scenarios").select("video_path").eq("id", sub.scenario_id).single();
  if (!scenario?.video_path) return null;
  const { data } = await admin.storage.from("module2-recordings").createSignedUrl(scenario.video_path, 60 * 45);
  return data?.signedUrl ?? null;
}
