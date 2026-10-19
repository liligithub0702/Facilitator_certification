"use client";

import { useState, useTransition } from "react";
import { maxLevel, readoutTotal, tallyAnswerKey, type ModuleNo, type RedFlagDef } from "@/lib/rules";
import type { AnswerKeyItem, Dimension } from "@/lib/types";
import { saveGrading, type GradingInput } from "../../actions";

const KIND_LABEL = { critical_miss: "Critical miss", clear_miss: "Clear miss", subtle_miss: "Subtle miss", effective: "Effective" } as const;

export function ScorecardForm(props: {
  submissionId: string;
  module: ModuleNo;
  dimensions: (Dimension & { weight: "primary" | "supporting" })[];
  redFlags: RedFlagDef[];
  answerKey: AnswerKeyItem[];
  initial: GradingInput;
  isCalibration: boolean;
  submittedAt: string | null;
}) {
  const [scores, setScores] = useState(props.initial.scores);
  const [readout, setReadout] = useState(props.initial.readout);
  const [hits, setHits] = useState(new Set(props.initial.hits));
  const [flags, setFlags] = useState(new Set(props.initial.redFlags));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string }>();

  const tally = tallyAnswerKey(props.answerKey, [...hits]);
  const ro = readoutTotal(readout);

  const submit = (final: boolean) =>
    start(async () => {
      setMsg(undefined);
      const r = await saveGrading(props.submissionId, { scores, readout, hits: [...hits], redFlags: [...flags], submit: final });
      if ("error" in r && r.error) return setMsg({ tone: "danger", text: r.error });
      if (!final) return setMsg({ tone: "ok", text: "Draft saved." });
      const res = r.result === "passed" ? "Passed" : "Not passed";
      setMsg({
        tone: r.result === "passed" ? "ok" : "danger",
        text: `${res}${r.isCalibration ? " (calibration grading, does not set the result)" : ""}${r.reasons?.length ? `: ${r.reasons.join("; ")}` : ""}`,
      });
    });

  const toggle = (set: Set<string>, value: string, update: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    update(next);
  };

  return (
    <div className="space-y-5">
      {props.isCalibration && (
        <p className="rounded-md border border-warn px-3 py-2 text-sm text-warn">
          Calibration grading: score independently. Your scores are compared with the primary grader&apos;s.
        </p>
      )}

      {props.module === 2 && (
        <section>
          <h3 className="font-semibold">Answer key</h3>
          <p className="muted mb-2">Tick each planted behaviour the debrief identifies (with the right reasoning).</p>
          <ul className="space-y-1.5">
            {props.answerKey.map((a) => (
              <li key={a.id}>
                <label className="flex gap-2 text-sm">
                  <input type="checkbox" checked={hits.has(a.id)} onChange={() => toggle(hits, a.id, setHits)} />
                  <span>
                    <strong>{a.code}</strong> <span className="muted">{a.at_label}</span>{" "}
                    <span className={`badge ${a.kind === "critical_miss" ? "border-danger text-danger" : ""}`}>{KIND_LABEL[a.kind]}</span>
                    <br />
                    {a.behaviour}
                    <br />
                    <span className="muted">Strong debrief: {a.strong_debrief}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm">
            Critical {tally.critical_miss.hit}/{tally.critical_miss.total} · Clear {tally.clear_miss.hit}/{tally.clear_miss.total} · Subtle{" "}
            {tally.subtle_miss.hit}/{tally.subtle_miss.total} · Effective {tally.effective.hit}/{tally.effective.total}
          </p>
        </section>
      )}

      {props.module === 1 && (
        <section>
          <h3 className="font-semibold">Readout (0–6, scored separately)</h3>
          {([
            ["observations", "Observations", ["Restate single metrics", "Note trends", "Link trends to event log dates"]],
            ["hypothesis", "Hypothesis", ["Blames individuals on one metric", "Plausible but untested", "Plausible, names data that would confirm it"]],
            ["questions", "Questions for the TM", ["Closed or leading", "Open but generic", "Open and aimed at the cause"]],
          ] as const).map(([key, label, levels]) => (
            <fieldset key={key} className="mt-2">
              <legend className="text-sm font-medium">{label}</legend>
              <div className="mt-1 grid gap-1 sm:grid-cols-3">
                {levels.map((text, i) => (
                  <label key={i} className={`rounded-md border p-2 text-xs ${readout[key] === i ? "border-accent" : "border-border"}`}>
                    <input type="radio" name={key} className="mr-1" checked={readout[key] === i} onChange={() => setReadout({ ...readout, [key]: i })} />
                    <strong>{i}</strong> {text}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <p className="mt-2 text-sm">
            Readout total: {ro.total}/6 {ro.developmentArea && <span className="text-warn">· below 3: recorded as a development area</span>}
          </p>
        </section>
      )}

      <section className="space-y-4">
        <h3 className="font-semibold">Dimensions</h3>
        {props.dimensions.map((d) => {
          const cap = maxLevel(props.module, d.id, [...flags]);
          const cur = scores[d.id] ?? {};
          return (
            <fieldset key={d.id}>
              <legend className="text-sm font-medium">
                {d.id}. {d.name} <span className="badge ml-1">{d.weight}</span>
                {cap < 4 && <span className="ml-2 text-xs text-warn">capped at {cap}: no learner practice</span>}
              </legend>
              <div className="mt-1 grid gap-1 sm:grid-cols-4">
                {[d.level_1, d.level_2, d.level_3, d.level_4].map((text, i) => {
                  const level = i + 1;
                  return (
                    <label key={level} className={`rounded-md border p-2 text-xs ${cur.level === level ? "border-accent" : "border-border"} ${level > cap ? "opacity-40" : ""}`}>
                      <input
                        type="radio"
                        name={`dim-${d.id}`}
                        className="mr-1"
                        disabled={level > cap}
                        checked={cur.level === level}
                        onChange={() => setScores({ ...scores, [d.id]: { ...cur, level } })}
                      />
                      <strong>{level}</strong> {text}
                    </label>
                  );
                })}
              </div>
              <input
                className="input mt-1"
                placeholder="Evidence: one line of observed behaviour, with timestamp"
                value={cur.evidence ?? ""}
                maxLength={1000}
                onChange={(e) => setScores({ ...scores, [d.id]: { ...cur, evidence: e.target.value } })}
              />
            </fieldset>
          );
        })}
      </section>

      <section>
        <h3 className="font-semibold">Red flags</h3>
        <p className="muted mb-1">Any one sets the module to not passed.</p>
        {props.redFlags.map((f) => (
          <label key={f.code} className="flex gap-2 text-sm">
            <input
              type="checkbox"
              disabled={f.auto}
              checked={f.auto ? props.module === 2 && tally.critical_miss.hit < 1 : flags.has(f.code)}
              onChange={() => toggle(flags, f.code, setFlags)}
            />
            {f.label}
            {f.auto && <span className="muted">(set automatically from the answer key)</span>}
          </label>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pending} onClick={() => submit(false)}>Save draft</button>
        <button className="btn btn-primary" disabled={pending} onClick={() => submit(true)}>
          {props.submittedAt ? "Update grading" : "Submit grading"}
        </button>
        {props.submittedAt && <span className="muted">Submitted {new Date(props.submittedAt).toLocaleString("en-GB")}</span>}
      </div>
      {msg && <p className={`text-sm ${msg.tone === "ok" ? "text-ok" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}
