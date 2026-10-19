import Link from "next/link";
import { StatusBadge } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";
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

  if (!attempt) {
    return (
      <div className="card">
        <h1 className="h1">Welcome, {profile.full_name ?? profile.email}</h1>
        <p className="muted mt-2">You have not been added to a certification cohort yet.</p>
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">My certification</h1>
        <p className="muted">{attempt.cohorts.name} · week of {attempt.cohorts.week_start} · {attempt.cycle}</p>
      </div>

      {outcome && outcome.outcome !== "in_progress" && (
        <section className="card space-y-2">
          <h2 className="h2">Outcome: {OUTCOME_LABELS[outcome.outcome]}</h2>
          {outcome.feedback && <p className="whitespace-pre-wrap text-sm">{outcome.feedback}</p>}
          {outcome.development_plan && (
            <div>
              <h3 className="font-medium">Development plan</h3>
              <p className="whitespace-pre-wrap text-sm">{outcome.development_plan}</p>
            </div>
          )}
          {outcome.reassess_by && <p className="muted">Reassessment by {outcome.reassess_by}</p>}
        </section>
      )}

      {!attempt.consent_at ? (
        <section className="card space-y-3">
          <h2 className="h2">Before you start</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Block 60 minutes for Module 1 and 45 minutes for Module 2, in a quiet room with camera and headset.</li>
            <li>Do not prepare with other facilitators or share case details afterwards. Cases rotate, and shared details count as a breach of the assessment.</li>
            <li>Use no notes, AI tools or materials other than those shown in the app.</li>
          </ul>
          <div className="rounded-md border border-border p-3 text-sm">
            <p className="font-medium">Recording consent</p>
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
        <p className="muted">Recording consent accepted {fmt(attempt.consent_at)}.</p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {([1, 2, 3] as ModuleNo[]).map((m) => {
          const s = latest.get(m);
          const locked = !attempt.consent_at || (m === 2 && !m1Passed);
          return (
            <section key={m} className="card flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">Module {m}: {MODULE_NAMES[m]}</h2>
                <StatusBadge value={s?.result ?? s?.status ?? "not assigned"} />
              </div>
              {s && s.try_no > 1 && <p className="muted">Reassessment (try {s.try_no})</p>}
              {m === 1 && <p className="muted">Dashboard review 15 min · readout 5 min · live coaching 20 min</p>}
              {m === 2 && <p className="muted">10 min recording · 25 min debrief. Opens after Module 1 is passed.</p>}
              {m === 3 && s && (
                <div className="text-sm">
                  <p>Section: <strong>{sectionTitle(s.section_id) ?? "to be assigned"}</strong></p>
                  <p>Teach-back: {fmt(s.session_at ?? attempt.cohorts.teach_back_at) ?? "date to be confirmed"}</p>
                  <p className="muted mt-1">Deliver it as you would to Team Managers, including a practice activity of at least 5 minutes.</p>
                </div>
              )}
              {m === 1 && s?.session_at && <p className="text-sm">Coaching session: {fmt(s.session_at)}</p>}
              <div className="mt-auto pt-2">
                {m !== 3 && s && !locked && (
                  <Link className="btn btn-primary" href={`/facilitator/module/${s.id}`}>
                    {s.status === "assigned" ? "Open" : "Continue"}
                  </Link>
                )}
                {m !== 3 && locked && <span className="muted">Locked</span>}
              </div>
            </section>
          );
        })}
      </div>

      {(myCards?.length ?? 0) > 0 && (
        <section className="card space-y-3">
          <h2 className="h2">Your learner cards for the teach-back</h2>
          <p className="muted">When you play a learner, follow your own card only and do not share it.</p>
          <ul className="space-y-2">
            {myCards!.map((c) => (
              <li key={c.assignment_id} className="rounded-md border border-border p-3 text-sm">
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
