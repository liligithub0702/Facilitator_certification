import Link from "next/link";
import { PageHeader, StatusBadge } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";
import { getContext, paragraphs } from "@/lib/context";
import { MODULE_NAMES, OUTCOME_LABELS, type ModuleNo } from "@/lib/rules";
import type { Attempt, Cohort, OutcomeRow, Submission } from "@/lib/types";
import { acceptConsent } from "./actions";

type MyCard = {
  assignment_id: string;
  presenter_name: string;
  card_name: string;
  instruction: string;
  plays_during: "content" | "practice";
  session_at: string | null;
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : null;

export default async function FacilitatorHome() {
  const { supabase, profile } = await requireRole("facilitator");

  const { data: attempts } = await supabase
    .from("attempts")
    .select("*, cohorts(*)")
    .eq("facilitator_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<(Attempt & { cohorts: Cohort })[]>();
  const attempt = attempts?.[0];

  const context = await getContext(supabase);
  const firstName = (profile.full_name ?? "").split(" ")[0] || null;

  if (!attempt) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="TMU facilitator re-certification" title={`Welcome${firstName ? `, ${firstName}` : ""}`} sub="You have not been added to a certification cohort yet. Your admin will add you; this page will then show your modules." />
        <ProgrammeCard text={context.programme} />
      </div>
    );
  }

  const [{ data: subs }, { data: outcome }, { data: cardRows }, { data: sections }] = await Promise.all([
    supabase.from("module_submissions").select("*").eq("attempt_id", attempt.id).order("module").order("try_no").returns<Submission[]>(),
    supabase.from("outcomes").select("*").eq("attempt_id", attempt.id).maybeSingle<OutcomeRow>(),
    supabase.rpc("my_cards"),
    supabase.from("sections").select("id, title"),
  ]);

  const myCards = cardRows as MyCard[] | null;

  // Latest try per module
  const latest = new Map<ModuleNo, Submission>();
  for (const s of subs ?? []) latest.set(s.module, s);
  const m1Passed = latest.get(1)?.result === "passed";
  const sectionTitle = (id: string | null) => sections?.find((s) => s.id === id)?.title;

  const m1 = latest.get(1);
  const m2 = latest.get(2);
  const next = nextStep({ consented: Boolean(attempt.consent_at), m1, m2, m1Passed, fmt });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`${attempt.cohorts.name} · week of ${attempt.cohorts.week_start}`}
        title={`Welcome${firstName ? `, ${firstName}` : ""}`}
        sub="Three modules, in order. Module 2 opens once Module 1 is passed; Module 3 is a live teach-back with your cohort."
      />

      {outcome && outcome.outcome !== "in_progress" && (
        <section className="card space-y-2 border-l-4 border-l-brand-magenta">
          <p className="eyebrow">Your outcome</p>
          <h2 className="text-2xl font-extrabold">{OUTCOME_LABELS[outcome.outcome]}</h2>
          {outcome.feedback && <p className="whitespace-pre-wrap text-sm">{outcome.feedback}</p>}
          {outcome.development_plan && (
            <div>
              <h3 className="font-bold">Development plan</h3>
              <p className="whitespace-pre-wrap text-sm">{outcome.development_plan}</p>
            </div>
          )}
          {outcome.reassess_by && <p className="muted">Reassessment by {outcome.reassess_by}</p>}
        </section>
      )}

      {next && attempt.consent_at && (
        <section className="relative overflow-hidden rounded-panel bg-[linear-gradient(135deg,var(--color-brand-indigo-soft),var(--color-brand-indigo)_45%,var(--color-brand-indigo-deep))] p-7 text-white shadow-mid">
          <div className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-brand-magenta/35 blur-3xl" />
          <p className="text-xs font-bold tracking-[0.14em] text-white/70 uppercase">Your next step</p>
          <h2 className="mt-2 text-2xl font-extrabold">{next.title}</h2>
          <p className="mt-1 max-w-2xl text-white/80">{next.body}</p>
          {next.href && (
            <Link href={next.href} className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-brand-indigo shadow-soft transition hover:-translate-y-px hover:shadow-mid">
              {next.cta} →
            </Link>
          )}
        </section>
      )}

      {!attempt.consent_at ? (
        <section className="card space-y-4 border-l-4 border-l-brand-magenta">
          <div>
            <p className="eyebrow">Step 0</p>
            <h2 className="h2">Before you start</h2>
          </div>
          <ul className="space-y-2 text-sm">
            <li className="flex gap-2"><span className="text-brand-magenta">●</span>Block 60 minutes for Module 1 and 45 minutes for Module 2, in a quiet room with camera and headset.</li>
            <li className="flex gap-2"><span className="text-brand-magenta">●</span>Do not prepare with other facilitators or share case details afterwards. Cases rotate, and shared details count as a breach of the assessment.</li>
            <li className="flex gap-2"><span className="text-brand-magenta">●</span>Use no notes, AI tools or materials other than those shown in the app.</li>
          </ul>
          <div className="rounded-card bg-canvas p-4 text-sm">
            <p className="font-bold">Recording consent</p>
            <p className="mt-1">
              I agree that my Module 1 coaching session, Module 3 teach-back and my written responses are recorded and
              stored for assessment. Recordings are visible only to me, my assigned grader and the certification admin,
              and are deleted at the end of the retention period set by the admin.
            </p>
            <p className="muted mt-1">Final consent wording is pending review by the privacy team for all four regions.</p>
          </div>
          <form action={acceptConsent.bind(null, attempt.id)}>
            <button className="btn btn-primary">I consent to recording</button>
          </form>
        </section>
      ) : (
        <p className="muted">✓ Recording consent accepted {fmt(attempt.consent_at)}.</p>
      )}

      <section>
        <h2 className="h2 mb-3">Your modules</h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {([1, 2, 3] as ModuleNo[]).map((m) => {
            const s = latest.get(m);
            const locked = !attempt.consent_at || (m === 2 && !m1Passed);
            const done = s?.result === "passed";
            return (
              <li key={m} className={`card flex flex-col gap-3 ${locked ? "opacity-70" : "card-lift"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`grid size-9 place-items-center rounded-full text-sm font-extrabold ${
                      done ? "bg-ok text-white" : locked ? "bg-canvas-2 text-brand-gray" : "bg-brand-indigo text-white"
                    }`}
                  >
                    {done ? "✓" : m}
                  </span>
                  <StatusBadge value={s?.result ?? s?.status ?? "not assigned"} />
                </div>
                <div>
                  <p className="eyebrow">Module {m}</p>
                  <h3 className="text-lg font-extrabold">{MODULE_NAMES[m]}</h3>
                </div>
                {s && s.try_no > 1 && <p className="badge self-start border-warn/30 bg-warn-bg text-warn">Reassessment · try {s.try_no}</p>}
                {m === 1 && (
                  <p className="text-sm text-ink-soft">Play the Team Manager: review your team, choose an agent, prepare, coach them live and document it, using the coaching cycle.</p>
                )}
                {m === 2 && (
                  <p className="text-sm text-ink-soft">Watch a recorded TM conversation, tag key moments and write a structured debrief.</p>
                )}
                {m === 3 && (
                  <p className="text-sm text-ink-soft">Deliver a TMU section to your cohort peers, including a practice activity of at least 5 minutes.</p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {(m === 1 ? ["15 min review", "10 min prep", "20 min coaching", "10 min form"] : m === 2 ? ["10 min video", "25 min debrief"] : ["15–20 min live"]).map((t) => (
                    <span key={t} className="badge">{t}</span>
                  ))}
                </div>
                {m === 3 && s && (
                  <div className="rounded-chip bg-canvas p-3 text-sm">
                    <p>Section: <strong>{sectionTitle(s.section_id) ?? "to be assigned"}</strong></p>
                    <p>Teach-back: {fmt(s.session_at ?? attempt.cohorts.teach_back_at) ?? "date to be confirmed"}</p>
                  </div>
                )}
                {m === 1 && s?.session_at && <p className="rounded-chip bg-canvas p-3 text-sm">Coaching session: <strong>{fmt(s.session_at)}</strong></p>}
                <div className="mt-auto pt-1">
                  {m !== 3 && s && !locked && (
                    <Link className="btn btn-primary" href={`/facilitator/module/${s.id}`}>
                      {s.status === "assigned" ? "Open" : "Continue"}
                    </Link>
                  )}
                  {m !== 3 && locked && <span className="muted">🔒 Locked{m === 2 && attempt.consent_at ? " until Module 1 is passed" : ""}</span>}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <ProgrammeCard text={context.programme} />

      {(myCards?.length ?? 0) > 0 && (
        <section className="card space-y-3">
          <h2 className="h2">Your learner cards for the teach-back</h2>
          <p className="muted">When you play a learner, follow your own card only and do not share it.</p>
          <ul className="space-y-2">
            {myCards!.map((c) => (
              <li key={c.assignment_id} className="rounded-card border border-line bg-canvas p-4 text-sm">
                <p className="font-medium">
                  {c.card_name} <span className="badge ml-1">during {c.plays_during}</span>
                </p>
                <p className="muted">In {c.presenter_name}&apos;s teach-back{c.session_at ? ` · ${fmt(c.session_at)}` : ""}</p>
                <p className="mt-1">{c.instruction}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ProgrammeCard({ text }: { text: string }) {
  return (
    <section className="card grid gap-4 md:grid-cols-[200px_1fr]">
      <div>
        <p className="eyebrow">About the programme</p>
        <h2 className="h2 mt-1">TMU and this certification</h2>
      </div>
      <div className="prose-sm space-y-2 text-[15px] leading-relaxed text-ink-soft">
        {paragraphs(text).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </section>
  );
}

function nextStep({
  consented,
  m1,
  m2,
  m1Passed,
  fmt,
}: {
  consented: boolean;
  m1?: Submission;
  m2?: Submission;
  m1Passed: boolean;
  fmt: (iso: string | null) => string | null;
}): { title: string; body: string; cta?: string; href?: string } | null {
  if (!consented) return null;
  if (m1 && m1.phase === "documentation") {
    return {
      title: m1.phase === "documentation" ? "Finish your coaching form" : `Document your session with ${m1.readout.agent || "your agent"}`,
      body: "Coaching cycle stages 3 and 4: Start / Stop / Continue, a SMART action plan and your follow-through plan. It's timed at 10 minutes.",
      cta: "Open the coaching form",
      href: `/facilitator/module/${m1.id}`,
    };
  }
  if (m1 && (m1.status === "assigned" || m1.status === "in_progress") && m1.phase !== "coaching") {
    return {
      title: m1.status === "assigned" ? "Start Module 1: Capability Demonstration" : "Continue Module 1",
      body: "As the Team Manager, you'll review your team and choose an agent (15 min), prepare the session (10 min), coach them live, then document it. The timer starts when you open the dashboard.",
      cta: m1.status === "assigned" ? "Start Module 1" : "Continue Module 1",
      href: `/facilitator/module/${m1.id}`,
    };
  }
  if (m1 && !m1Passed && m1.result !== "not_passed") {
    return {
      title: m1.phase === "documented" ? "Module 1 is with your certifier" : m1.phase === "documentation" ? "Finish your coaching form" : "Next: your live coaching session",
      body:
        m1.phase === "documented"
          ? "Your coaching form is in. Your result appears here after grading."
          : m1.phase === "documentation"
            ? "Your 10-minute coaching form is open. Complete it before the timer runs out."
            : m1.session_at
              ? `Your preparation is in. Your live session with ${m1.readout.agent || "your agent"} is on ${fmt(m1.session_at)}. When you've finished, open Module 1 and press the button to document it.`
              : `Your preparation is in. Next is the live session with ${m1.readout.agent || "your agent"}. When you've finished, open Module 1 and press the button to document it.`,
      cta: m1.phase === "documentation" ? "Open the coaching form" : "Open Module 1",
      href: `/facilitator/module/${m1.id}`,
    };
  }
  if (m1Passed && m2 && m2.status !== "submitted" && m2.status !== "graded") {
    return {
      title: m2.status === "assigned" ? "Start Module 2: Observation & Diagnosis" : "Continue Module 2",
      body: "Watch a recorded conversation (one replay allowed), tag key moments, then write a 25-minute debrief.",
      cta: m2.status === "assigned" ? "Start Module 2" : "Continue Module 2",
      href: `/facilitator/module/${m2.id}`,
    };
  }
  if (m2 && (m2.status === "submitted" || m2.status === "graded") && !m2.result) {
    return { title: "Your debrief is with the grader", body: "Next is Module 3, the live teach-back with your cohort. Your section and date are shown below." };
  }
  return null;
}
