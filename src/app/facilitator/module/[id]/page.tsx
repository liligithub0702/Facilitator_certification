import Link from "next/link";
import { notFound } from "next/navigation";
import { Dashboard, type DashboardData } from "@/components/Dashboard";
import { Timer } from "@/components/Timer";
import { requireRole } from "@/lib/auth";
import { serverTime } from "@/lib/env";
import { DEBRIEF_FIELDS, READOUT_FIELDS, type Submission, type Tag } from "@/lib/types";
import { getVideoUrl } from "../../actions";
import { AdvanceButton, Module2Workspace, ResponseForm, StartButton } from "./controls";
import { Debrief } from "./Debrief";

export default async function ModulePage({ params }: PageProps<"/facilitator/module/[id]">) {
  const { id } = await params;
  const { supabase } = await requireRole("facilitator");

  // Applies any expired timer before rendering, so the page always shows the true phase.
  const { data: s, error } = await supabase.rpc("sync_submission", { p_submission: id }).single<Submission>();
  if (error || !s || s.module === 3) notFound();
  const serverNow = serverTime();

  const back = <Link href="/facilitator" className="muted hover:underline">← My certification</Link>;

  if (s.status === "assigned") {
    return (
      <div className="max-w-2xl space-y-4">
        {back}
        <h1 className="h1">Module {s.module}: {s.module === 1 ? "Capability Demonstration" : "Observation & Diagnosis"}</h1>
        {s.module === 1 ? (
          <div className="card space-y-2 text-sm">
            <p><strong>1. Review the dashboard (15 min).</strong> The team&apos;s performance dashboard opens with a timer. Read all of it; you will not know in advance which situation the Team Manager brings.</p>
            <p><strong>2. Write your readout (5 min).</strong> Three observations, one hypothesis and two questions you would ask the Team Manager. The form locks when you submit or when time runs out.</p>
            <p><strong>3. Coach the Team Manager (20 min).</strong> Live with the certifier, who plays Alex. Help Alex think it through and reach their own plan. The dashboard stays open for reference.</p>
            <p><strong>4. Expect the situation to change.</strong> Respond as you would on the floor.</p>
            <p className="muted">The timer runs on the server and keeps running if you close this tab.</p>
          </div>
        ) : (
          <div className="card space-y-2 text-sm">
            <p><strong>1. Watch the recording (10 min).</strong> A Team Manager in a coaching conversation or a hiring interview. You can pause and replay once.</p>
            <p><strong>2. Tag moments as you watch.</strong> Press Tag and add a short note; the timestamp is saved with it.</p>
            <p><strong>3. Complete the debrief (25 min).</strong> Link each point to a timestamp where you can. Specific, behaviour-based points score higher than general impressions.</p>
          </div>
        )}
        <StartButton id={s.id} label={s.module === 1 ? "Open the dashboard and start the timer" : "Start Module 2"} />
      </div>
    );
  }

  if (s.module === 1) {
    const { data: dash } = await supabase.from("dashboards").select("data").eq("version", s.dashboard_version).single();
    const data = dash?.data as DashboardData | undefined;

    if (s.phase === "dashboard") {
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Timer deadline={s.phase_deadline!} serverNow={serverNow} label="Dashboard review" />
            <AdvanceButton id={s.id} label="I'm ready: go to the readout" confirm="Move to the readout? You cannot come back to the dashboard until the readout is submitted." />
          </div>
          {data && <Dashboard data={data} />}
        </div>
      );
    }
    if (s.phase === "readout") {
      return (
        <div className="max-w-3xl space-y-4">
          <Timer deadline={s.phase_deadline!} serverNow={serverNow} label="Readout" />
          <h1 className="h1">Your readout</h1>
          <p className="muted">Three observations, one hypothesis and two questions you would ask the Team Manager.</p>
          <ResponseForm id={s.id} fields={READOUT_FIELDS} initial={s.readout} submitLabel="Submit readout" />
        </div>
      );
    }
    const { data: recordings } = await supabase.from("recordings").select("id, url, label").eq("submission_id", s.id);
    return (
      <div className="space-y-6">
        {back}
        <div className="card space-y-2">
          <h1 className="h2">Readout submitted</h1>
          <p className="text-sm">
            Next: the live coaching conversation with Alex
            {s.session_at ? ` on ${new Date(s.session_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` : ""}.
            The dashboard stays open below for reference.
          </p>
          {(recordings?.length ?? 0) > 0 && (
            <p className="text-sm">Recording: {recordings!.map((r) => <a key={r.id} className="underline" href={r.url} target="_blank" rel="noreferrer">{r.label ?? "link"}</a>)}</p>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer">Your readout</summary>
            <dl className="mt-2 space-y-2">
              {READOUT_FIELDS.map((f) => (
                <div key={f.key}><dt className="font-medium">{f.label}</dt><dd className="whitespace-pre-wrap">{s.readout[f.key] || "—"}</dd></div>
              ))}
            </dl>
          </details>
        </div>
        {data && <Dashboard data={data} />}
      </div>
    );
  }

  // Module 2
  const [{ data: tags }, { data: maxPlaysRow }] = await Promise.all([
    supabase.from("tags").select("id, at_seconds, note").eq("submission_id", s.id).order("at_seconds").returns<Tag[]>(),
    supabase.from("settings").select("value").eq("key", "timers").single(),
  ]);
  const maxPlays = Number((maxPlaysRow?.value as { m2_max_plays?: number })?.m2_max_plays ?? 2);

  if (s.status !== "in_progress") {
    return (
      <div className="max-w-3xl space-y-4">
        {back}
        <h1 className="h1">Debrief submitted</h1>
        <Debrief debrief={s.debrief} tags={tags ?? []} />
      </div>
    );
  }

  const videoUrl = await getVideoUrl(s.id);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {s.phase === "debrief" ? (
          <Timer deadline={s.phase_deadline!} serverNow={serverNow} label="Debrief" />
        ) : (
          <>
            <p className="muted">Watch and tag. Start the debrief when you are ready; it is timed at 25 minutes.</p>
            <AdvanceButton id={s.id} label="Start the debrief" confirm="Start the 25-minute debrief timer now?" />
          </>
        )}
      </div>
      <Module2Workspace
        id={s.id}
        videoUrl={videoUrl}
        plays={s.video_plays}
        maxPlays={maxPlays}
        initialTags={tags ?? []}
        debrief={s.phase === "debrief" ? { fields: DEBRIEF_FIELDS, initial: s.debrief } : undefined}
      />
    </div>
  );
}
