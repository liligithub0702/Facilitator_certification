import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { MODULE_NAMES, OUTCOME_LABELS, RED_FLAGS, type ModuleNo, type Outcome } from "@/lib/rules";

const Item = z.object({
  text: z.string().describe("One or two sentences for a senior reader."),
  evidence: z.string().describe("The observed behaviour from grader notes that supports it, with module and timestamp where given."),
});

const SummarySchema = z.object({
  outcome: Item,
  programs: Item,
  strength_1: Item,
  strength_2: Item,
  development_1: Item,
  development_2: Item,
  next_step: Item,
});

const SYSTEM = `You draft executive summaries of facilitator re-certification results for regional leaders at a contact-centre business.
A grader will review and edit your draft before any leader sees it.

Write from the scores and grader notes only. Every point must cite evidence that appears in the notes; never invent behaviour, numbers or timestamps.
If the notes do not support a second strength or development area, say so plainly in that field rather than padding.
Describe observed behaviour, not personality. Keep each field short, specific and neutral in tone.
"programs" names the program(s) the facilitator is or is not certified to deliver.
"next_step" is one concrete recommendation (e.g. certify and schedule first delivery, or the development focus before reassessment).`;

/**
 * Drafts the exec summary for an attempt from its scores and grader notes and saves it as a
 * draft. Runs with the grader's RLS-scoped client, so it can only read cohorts they grade.
 */
export async function draftExecSummary(attemptId: string) {
  const supabase = await createClient();

  const { data: attempt } = await supabase
    .from("attempts")
    .select("id, profiles(full_name, email, region), cohorts(name, programs(name))")
    .eq("id", attemptId)
    .single();
  if (!attempt) throw new Error("Attempt not found.");

  const [{ data: subs }, { data: outcome }, { data: dims }] = await Promise.all([
    supabase
      .from("module_submissions")
      .select("id, module, try_no, result, scenarios(title), sections(title), gradings(is_calibration, submitted_at, readout_scores, scores(dimension_id, level, evidence), red_flags(code, note))")
      .eq("attempt_id", attemptId)
      .order("module")
      .order("try_no"),
    supabase.from("outcomes").select("outcome, development_plan").eq("attempt_id", attemptId).maybeSingle(),
    supabase.from("dimensions").select("id, name"),
  ]);
  const dimName = (id: number) => dims?.find((d) => d.id === id)?.name ?? `Dimension ${id}`;

  const person = attempt.profiles as unknown as { full_name: string | null; email: string; region: string | null };
  const cohort = attempt.cohorts as unknown as { name: string; programs: { name: string } };

  const lines: string[] = [
    `Facilitator: ${person.full_name ?? person.email} (${person.region ?? "region not set"})`,
    `Program: ${cohort.programs.name}; cohort ${cohort.name}`,
    `Outcome set by grader: ${outcome ? OUTCOME_LABELS[outcome.outcome as Outcome] : "not yet set"}`,
  ];
  if (outcome?.development_plan) lines.push(`Development plan: ${outcome.development_plan}`);

  for (const s of subs ?? []) {
    const m = s.module as ModuleNo;
    const what = (s.scenarios as unknown as { title: string } | null)?.title ?? (s.sections as unknown as { title: string } | null)?.title ?? "";
    lines.push("", `## Module ${m} ${MODULE_NAMES[m]}${s.try_no > 1 ? ` (try ${s.try_no})` : ""}: ${s.result ?? "not graded"}${what ? ` — ${what}` : ""}`);
    type G = { is_calibration: boolean; submitted_at: string | null; readout_scores: Record<string, number>; scores: { dimension_id: number; level: number; evidence: string | null }[]; red_flags: { code: string; note: string | null }[] };
    const g = (s.gradings as unknown as G[]).find((x) => !x.is_calibration && x.submitted_at);
    if (!g) continue;
    for (const sc of [...g.scores].sort((a, b) => a.dimension_id - b.dimension_id)) {
      lines.push(`- ${dimName(sc.dimension_id)}: ${sc.level}/4. Evidence: ${sc.evidence ?? "(no note)"}`);
    }
    if (m === 1 && g.readout_scores) {
      const r = g.readout_scores;
      lines.push(`- Readout: ${(r.observations ?? 0) + (r.hypothesis ?? 0) + (r.questions ?? 0)}/6`);
    }
    for (const f of g.red_flags) {
      lines.push(`- Red flag: ${RED_FLAGS[m].find((d) => d.code === f.code)?.label ?? f.code}${f.note ? ` (${f.note})` : ""}`);
    }
  }

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: process.env.EXEC_SUMMARY_MODEL ?? "claude-opus-5-5",
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: "user", content: `Draft the executive summary from these results.\n\n${lines.join("\n")}` }],
    output_config: { effort: "medium", format: zodOutputFormat(SummarySchema) },
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error("The draft could not be generated. Write the summary by hand.");
  }

  const { error } = await supabase.from("exec_summaries").upsert({
    attempt_id: attemptId,
    content: response.parsed_output,
    status: "draft",
    generated_by_ai: true,
    approved_by: null,
    approved_at: null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}
