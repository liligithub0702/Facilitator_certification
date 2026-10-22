import { PageHeader } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AnswerKeyItem, Scenario } from "@/lib/types";

export default async function ScenarioLibrary() {
  const { supabase } = await requireRole("admin");
  const [{ data: scenarios }, { data: keys }, { data: sections }, { data: cards }] = await Promise.all([
    supabase.from("scenarios").select("*").order("module").order("family").order("version").returns<Scenario[]>(),
    supabase.from("answer_key_items").select("*").order("sort").returns<AnswerKeyItem[]>(),
    supabase.from("sections").select("*").order("priority", { ascending: false }),
    supabase.from("learner_cards").select("*"),
  ]);

  let uploaded = new Set<string>();
  try {
    const { data: files } = await createAdminClient().storage.from("module2-recordings").list("", { limit: 100 });
    uploaded = new Set((files ?? []).map((f) => f.name));
  } catch {
    // Secret key not configured: show paths without upload status.
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Scenario library" />
      <p className="muted">
        Grader-only content. Edit wording in the Supabase table editor (tables <code>scenarios</code>, <code>answer_key_items</code>,{" "}
        <code>sections</code>, <code>learner_cards</code>) or via a new migration so changes are versioned.
      </p>

      <section className="space-y-3">
        <h2 className="h2">Module 1 cases</h2>
        {scenarios?.filter((s) => s.module === 1).map((s) => (
          <details key={s.id} className="card">
            <summary className="cursor-pointer font-medium">
              {s.title} <span className="badge ml-1">Version {s.version}</span>
              {Boolean((s.brief as { draft?: string }).draft) && <span className="badge ml-1 border-warn text-warn">draft wording</span>}
            </summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(s.brief, null, 2)}</pre>
          </details>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="h2">Module 2 recordings</h2>
        {scenarios?.filter((s) => s.module === 2).map((s) => (
          <details key={s.id} className="card">
            <summary className="cursor-pointer font-medium">
              {s.title} <span className="badge ml-1">Version {s.version}</span>{" "}
              <span className={`badge ml-1 ${s.video_path && uploaded.has(s.video_path) ? "border-ok text-ok" : "border-warn text-warn"}`}>
                {s.video_path && uploaded.has(s.video_path) ? "video uploaded" : `upload ${s.video_path}`}
              </span>
            </summary>
            <table className="table mt-2">
              <thead><tr><th>#</th><th>Time</th><th>Behaviour</th><th>Type</th><th>A strong debrief says</th></tr></thead>
              <tbody>
                {keys?.filter((k) => k.scenario_id === s.id).map((k) => (
                  <tr key={k.id}><td>{k.code}</td><td>{k.at_label}</td><td>{k.behaviour}</td><td>{k.kind.replace("_", " ")}</td><td>{k.strong_debrief}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
        ))}
        <p className="muted">
          Upload each video to the private Supabase Storage bucket <code>module2-recordings</code> using the file name shown. Facilitators get a
          45-minute signed link only while their Module 2 is in progress.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="h2 mb-2">Module 3 sections</h2>
          <ul className="list-disc pl-5 text-sm">
            {sections?.map((s) => <li key={s.id}>{s.title}{s.priority ? " (priority)" : ""}</li>)}
          </ul>
        </div>
        <div className="card">
          <h2 className="h2 mb-2">Learner cards</h2>
          <ul className="space-y-1 text-sm">
            {cards?.map((c) => <li key={c.id}><strong>{c.name}</strong> ({c.plays_during}): {c.instruction} <span className="muted">Tests: {c.tests}</span></li>)}
          </ul>
        </div>
      </section>
    </div>
  );
}
