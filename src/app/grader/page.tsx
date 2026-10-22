import Link from "next/link";
import { PageHeader, StatusBadge } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";
import { MODULE_NAMES, type ModuleNo } from "@/lib/rules";

type Row = {
  id: string;
  module: ModuleNo;
  try_no: number;
  status: string;
  result: string | null;
  submitted_at: string | null;
  attempt_id: string;
  attempts: {
    facilitator_id: string;
    profiles: { full_name: string | null; email: string; region: string | null };
    cohorts: { id: string; name: string; region: string | null };
  };
  gradings: { grader_id: string; is_calibration: boolean; submitted_at: string | null }[];
};

export default async function GraderQueue({ searchParams }: PageProps<"/grader">) {
  const { supabase, profile } = await requireRole("grader", "admin");
  const sp = await searchParams;
  const moduleFilter = typeof sp.module === "string" ? Number(sp.module) : undefined;
  const cohortFilter = typeof sp.cohort === "string" ? sp.cohort : undefined;
  const regionFilter = typeof sp.region === "string" ? sp.region : undefined;
  const statusFilter = typeof sp.status === "string" ? sp.status : "open";

  let q = supabase
    .from("module_submissions")
    .select(
      "id, module, try_no, status, result, submitted_at, attempt_id, attempts!inner(facilitator_id, profiles(full_name, email, region), cohorts!inner(id, name, region)), gradings(grader_id, is_calibration, submitted_at)",
    )
    .order("submitted_at", { ascending: true, nullsFirst: false });
  if (moduleFilter) q = q.eq("module", moduleFilter);
  if (cohortFilter) q = q.eq("attempts.cohort_id", cohortFilter);
  if (regionFilter) q = q.eq("attempts.cohorts.region", regionFilter);
  if (statusFilter === "open") q = q.in("status", ["submitted", "in_progress", "assigned"]);
  else if (statusFilter !== "all") q = q.eq("status", statusFilter);
  const { data } = await q.returns<Row[]>();
  const rows = data ?? [];

  const { data: cohorts } = await supabase.from("cohorts").select("id, name").order("week_start");

  // Calibration: each grader's first two primary gradings get an independent second grading.
  const { data: allGradings } = await supabase
    .from("gradings")
    .select("grader_id, submission_id, is_calibration, submitted_at")
    .not("submitted_at", "is", null)
    .order("submitted_at");
  const firstTwo = new Set<string>();
  const perGrader = new Map<string, number>();
  for (const g of allGradings ?? []) {
    if (g.is_calibration) continue;
    const n = perGrader.get(g.grader_id) ?? 0;
    if (n < 2) firstTwo.add(g.submission_id);
    perGrader.set(g.grader_id, n + 1);
  }

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Grading" title="Grading queue" sub="Submissions from the cohorts you are assigned to. Grade each module, then set the outcome." />
      <form className="flex flex-wrap items-end gap-3 text-sm">
        <label>Module
          <select name="module" defaultValue={moduleFilter ?? ""} className="input mt-1">
            <option value="">All</option>
            {[1, 2, 3].map((m) => <option key={m} value={m}>Module {m}</option>)}
          </select>
        </label>
        <label>Cohort
          <select name="cohort" defaultValue={cohortFilter ?? ""} className="input mt-1">
            <option value="">All</option>
            {(cohorts ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Region
          <select name="region" defaultValue={regionFilter ?? ""} className="input mt-1">
            <option value="">All</option>
            {["Philippines", "India", "Egypt", "Colombia"].map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label>Status
          <select name="status" defaultValue={statusFilter} className="input mt-1">
            <option value="open">Open</option>
            <option value="submitted">Submitted</option>
            <option value="graded">Graded</option>
            <option value="all">All</option>
          </select>
        </label>
        <button className="btn">Filter</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr><th>Facilitator</th><th>Region</th><th>Cohort</th><th>Module</th><th>Status</th><th>Result</th><th>Grading</th><th /></tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="muted py-6 text-center">Nothing here. You only see cohorts you are assigned to.</td></tr>
            )}
            {rows.map((r) => {
              const submitted = r.gradings.filter((g) => g.submitted_at);
              const mine = r.gradings.find((g) => g.grader_id === profile.id);
              const needsCalibration = firstTwo.has(r.id) && submitted.length < 2;
              return (
                <tr key={r.id}>
                  <td>{r.attempts.profiles.full_name ?? r.attempts.profiles.email}</td>
                  <td>{r.attempts.cohorts.region ?? r.attempts.profiles.region ?? "—"}</td>
                  <td>{r.attempts.cohorts.name}</td>
                  <td>M{r.module} {MODULE_NAMES[r.module]}{r.try_no > 1 ? ` (try ${r.try_no})` : ""}</td>
                  <td><StatusBadge value={r.status} /></td>
                  <td><StatusBadge value={r.result} /></td>
                  <td className="space-x-1">
                    {mine ? <span className="badge">{mine.submitted_at ? "you graded" : "your draft"}</span> : null}
                    {needsCalibration && <span className="badge border-warn text-warn">needs 2nd grading</span>}
                  </td>
                  <td className="space-x-3 whitespace-nowrap">
                    <Link className="underline" href={`/grader/submission/${r.id}`}>Grade</Link>
                    <Link className="underline" href={`/grader/attempt/${r.attempt_id}`}>Outcome</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
