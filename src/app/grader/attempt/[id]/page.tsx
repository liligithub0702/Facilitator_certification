import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";
import { computeOutcome, DOC_RUBRIC, MODULE_NAMES, OUTCOME_LABELS, PREP_RUBRIC, rubricTotal, type ModuleNo, type Outcome } from "@/lib/rules";
import type { ExecSummaryContent, OutcomeRow } from "@/lib/types";
import { setOutcome } from "../../actions";
import { ExecSummaryEditor } from "./ExecSummaryEditor";

type Sub = {
  id: string;
  module: ModuleNo;
  try_no: number;
  status: string;
  result: "passed" | "not_passed" | null;
  gradings: { is_calibration: boolean; submitted_at: string | null; readout_scores: Record<string, number>; red_flags: { code: string }[] }[];
};

export default async function AttemptPage({ params }: PageProps<"/grader/attempt/[id]">) {
  const { id } = await params;
  const { supabase } = await requireRole("grader", "admin");

  const { data: attempt } = await supabase
    .from("attempts")
    .select("id, profiles(full_name, email, region), cohorts(name)")
    .eq("id", id)
    .single();
  if (!attempt) notFound();
  const person = attempt.profiles as unknown as { full_name: string | null; email: string; region: string | null };

  const [{ data: subs }, { data: outcome }, { data: summary }] = await Promise.all([
    supabase
      .from("module_submissions")
      .select("id, module, try_no, status, result, gradings(is_calibration, submitted_at, readout_scores, red_flags(code))")
      .eq("attempt_id", id)
      .order("module")
      .order("try_no")
      .returns<Sub[]>(),
    supabase.from("outcomes").select("*").eq("attempt_id", id).maybeSingle<OutcomeRow>(),
    supabase.from("exec_summaries").select("content, status").eq("attempt_id", id).maybeSingle(),
  ]);

  const primaryGradings = (subs ?? []).flatMap((s) => s.gradings.filter((g) => !g.is_calibration && g.submitted_at));
  const openRedFlag = primaryGradings.some((g) => g.red_flags.length > 0);
  const suggested = computeOutcome(
    (subs ?? []).map((s) => ({ module: s.module, tryNo: s.try_no, result: s.result })),
    openRedFlag,
  );
  const m1 = (subs ?? []).filter((s) => s.module === 1).at(-1);
  const m1Readout = m1?.gradings.find((g) => !g.is_calibration && g.submitted_at)?.readout_scores;
  const prep = m1Readout ? rubricTotal(m1Readout, PREP_RUBRIC) : null;
  const doc = m1Readout ? rubricTotal(m1Readout, DOC_RUBRIC) : null;

  return (
    <div className="space-y-6">
      <Link href="/grader" className="muted hover:underline">← Queue</Link>
      <div>
        <h1 className="h1">{person.full_name ?? person.email}</h1>
        <p className="muted">{(attempt.cohorts as unknown as { name: string }).name} · {person.region ?? "—"}</p>
      </div>

      <section className="card">
        <h2 className="h2 mb-2">Modules</h2>
        <table className="table">
          <thead><tr><th>Module</th><th>Try</th><th>Status</th><th>Result</th><th /></tr></thead>
          <tbody>
            {(subs ?? []).map((s) => (
              <tr key={s.id}>
                <td>M{s.module} {MODULE_NAMES[s.module]}</td>
                <td>{s.try_no}</td>
                <td><StatusBadge value={s.status} /></td>
                <td><StatusBadge value={s.result} /></td>
                <td><Link className="underline" href={`/grader/submission/${s.id}`}>Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {(prep?.complete || doc?.complete) && (
          <p className="mt-2 text-sm">
            Module 1 written work:{" "}
            {prep?.complete && <>preparation {prep.total}/{prep.max}{prep.developmentArea ? " (development area)" : ""}</>}
            {prep?.complete && doc?.complete && " · "}
            {doc?.complete && <>coaching form {doc.total}/{doc.max}{doc.developmentArea ? " (development area)" : ""}</>}
            <span className="muted"> · scored separately; does not fail the module on its own</span>
          </p>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="h2">Outcome</h2>
        <p className="text-sm">
          Suggested by the rules: <strong>{OUTCOME_LABELS[suggested]}</strong>
          {openRedFlag ? " (a red flag is recorded)" : ""}
        </p>
        <form action={setOutcome.bind(null, id)} className="space-y-3">
          <div>
            <label className="label" htmlFor="outcome">Outcome</label>
            <select id="outcome" name="outcome" defaultValue={outcome?.outcome ?? suggested} className="input max-w-xs">
              {(Object.keys(OUTCOME_LABELS) as Outcome[]).map((o) => <option key={o} value={o}>{OUTCOME_LABELS[o]}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="feedback">Written feedback for the facilitator</label>
            <textarea id="feedback" name="feedback" className="input min-h-24" defaultValue={outcome?.feedback ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="development_plan">Development plan</label>
            <textarea id="development_plan" name="development_plan" className="input min-h-20" defaultValue={outcome?.development_plan ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="reassess_by">Reassess by (within 4 weeks for Development Required)</label>
            <input id="reassess_by" name="reassess_by" type="date" className="input max-w-xs" defaultValue={outcome?.reassess_by ?? ""} />
          </div>
          <button className="btn btn-primary">Save outcome</button>
          <p className="muted">The facilitator sees the outcome, feedback and development plan as soon as you save.</p>
        </form>
      </section>

      <section className="card space-y-3">
        <h2 className="h2">Exec summary</h2>
        <p className="muted">Fixed structure: outcome, certified program(s), two strengths, two development areas, recommended next step, each with evidence. Leaders see it only after you approve.</p>
        <ExecSummaryEditor
          attemptId={id}
          initial={(summary?.content as ExecSummaryContent) ?? null}
          status={(summary?.status as "draft" | "approved") ?? null}
          aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
        />
      </section>
    </div>
  );
}
