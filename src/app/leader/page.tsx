import { StatusBadge } from "@/components/AppShell";
import { PrintButton } from "@/components/PrintButton";
import { requireRole } from "@/lib/auth";
import { OUTCOME_LABELS, type Outcome } from "@/lib/rules";
import { REGIONS, type ExecSummaryContent } from "@/lib/types";

type OverviewRow = {
  attempt_id: string;
  facilitator_name: string | null;
  email: string;
  region: string | null;
  program: string;
  cohort: string;
  m1: string | null;
  m2: string | null;
  m3: string | null;
  outcome: Outcome;
};

export default async function LeaderOverview({ searchParams }: PageProps<"/leader">) {
  const { supabase } = await requireRole("leader", "admin");
  const { region } = await searchParams;

  const [{ data: rows }, { data: dims }, { data: summaries }] = await Promise.all([
    supabase.rpc("leader_overview"),
    supabase.rpc("dimension_averages"),
    supabase.from("exec_summaries").select("attempt_id, content, approved_at").eq("status", "approved"),
  ]);
  const all = (rows ?? []) as OverviewRow[];
  const list = typeof region === "string" && region ? all.filter((r) => r.region === region) : all;
  const counts = (Object.keys(OUTCOME_LABELS) as Outcome[]).map((o) => ({ o, n: list.filter((r) => r.outcome === o).length }));
  const averages = (dims ?? []) as { dimension_id: number; name: string; avg_level: number | null; n: number }[];
  const summaryFor = new Map((summaries ?? []).map((s) => [s.attempt_id, s.content as ExecSummaryContent]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h1">Certification overview</h1>
          <p className="muted">Q4 2026 cycle · closes 31 December 2026 · generated {new Date().toLocaleDateString("en-GB")}</p>
        </div>
        <div className="flex gap-2">
          <form className="no-print flex gap-2">
            <select name="region" defaultValue={typeof region === "string" ? region : ""} className="input">
              <option value="">All regions</option>
              {REGIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
            <button className="btn">Filter</button>
          </form>
          <PrintButton />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {counts.map(({ o, n }) => (
          <div key={o} className="card">
            <div className="muted">{OUTCOME_LABELS[o]}</div>
            <div className="text-3xl font-semibold">{n}</div>
          </div>
        ))}
      </div>

      <section className="card overflow-x-auto">
        <h2 className="h2 mb-2">Status by facilitator</h2>
        <table className="table">
          <thead><tr><th>Facilitator</th><th>Region</th><th>Program</th><th>Cohort</th><th>M1</th><th>M2</th><th>M3</th><th>Outcome</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.attempt_id}>
                <td>{r.facilitator_name ?? r.email}</td>
                <td>{r.region ?? "—"}</td>
                <td>{r.program}</td>
                <td>{r.cohort}</td>
                <td><StatusBadge value={r.m1} /></td>
                <td><StatusBadge value={r.m2} /></td>
                <td><StatusBadge value={r.m3} /></td>
                <td><StatusBadge value={r.outcome} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 className="h2 mb-1">Average score per dimension</h2>
        <p className="muted mb-3">All regions, primary gradings only. 3 = meets standard. Shows residual capability gaps.</p>
        <div className="space-y-2">
          {averages.map((d) => (
            <div key={d.dimension_id} className="flex items-center gap-3 text-sm">
              <span className="w-64 shrink-0">{d.name}</span>
              <div className="relative h-4 flex-1 rounded bg-background">
                <div className={`h-4 rounded ${d.avg_level != null && d.avg_level < 3 ? "bg-warn" : "bg-accent"}`} style={{ width: `${((d.avg_level ?? 0) / 4) * 100}%` }} />
                <div className="absolute top-0 h-4 border-l-2 border-dashed border-muted" style={{ left: "75%" }} />
              </div>
              <span className="w-24 text-right">{d.avg_level ?? "—"} <span className="muted">(n={d.n})</span></span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="h2">Exec summaries</h2>
        {list.filter((r) => summaryFor.has(r.attempt_id)).length === 0 && <p className="muted">No approved summaries yet.</p>}
        {list.filter((r) => summaryFor.has(r.attempt_id)).map((r) => {
          const c = summaryFor.get(r.attempt_id)!;
          const items: [string, keyof ExecSummaryContent][] = [
            ["Outcome", "outcome"], ["Program(s)", "programs"], ["Strength", "strength_1"], ["Strength", "strength_2"],
            ["Development area", "development_1"], ["Development area", "development_2"], ["Next step", "next_step"],
          ];
          return (
            <article key={r.attempt_id} className="card">
              <h3 className="font-semibold">{r.facilitator_name ?? r.email} <span className="muted">· {r.region}</span></h3>
              <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
                {items.map(([label, key]) => (
                  <div key={key} className="contents">
                    <dt className="font-medium">{label}</dt>
                    <dd>{c[key]?.text}{c[key]?.evidence && <span className="muted block">Evidence: {c[key].evidence}</span>}</dd>
                  </div>
                ))}
              </dl>
            </article>
          );
        })}
      </section>
    </div>
  );
}
