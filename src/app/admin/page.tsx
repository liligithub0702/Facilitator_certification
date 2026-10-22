import { PageHeader } from "@/components/AppShell";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { REGIONS } from "@/lib/types";
import { createCohort } from "./actions";

export default async function AdminHome() {
  const { supabase } = await requireRole("admin");
  const { data: cohorts } = await supabase
    .from("cohorts")
    .select("id, name, region, week_start, teach_back_at, cohort_members(count), cohort_graders(count)")
    .order("week_start");

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Cohorts" sub="Groups of 3–4 facilitators who take the modules in the same week." />
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Cohort</th><th>Region</th><th>Week of</th><th>Facilitators</th><th>Graders</th></tr></thead>
          <tbody>
            {(cohorts ?? []).length === 0 && <tr><td colSpan={5} className="muted py-6 text-center">No cohorts yet.</td></tr>}
            {(cohorts ?? []).map((c) => (
              <tr key={c.id}>
                <td><Link className="underline" href={`/admin/cohorts/${c.id}`}>{c.name}</Link></td>
                <td>{c.region ?? "Mixed"}</td>
                <td>{c.week_start}</td>
                <td>{(c.cohort_members as unknown as { count: number }[])[0]?.count ?? 0}</td>
                <td>{(c.cohort_graders as unknown as { count: number }[])[0]?.count ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form action={createCohort} className="card grid gap-3 sm:grid-cols-4 sm:items-end">
        <h2 className="h2 sm:col-span-4">New cohort</h2>
        <label><span className="label">Name</span><input name="name" required className="input" placeholder="PH cohort 1" /></label>
        <label>
          <span className="label">Region</span>
          <select name="region" className="input"><option value="">Mixed</option>{REGIONS.map((r) => <option key={r}>{r}</option>)}</select>
        </label>
        <label><span className="label">Week starting</span><input name="week_start" type="date" required className="input" /></label>
        <button className="btn btn-primary">Create cohort</button>
        <p className="muted sm:col-span-4">Cohorts of 3–4. Cases are unique within a cohort week; schedule Module 3 cohorts from the week of 7 December.</p>
      </form>
    </div>
  );
}
