"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ExecSummaryContent, SummaryItem } from "@/lib/types";
import { generateExecSummary, saveExecSummary } from "../../actions";

const FIELDS: { key: keyof ExecSummaryContent; label: string }[] = [
  { key: "outcome", label: "Outcome" },
  { key: "programs", label: "Certified program(s)" },
  { key: "strength_1", label: "Strength 1" },
  { key: "strength_2", label: "Strength 2" },
  { key: "development_1", label: "Development area 1" },
  { key: "development_2", label: "Development area 2" },
  { key: "next_step", label: "Recommended next step" },
];
const EMPTY: SummaryItem = { text: "", evidence: "" };

export function ExecSummaryEditor({
  attemptId,
  initial,
  status,
  aiEnabled,
}: {
  attemptId: string;
  initial: ExecSummaryContent | null;
  status: "draft" | "approved" | null;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [content, setContent] = useState<ExecSummaryContent>(
    initial ?? (Object.fromEntries(FIELDS.map((f) => [f.key, EMPTY])) as ExecSummaryContent),
  );
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string>();

  const run = (fn: () => Promise<{ error?: string }>, done: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.error ?? done);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {aiEnabled && (
          <button
            className="btn"
            disabled={pending}
            onClick={() => {
              if (initial && !window.confirm("Replace the current text with a new AI draft?")) return;
              run(() => generateExecSummary(attemptId), "Draft generated. Review every point against the evidence before approving.");
            }}
          >
            {pending ? "Working…" : "Draft with AI from scores and notes"}
          </button>
        )}
        {status && <span className={`badge ${status === "approved" ? "border-ok text-ok" : "border-warn text-warn"}`}>{status}</span>}
      </div>
      {initial === null && !pending && <p className="muted">No summary yet.</p>}
      <div key={JSON.stringify(initial)} className="space-y-3">
        {FIELDS.map((f) => (
          <fieldset key={f.key} className="grid gap-1 sm:grid-cols-2">
            <legend className="label">{f.label}</legend>
            <textarea
              className="input min-h-16"
              placeholder="Point"
              defaultValue={initial?.[f.key]?.text ?? ""}
              onChange={(e) => setContent((c) => ({ ...c, [f.key]: { ...c[f.key], text: e.target.value } }))}
            />
            <textarea
              className="input min-h-16"
              placeholder="Evidence"
              defaultValue={initial?.[f.key]?.evidence ?? ""}
              onChange={(e) => setContent((c) => ({ ...c, [f.key]: { ...c[f.key], evidence: e.target.value } }))}
            />
          </fieldset>
        ))}
      </div>
      <div className="flex gap-3">
        <button className="btn" disabled={pending} onClick={() => run(() => saveExecSummary(attemptId, content, false), "Draft saved.")}>
          Save draft
        </button>
        <button
          className="btn btn-primary"
          disabled={pending}
          onClick={() => {
            if (window.confirm("Approve? Leaders will be able to read this summary.")) run(() => saveExecSummary(attemptId, content, true), "Approved.");
          }}
        >
          Approve for leaders
        </button>
      </div>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
