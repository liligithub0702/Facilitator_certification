import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";
import { calibrationDiff, MODULE_NAMES, RED_FLAGS, type ModuleNo } from "@/lib/rules";
import { READOUT_FIELDS, type AnswerKeyItem, type Dimension, type Scenario, type Submission, type Tag } from "@/lib/types";
import { Debrief } from "@/app/facilitator/module/[id]/Debrief";
import { addRecording, removeRecording, setSession } from "../../actions";
import { ScorecardForm } from "./ScorecardForm";
import { SessionInput } from "./SessionInput";

type Brief = {
  opening?: string;
  position?: string;
  key_fact?: string;
  unlock?: string;
  twists?: { minute: number; line: string; tests: string }[];
  good?: string[];
  red_flags?: string[];
  description?: string;
  draft?: string | null;
};

type GradingRow = {
  id: string;
  grader_id: string;
  is_calibration: boolean;
  submitted_at: string | null;
  readout_scores: Record<string, number>;
  answer_key_hits: string[];
  profiles: { full_name: string | null; email: string } | null;
  scores: { dimension_id: number; level: number; evidence: string | null }[];
  red_flags: { code: string }[];
};

export default async function GradeSubmission({ params }: PageProps<"/grader/submission/[id]">) {
  const { id } = await params;
  const { supabase, profile } = await requireRole("grader", "admin");

  const { data: s } = await supabase
    .from("module_submissions")
    .select("*, attempts(id, profiles(full_name, email, region), cohorts(name))")
    .eq("id", id)
    .single<Submission & { attempts: { id: string; profiles: { full_name: string | null; email: string; region: string | null }; cohorts: { name: string } } }>();
  if (!s) notFound();
  const mod = s.module as ModuleNo;

  const [{ data: dims }, { data: scenario }, { data: answerKey }, { data: tags }, { data: recordings }, { data: gradings }, { data: section }, { data: cards }] =
    await Promise.all([
      supabase.from("module_dimensions").select("weight, dimensions(*)").eq("module", mod).order("dimension_id"),
      s.scenario_id ? supabase.from("scenarios").select("*").eq("id", s.scenario_id).single<Scenario>() : Promise.resolve({ data: null }),
      s.scenario_id && mod === 2
        ? supabase.from("answer_key_items").select("*").eq("scenario_id", s.scenario_id).order("sort").returns<AnswerKeyItem[]>()
        : Promise.resolve({ data: [] as AnswerKeyItem[] }),
      supabase.from("tags").select("*").eq("submission_id", id).order("at_seconds").returns<Tag[]>(),
      supabase.from("recordings").select("id, url, label, created_at").eq("submission_id", id).order("created_at"),
      supabase
        .from("gradings")
        .select("id, grader_id, is_calibration, submitted_at, readout_scores, answer_key_hits, profiles(full_name, email), scores(dimension_id, level, evidence), red_flags(code)")
        .eq("submission_id", id)
        .returns<GradingRow[]>(),
      s.section_id ? supabase.from("sections").select("title").eq("id", s.section_id).single() : Promise.resolve({ data: null }),
      mod === 3
        ? supabase.from("card_assignments").select("id, learner_cards(name, plays_during), profiles(full_name, email)").eq("submission_id", id)
        : Promise.resolve({ data: [] }),
    ]);

  const dimensions = (dims ?? []).map((d) => ({ ...(d.dimensions as unknown as Dimension), weight: d.weight as "primary" | "supporting" }));
  const mine = gradings?.find((g) => g.grader_id === profile.id);
  const others = (gradings ?? []).filter((g) => g.grader_id !== profile.id);
  const isCalibration = mine ? mine.is_calibration : others.some((g) => !g.is_calibration);
  const brief = (scenario?.brief ?? {}) as Brief;
  const person = s.attempts.profiles;

  const submittedGradings = (gradings ?? []).filter((g) => g.submitted_at);
  const diff =
    submittedGradings.length >= 2 && mine?.submitted_at
      ? calibrationDiff(
          Object.fromEntries(submittedGradings[0].scores.map((x) => [x.dimension_id, x.level])),
          Object.fromEntries(submittedGradings[1].scores.map((x) => [x.dimension_id, x.level])),
        )
      : null;

  return (
    <div className="space-y-4">
      <Link href="/grader" className="muted hover:underline">← Queue</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="h1">{person.full_name ?? person.email}: Module {mod} {MODULE_NAMES[mod]}</h1>
        <StatusBadge value={s.status} />
        <StatusBadge value={s.result} />
      </div>
      <p className="muted">
        {s.attempts.cohorts.name} · {person.region ?? "—"} · try {s.try_no}
        {scenario ? ` · ${scenario.title}` : ""}
        {section ? ` · ${section.title}` : ""} · <Link className="underline" href={`/grader/attempt/${s.attempt_id}`}>Outcome &amp; exec summary</Link>
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Evidence */}
        <div className="space-y-4">
          {mod === 1 && (
            <section className="card space-y-2">
              <h2 className="h2">Readout</h2>
              <dl className="space-y-2 text-sm">
                {READOUT_FIELDS.map((f) => (
                  <div key={f.key}><dt className="font-medium">{f.label}</dt><dd className="whitespace-pre-wrap">{s.readout[f.key] || "—"}</dd></div>
                ))}
              </dl>
            </section>
          )}
          {mod === 2 && (
            <section className="card space-y-2">
              <h2 className="h2">Debrief</h2>
              <p className="muted">Plays used: {s.video_plays}</p>
              <Debrief debrief={s.debrief} tags={tags ?? []} />
            </section>
          )}
          {mod === 3 && (
            <section className="card space-y-2 text-sm">
              <h2 className="h2">Teach-back</h2>
              <p>Section: <strong>{section?.title ?? "not assigned"}</strong></p>
              <p className="font-medium">Learner cards in play</p>
              <ul className="list-disc pl-5">
                {(cards ?? []).map((c) => {
                  const card = c.learner_cards as unknown as { name: string; plays_during: string };
                  const peer = c.profiles as unknown as { full_name: string | null; email: string };
                  return <li key={c.id}>{card.name} (during {card.plays_during}) played by {peer.full_name ?? peer.email}</li>;
                })}
              </ul>
              <p className="muted">Certifier card: at the midpoint say “We&apos;ve lost 5 minutes; please finish in the time left.” Cutting practice scores lower.</p>
            </section>
          )}

          {(mod === 1 || mod === 3) && (
            <section className="card space-y-3">
              <h2 className="h2">Session and recording</h2>
              <SessionInput action={setSession.bind(null, id)} value={s.session_at} />
              <ul className="space-y-1 text-sm">
                {(recordings ?? []).map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <a href={r.url} target="_blank" rel="noreferrer" className="underline">{r.label ?? "Recording"}</a>
                    <form action={removeRecording.bind(null, id, r.id)}><button className="text-xs text-danger">remove</button></form>
                  </li>
                ))}
              </ul>
              <form action={addRecording.bind(null, id)} className="flex flex-wrap gap-2">
                <input name="url" type="url" required placeholder="https:// Teams / Stream recording link" className="input flex-1" />
                <input name="label" placeholder="Label" className="input w-32" />
                <button className="btn">Attach</button>
              </form>
            </section>
          )}

          {scenario && mod === 1 && (
            <details className="card text-sm" open>
              <summary className="cursor-pointer font-semibold">Role-player brief (grader-only)</summary>
              {brief.draft && <p className="mt-2 text-warn">{brief.draft}</p>}
              <div className="mt-2 space-y-2">
                <p><strong>Alex opens with:</strong> {brief.opening}</p>
                <p><strong>Position:</strong> {brief.position}</p>
                <p><strong>Key fact:</strong> {brief.key_fact}</p>
                <p><strong>Unlock when:</strong> {brief.unlock}</p>
                <table className="table">
                  <thead><tr><th>Minute</th><th>Alex says (word for word)</th><th>Tests</th></tr></thead>
                  <tbody>{brief.twists?.map((t) => <tr key={t.minute}><td>{t.minute}</td><td>{t.line}</td><td>{t.tests}</td></tr>)}</tbody>
                </table>
                <p className="font-medium">What good looks like</p>
                <ul className="list-disc pl-5">{brief.good?.map((g) => <li key={g}>{g}</li>)}</ul>
                <p className="font-medium">Case red flags</p>
                <ul className="list-disc pl-5">{brief.red_flags?.map((g) => <li key={g}>{g}</li>)}</ul>
              </div>
            </details>
          )}
          {scenario && mod === 2 && <p className="muted">{brief.description}{brief.draft ? ` ${brief.draft}` : ""}</p>}
        </div>

        {/* Scorecard */}
        <div className="card">
          <h2 className="h2 mb-3">Scorecard</h2>
          <ScorecardForm
            submissionId={id}
            module={mod}
            dimensions={dimensions}
            redFlags={RED_FLAGS[mod]}
            answerKey={answerKey ?? []}
            isCalibration={isCalibration}
            submittedAt={mine?.submitted_at ?? null}
            initial={{
              scores: Object.fromEntries((mine?.scores ?? []).map((x) => [x.dimension_id, { level: x.level, evidence: x.evidence ?? "" }])),
              readout: mine?.readout_scores ?? {},
              hits: mine?.answer_key_hits ?? [],
              redFlags: (mine?.red_flags ?? []).map((f) => f.code).filter((c) => c !== "m2_missed_critical"),
              submit: false,
            }}
          />
          {diff && (
            <div className="mt-6">
              <h3 className="font-semibold">Calibration: score differences</h3>
              <table className="table mt-1">
                <thead>
                  <tr>
                    <th>Dimension</th>
                    <th>{submittedGradings[0].profiles?.full_name ?? "Grader 1"}</th>
                    <th>{submittedGradings[1].profiles?.full_name ?? "Grader 2"}</th>
                    <th>Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.map((d) => (
                    <tr key={d.dimension}>
                      <td>{dimensions.find((x) => x.id === d.dimension)?.name ?? d.dimension}</td>
                      <td>{d.a ?? "—"}</td>
                      <td>{d.b ?? "—"}</td>
                      <td className={d.diff && d.diff >= 2 ? "font-semibold text-danger" : d.diff ? "text-warn" : ""}>{d.diff ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
