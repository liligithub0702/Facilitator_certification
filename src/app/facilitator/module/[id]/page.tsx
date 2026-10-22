import Link from "next/link";
import { notFound } from "next/navigation";
import { Dashboard, type DashboardData } from "@/components/Dashboard";
import { Timer } from "@/components/Timer";
import { PageHeader } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";
import { getContext, paragraphs } from "@/lib/context";
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

  const back = <Link href="/facilitator" className="muted font-semibold hover:text-brand-indigo">← My certification</Link>;
  const context = await getContext(supabase);
  const briefing = s.dashboard_version === "B" ? context.briefing_B : context.briefing_A;

  if (s.status === "assigned") {
    const steps =
      s.module === 1
        ? [
            ["Review the dashboard", "15 min", "The team's performance dashboard opens with a timer. Read all of it: you won't know in advance which situation the Team Manager brings."],
            ["Write your readout", "5 min", "Three observations, one hypothesis and two questions you would ask the Team Manager. The form locks when you submit or time runs out."],
            ["Coach the Team Manager", "20 min, live", "The certifier plays Alex. Help Alex think it through and reach their own plan. The dashboard stays open for reference."],
            ["Expect the situation to change", "", "Alex may push back, ask for the answer or share new information. Respond as you would on the floor."],
          ]
        : [
            ["Watch the recording", "10 min", "A Team Manager in a coaching conversation or a hiring interview. You can pause, and replay once."],
            ["Tag moments as you watch", "", "Press Tag and add a short note; the timestamp is saved with it."],
            ["Write the debrief", "25 min", "Link each point to a timestamp where you can. Specific, behaviour-based points score higher than general impressions."],
          ];
    return (
      <div className="max-w-3xl space-y-6">
        {back}
        <PageHeader
          eyebrow={`Module ${s.module}`}
          title={s.module === 1 ? "Capability Demonstration" : "Observation & Diagnosis"}
          sub={s.module === 1 ? "About 45 minutes. The timer runs on the server and keeps running if you close this tab." : "About 35 minutes. Find a quiet place with headphones."}
        />
        {s.module === 1 && <Briefing text={briefing} />}
        <ol className="space-y-3">
          {steps.map(([title, time, body], i) => (
            <li key={title} className="card flex gap-4 p-5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-indigo text-sm font-extrabold text-white">{i + 1}</span>
              <div>
                <p className="font-bold">
                  {title} {time && <span className="badge ml-1 align-middle">{time}</span>}
                </p>
                <p className="mt-1 text-sm text-ink-soft">{body}</p>
              </div>
            </li>
          ))}
        </ol>
        <StartButton id={s.id} label={s.module === 1 ? "Open the dashboard and start the timer" : "Start Module 2"} />
      </div>
    );
  }

  if (s.module === 1) {
    const { data: dash } = await supabase.from("dashboards").select("data").eq("version", s.dashboard_version).single();
    const data = dash?.data as DashboardData | undefined;

    if (s.phase === "dashboard") {
      return (
        <div className="space-y-5">
          <StepBar current={0}>
            <Timer deadline={s.phase_deadline!} serverNow={serverNow} label="Time left" />
            <AdvanceButton id={s.id} label="I'm ready: go to the readout" confirm="Move to the readout? You cannot come back to the dashboard until the readout is submitted." />
          </StepBar>
          <Briefing text={briefing} compact />
          {data && <Dashboard data={data} />}
        </div>
      );
    }
    if (s.phase === "readout") {
      return (
        <div className="space-y-5">
          <StepBar current={1}>
            <Timer deadline={s.phase_deadline!} serverNow={serverNow} label="Time left" />
          </StepBar>
          <div className="mx-auto max-w-3xl space-y-4">
            <PageHeader
              eyebrow="Module 1 · Step 2"
              title="Your readout"
              sub="Three observations, one hypothesis and two questions you would ask Alex. Link what you saw to when it happened. Your answers save as you type."
            />
            <div className="card">
              <ResponseForm id={s.id} fields={READOUT_FIELDS} initial={s.readout} submitLabel="Submit readout" />
            </div>
          </div>
        </div>
      );
    }
    const { data: recordings } = await supabase.from("recordings").select("id, url, label").eq("submission_id", s.id);
    return (
      <div className="space-y-5">
        {back}
        <StepBar current={2} />
        <div className="card space-y-2">
          <p className="eyebrow">Module 1 · Step 3</p>
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

const M1_STEPS = ["Review the dashboard", "Write your readout", "Coach Alex (live)"];

/** Sticky progress bar for Module 1: where you are, plus the timer and actions. */
function StepBar({ current, children }: { current: number; children?: React.ReactNode }) {
  return (
    <div className="sticky top-[68px] z-10 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-paper/95 px-4 py-3 shadow-soft backdrop-blur">
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {M1_STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`grid size-6 place-items-center rounded-full text-xs font-extrabold ${
                i < current ? "bg-ok text-white" : i === current ? "bg-brand-magenta text-white" : "bg-canvas-2 text-brand-gray"
              }`}
            >
              {i < current ? "✓" : i + 1}
            </span>
            <span className={i === current ? "font-bold text-ink" : "text-brand-gray"}>{label}</span>
            {i < M1_STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-line-strong" />}
          </li>
        ))}
      </ol>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </div>
  );
}

/** "Your situation": the facilitator-facing case context, editable in Admin -> Settings. */
function Briefing({ text, compact = false }: { text: string; compact?: boolean }) {
  const body = (
    <div className="space-y-2 text-[15px] leading-relaxed text-ink-soft">
      {paragraphs(text).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
  if (compact) {
    return (
      <details className="card border-l-4 border-l-brand-magenta p-5" open>
        <summary className="cursor-pointer font-bold">
          <span className="eyebrow mr-2">Your situation</span>Who you are coaching and why
        </summary>
        <div className="mt-3">{body}</div>
      </details>
    );
  }
  return (
    <section className="card border-l-4 border-l-brand-magenta">
      <p className="eyebrow mb-2">Your situation</p>
      {body}
    </section>
  );
}
