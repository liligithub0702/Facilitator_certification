import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/AppShell";
import { SessionInput } from "@/app/grader/submission/[id]/SessionInput";
import { requireRole } from "@/lib/auth";
import type { Profile } from "@/lib/types";
import { addGrader, addMember, autoAssign, createReassessment, overrideAssignment, removeGrader, removeMember, setTeachBack } from "../../actions";

type Sub = { id: string; module: number; try_no: number; status: string; result: string | null; scenario_id: string | null; section_id: string | null };

export default async function CohortPage({ params, searchParams }: PageProps<"/admin/cohorts/[id]">) {
  const { id } = await params;
  const { warnings } = await searchParams;
  const { supabase } = await requireRole("admin");

  const { data: cohort } = await supabase.from("cohorts").select("*").eq("id", id).single();
  if (!cohort) notFound();

  const [{ data: attempts }, { data: graders }, { data: people }, { data: scenarios }, { data: sections }, { data: cards }] = await Promise.all([
    supabase
      .from("attempts")
      .select("id, facilitator_id, consent_at, profiles(full_name, email, region), module_submissions(id, module, try_no, status, result, scenario_id, section_id)")
      .eq("cohort_id", id),
    supabase.from("cohort_graders").select("grader_id, profiles(full_name, email)").eq("cohort_id", id),
    supabase.from("profiles").select("*").in("role", ["facilitator", "grader"]).order("full_name").returns<Profile[]>(),
    supabase.from("scenarios").select("id, module, title").eq("active", true).order("module").order("family").order("version"),
    supabase.from("sections").select("id, title").eq("active", true),
    supabase.from("card_assignments").select("id, submission_id, learner_cards(name), profiles(full_name, email)"),
  ]);

  const memberIds = new Set((attempts ?? []).map((a) => a.facilitator_id));
  const graderIds = new Set((graders ?? []).map((g) => g.grader_id));
  const title = (sid: string | null) => scenarios?.find((s) => s.id === sid)?.title ?? sections?.find((s) => s.id === sid)?.title;

  return (
    <div className="space-y-6">
      <Link href="/admin" className="muted hover:underline">← Cohorts</Link>
      <div>
        <h1 className="h1">{cohort.name}</h1>
        <p className="muted">{cohort.region ?? "Mixed regions"} · week of {cohort.week_start}</p>
      </div>
      {typeof warnings === "string" && (
        <div className="rounded-md border border-warn px-3 py-2 text-sm text-warn whitespace-pre-wrap">{warnings}</div>
      )}

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="h2">Facilitators and assignments</h2>
          <form action={autoAssign.bind(null, id)}><button className="btn btn-primary">Auto-assign open items</button></form>
        </div>
        <p className="muted">
          Rules: no repeated case within the cohort week, at least one in three per region on Case 3, reassessments on Version B or the spare,
          Module 2 recordings alternate, two learner cards per teach-back.
        </p>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Facilitator</th><th>Consent</th><th>Module</th><th>Assignment</th><th>Status</th><th /></tr></thead>
            <tbody>
              {(attempts ?? []).flatMap((a) => {
                const p = a.profiles as unknown as { full_name: string | null; email: string; region: string | null };
                const subs = ([...(a.module_submissions as unknown as Sub[])]).sort((x, y) => x.module - y.module || x.try_no - y.try_no);
                return subs.map((s, i) => (
                  <tr key={s.id}>
                    <td>
                      {i === 0 && (
                        <>
                          <div>{p.full_name ?? p.email}</div>
                          <div className="muted">{p.region ?? "—"}</div>
                          <form action={removeMember.bind(null, id, a.facilitator_id)}>
                            <button className="mt-1 text-xs text-danger" title="Deletes this facilitator's attempt, submissions and grades">remove</button>
                          </form>
                        </>
                      )}
                    </td>
                    <td>{i === 0 ? (a.consent_at ? "✓" : "—") : ""}</td>
                    <td>M{s.module}{s.try_no > 1 ? ` try ${s.try_no}` : ""}</td>
                    <td>
                      {s.status === "assigned" ? (
                        <form
                          key={`${s.id}:${s.scenario_id ?? s.section_id ?? ""}`} // remount so the select shows fresh server values
                          action={overrideAssignment.bind(null, id, s.id)}
                          className="flex gap-1"
                        >
                          <select name="value" defaultValue={(s.module === 3 ? s.section_id : s.scenario_id) ?? ""} className="input">
                            <option value="">— unassigned —</option>
                            {s.module === 3
                              ? sections?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)
                              : scenarios?.filter((x) => x.module === s.module).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
                          </select>
                          <button className="btn">Set</button>
                        </form>
                      ) : (
                        title(s.module === 3 ? s.section_id : s.scenario_id) ?? "—"
                      )}
                      {s.module === 3 && (
                        <ul className="muted mt-1 text-xs">
                          {cards?.filter((c) => c.submission_id === s.id).map((c) => {
                            const peer = c.profiles as unknown as { full_name: string | null; email: string };
                            return <li key={c.id}>{(c.learner_cards as unknown as { name: string }).name} → {peer.full_name ?? peer.email}</li>;
                          })}
                        </ul>
                      )}
                    </td>
                    <td><StatusBadge value={s.result ?? s.status} /></td>
                    <td>
                      {s.result === "not_passed" && s.try_no === 1 && !subs.some((o) => o.module === s.module && o.try_no === 2) && (
                        <form action={createReassessment.bind(null, id, s.id)}><button className="btn">Open reassessment</button></form>
                      )}
                    </td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
        <form action={addMember.bind(null, id)} className="flex flex-wrap gap-2">
          <select name="facilitator_id" className="input max-w-sm" required defaultValue="">
            <option value="" disabled>Add facilitator…</option>
            {people?.filter((p) => p.role === "facilitator" && !memberIds.has(p.id)).map((p) => (
              <option key={p.id} value={p.id}>{p.full_name ?? p.email} ({p.region ?? "no region"})</option>
            ))}
          </select>
          <button className="btn">Add</button>
        </form>
      </section>

      <section className="card space-y-3">
        <h2 className="h2">Graders</h2>
        <ul className="space-y-1 text-sm">
          {(graders ?? []).map((g) => {
            const p = g.profiles as unknown as { full_name: string | null; email: string };
            return (
              <li key={g.grader_id} className="flex items-center gap-2">
                {p.full_name ?? p.email}
                <form action={removeGrader.bind(null, id, g.grader_id)}><button className="text-xs text-danger">remove</button></form>
              </li>
            );
          })}
        </ul>
        <form action={addGrader.bind(null, id)} className="flex flex-wrap gap-2">
          <select name="grader_id" className="input max-w-sm" required defaultValue="">
            <option value="" disabled>Assign grader…</option>
            {people?.filter((p) => p.role === "grader" && !graderIds.has(p.id)).map((p) => (
              <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
            ))}
          </select>
          <button className="btn">Assign</button>
        </form>
        <p className="muted">Assign two graders so each grader&apos;s first two facilitators can be double-graded for calibration.</p>
      </section>

      <section className="card space-y-2">
        <h2 className="h2">Module 3 teach-back session</h2>
        <SessionInput action={setTeachBack.bind(null, id)} value={cohort.teach_back_at} name="teach_back_at" label="Teach-back date and time" />
        <p className="muted">Sections must be assigned at least 5 working days before this date.</p>
      </section>
    </div>
  );
}
