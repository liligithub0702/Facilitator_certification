import Link from "next/link";
import { notFound } from "next/navigation";
import { Dashboard, ObservationList, type AgentNotes, type DashboardData } from "@/components/Dashboard";
import { Timer } from "@/components/Timer";
import { PageHeader } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";
import { getContext, paragraphs } from "@/lib/context";
import { serverTime } from "@/lib/env";
import { COACHING_FORM_FIELDS, DEBRIEF_FIELDS, READOUT_FIELDS, type Submission, type Tag } from "@/lib/types";
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
            ["Review your team and choose who to coach", "15 min", "Your team's dashboard, QA audits and a profile of every agent. Pick any agent to see their observations, then decide who you'll coach first."],
            ["Prepare the session", "10 min", "Coaching cycle stage 1. Your observations, likely root causes, how you'll adapt to the agent and how you'll open. The form locks when you submit or time runs out."],
            ["Coach the agent, live", "20 min", "Coaching cycle stage 2. The certifier plays your agent; it's your first coaching session with them this month. Use the funnel: open, probe, find the root cause, build the plan with them, gain commitment."],
            ["Document the coaching", "10 min", "Coaching cycle stages 3 and 4, straight after the session: Start / Stop / Continue, a SMART action plan and how you'll follow through."],
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
          sub={s.module === 1 ? "You are the Team Manager. About an hour in total, using the coaching cycle: prepare, have the conversation, document, follow through. Timers run on the server and keep running if you close this tab." : "About 35 minutes. Find a quiet place with headphones."}
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
    const [{ data: dash }, { data: scenarioData }] = await Promise.all([
      supabase.from("dashboards").select("data").eq("version", s.dashboard_version).single(),
      supabase.rpc("case_brief", { p_submission: s.id }),
    ]);
    const data = dash?.data as DashboardData | undefined;
    const notes = ((scenarioData as { agents?: AgentNotes } | null)?.agents ?? null) as AgentNotes | null;
    const agents = data?.profiles?.map((p) => p.name) ?? data?.agentTable.rows.map((r) => String(r[0]).replace(/ \(new hire\)$/, "")) ?? [];
    const chosen = s.readout.agent || "your agent";
    const chosenNote = s.readout.agent ? notes?.[s.readout.agent] : undefined;
    const fmtTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

    if (s.phase === "dashboard") {
      return (
        <div className="space-y-5">
          <StepBar current={0}>
            <Timer deadline={s.phase_deadline!} serverNow={serverNow} label="Time left" />
            <AdvanceButton id={s.id} label="I've chosen: prepare the session" confirm="Move on to preparing your session? You can't come back to this page until your preparation is submitted." />
          </StepBar>
          <Briefing text={briefing} compact />
          {data && <Dashboard data={data} notes={notes} storageKey={`tmu-m1-agent-${s.id}`} />}
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
              eyebrow="Module 1 · Step 2 · Preparation"
              title="Prepare your coaching session"
              sub="Coaching cycle stage 1: plan, think, review the performance, prepare. Choose the agent you'll coach first and plan the conversation. Your answers save as you type."
            />
            <div className="card">
              <ResponseForm
                id={s.id}
                fields={READOUT_FIELDS}
                initial={s.readout}
                agents={agents}
                agentNotes={notes ?? undefined}
                prefillKey={`tmu-m1-agent-${s.id}`}
                submitLabel="Submit preparation"
              />
            </div>
          </div>
        </div>
      );
    }
    if (s.phase === "documentation") {
      return (
        <div className="space-y-5">
          <StepBar current={3}>
            <Timer deadline={s.phase_deadline!} serverNow={serverNow} label="Time left" />
          </StepBar>
          <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1fr_300px]">
            <div className="space-y-4">
              <PageHeader
                eyebrow="Module 1 · Step 4 · Documentation"
                title={`Coaching form: ${chosen}`}
                sub="Coaching cycle stages 3 and 4. Write it as you would right after the session: SMART language, a follow-up plan, then save. Your answers save as you type."
              />
              <div className="card">
                <ResponseForm id={s.id} fields={COACHING_FORM_FIELDS} initial={s.debrief} submitLabel="Submit coaching form" />
              </div>
            </div>
            <aside className="card h-fit space-y-2 text-sm">
              {chosenNote && (
                <details className="mb-3 rounded-chip bg-canvas p-3">
                  <summary className="cursor-pointer font-bold">Observations: {chosen}</summary>
                  <div className="mt-2">
                    <ObservationList agent={chosen} note={chosenNote} />
                  </div>
                </details>
              )}
              <p className="eyebrow">Your preparation</p>
              {READOUT_FIELDS.map((f) => (
                <div key={f.key}>
                  <p className="font-bold">{f.label}</p>
                  <p className="whitespace-pre-wrap text-ink-soft">{s.readout[f.key] || "—"}</p>
                </div>
              ))}
            </aside>
          </div>
        </div>
      );
    }

    const { data: recordings } = await supabase.from("recordings").select("id, url, label").eq("submission_id", s.id);
    const documented = s.phase === "documented";
    return (
      <div className="space-y-5">
        {back}
        <StepBar current={documented ? 4 : 2} />
        <div className="card space-y-3">
          <p className="eyebrow">{documented ? "Module 1 complete" : "Module 1 · Step 3 · Conversation"}</p>
          {documented ? (
            <>
              <h1 className="h2">Coaching form submitted</h1>
              <p className="text-sm">Your certifier will grade the session. Your result will appear on your certification page.</p>
            </>
          ) : (
            <>
              <h1 className="h2">Next: coach {chosen}, live</h1>
              <p className="text-sm">
                {s.session_at
                  ? `Your live session is on ${fmtTime(s.session_at)}. `
                  : "Your certifier will schedule the live session; the time will appear here. "}
                The certifier will play {chosen}. It&apos;s your first coaching session with them this month: build rapport, listen and question,
                agree the root causes, build the action plan together and gain commitment.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-chip bg-canvas p-4 text-sm">
                <span>
                  <strong>Finished the live session?</strong> Move on to document it on the coaching form (10 minutes).
                </span>
                <AdvanceButton
                  id={s.id}
                  label="I've finished coaching: document the session"
                  confirm={`Have you finished your live session with ${chosen}? The 10-minute coaching form starts now and you can't come back to this step.`}
                />
              </div>
            </>
          )}
          {(recordings?.length ?? 0) > 0 && (
            <p className="text-sm">Recording: {recordings!.map((r) => <a key={r.id} className="underline" href={r.url} target="_blank" rel="noreferrer">{r.label ?? "link"}</a>)}</p>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold">Your preparation</summary>
            <dl className="mt-2 space-y-2">
              {READOUT_FIELDS.map((f) => (
                <div key={f.key}><dt className="font-medium">{f.label}</dt><dd className="whitespace-pre-wrap">{s.readout[f.key] || "—"}</dd></div>
              ))}
            </dl>
          </details>
          {documented && (
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold">Your coaching form</summary>
              <dl className="mt-2 space-y-2">
                {COACHING_FORM_FIELDS.map((f) => (
                  <div key={f.key}><dt className="font-medium">{f.label}</dt><dd className="whitespace-pre-wrap">{s.debrief[f.key] || "—"}</dd></div>
                ))}
              </dl>
            </details>
          )}
        </div>
        {chosenNote && (
          <section className="card border-l-4 border-l-brand-magenta">
            <p className="eyebrow mb-2">Observations: {chosen}</p>
            <ObservationList agent={chosen} note={chosenNote} />
          </section>
        )}
        {data && <Dashboard data={data} notes={notes} initialAgent={s.readout.agent || undefined} />}
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

const M1_STEPS = ["Review & choose", "Prepare", "Coach live", "Document"];

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
          <span className="eyebrow mr-2">Your situation</span>You are the Team Manager
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
