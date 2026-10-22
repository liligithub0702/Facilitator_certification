"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { FormField } from "@/lib/types";
import { addTag, advancePhase, recordPlay, saveResponse, startModule } from "../../actions";

export function ActionButton({
  label,
  confirm,
  action,
  primary = true,
}: {
  label: string;
  confirm?: string;
  action: () => Promise<{ error?: string }>;
  primary?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="space-y-1">
      <button
        className={`btn ${primary ? "btn-primary" : ""}`}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            const r = await action();
            if (r.error) setError(r.error);
            else router.refresh();
          });
        }}
      >
        {pending ? "Working…" : label}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export function StartButton({ id, label }: { id: string; label: string }) {
  return <ActionButton label={label} action={() => startModule(id)} />;
}

export function AdvanceButton({ id, label, confirm }: { id: string; label: string; confirm: string }) {
  return <ActionButton label={label} confirm={confirm} action={() => advancePhase(id)} />;
}

export type TagRow = { id: string; at_seconds: number; note: string };
export const mmss = (sec: number) =>
  `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/** Readout / debrief form. Autosaves every few seconds; the server refuses saves after the deadline. */
export function ResponseForm({
  id,
  fields,
  initial,
  tags,
  submitLabel,
  agents,
  prefillKey,
}: {
  id: string;
  fields: readonly FormField[];
  initial: Record<string, string>;
  tags?: TagRow[];
  submitLabel: string;
  /** Options for fields of kind "agent". */
  agents?: string[];
  /** localStorage key holding the agent picked on the dashboard, used to pre-fill the agent field. */
  prefillKey?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saved, setSaved] = useState<"saved" | "saving" | "dirty" | "locked">("saved");
  const [error, setError] = useState<string>();
  const latest = useRef(values);
  useEffect(() => {
    latest.current = values;
  }, [values]);
  const dirty = useRef(false);

  // Carry over the "Who do you want to coach?" choice from the dashboard.
  useEffect(() => {
    if (!prefillKey) return;
    const field = fields.find((f) => f.kind === "agent");
    if (!field || initial[field.key]) return;
    try {
      const saved = window.localStorage.getItem(prefillKey);
      if (saved) {
        // Browser storage only exists after mount; reading it here avoids a hydration mismatch.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setValues((v) => ({ ...v, [field.key]: saved }));
        dirty.current = true;
        setSaved("dirty");
      }
    } catch {
      /* storage unavailable */
    }
  }, [prefillKey, fields, initial]);

  const save = useCallback(
    async (final: boolean) => {
      setSaved("saving");
      const r = await saveResponse(id, latest.current, final);
      if (r.error) {
        setError(r.error);
        setSaved("dirty");
        return;
      }
      dirty.current = false;
      if (r.locked) {
        setSaved("locked");
        router.refresh();
      } else setSaved("saved");
    },
    [id, router],
  );

  useEffect(() => {
    const t = setInterval(() => {
      if (dirty.current) void save(false);
    }, 5000);
    return () => clearInterval(t);
  }, [save]);

  const insertTag = (key: string, tag: TagRow) => {
    setValues((v) => ({ ...v, [key]: `${v[key] ? v[key].trimEnd() + " " : ""}[${mmss(tag.at_seconds)}] ` }));
    dirty.current = true;
    setSaved("dirty");
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (window.confirm("Submit now? The form locks and cannot be changed.")) void save(true);
      }}
    >
      {fields.map((f) => (
        <div key={f.key}>
          <label htmlFor={f.key} className="label">{f.label}</label>
          {f.hint && <p className="-mt-1 mb-1.5 text-xs text-brand-gray">{f.hint}</p>}
          {f.kind === "agent" ? (
            <select
              id={f.key}
              className="input max-w-xs"
              value={values[f.key] ?? ""}
              disabled={saved === "locked"}
              onChange={(e) => {
                setValues((v) => ({ ...v, [f.key]: e.target.value }));
                dirty.current = true;
                setSaved("dirty");
              }}
              onBlur={() => dirty.current && void save(false)}
            >
              <option value="">Choose an agent…</option>
              {(agents ?? []).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          ) : (
          <textarea
            id={f.key}
            className="input min-h-24"
            value={values[f.key] ?? ""}
            maxLength={4000}
            disabled={saved === "locked"}
            onChange={(e) => {
              setValues((v) => ({ ...v, [f.key]: e.target.value }));
              dirty.current = true;
              setSaved("dirty");
            }}
            onBlur={() => dirty.current && void save(false)}
          />
          )}
          {tags && tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              <span className="muted">Link a tag:</span>
              {tags.map((t) => (
                <button type="button" key={t.id} className="badge hover:border-accent" onClick={() => insertTag(f.key, t)} title={t.note}>
                  {mmss(t.at_seconds)}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={saved === "saving" || saved === "locked"}>{submitLabel}</button>
        <span className="muted">
          {saved === "saved" ? "All changes saved" : saved === "saving" ? "Saving…" : saved === "locked" ? "Locked" : "Unsaved changes"}
        </span>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

/** Module 2: recording with one replay, Tag button and the debrief form side by side. */
export function Module2Workspace({
  id,
  videoUrl,
  plays,
  maxPlays,
  initialTags,
  debrief,
}: {
  id: string;
  videoUrl: string | null;
  plays: number;
  maxPlays: number;
  initialTags: TagRow[];
  /** Present once the debrief phase has started. */
  debrief?: { fields: readonly FormField[]; initial: Record<string, string> };
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [tags, setTags] = useState(initialTags);
  const [note, setNote] = useState("");
  const [usedPlays, setUsedPlays] = useState(plays);
  const [error, setError] = useState<string>();
  // True while a counted viewing is under way; resuming after a pause does not count again.
  const [viewing, setViewing] = useState(false);

  const onPlay = async () => {
    const v = video.current!;
    if (v.currentTime > 1 || viewing) return;
    setViewing(true);
    const r = await recordPlay(id);
    if (r.error) {
      v.pause();
      setError(r.error);
      setViewing(false);
      return;
    }
    setUsedPlays(r.plays!);
  };

  const tag = async () => {
    const at = video.current?.currentTime ?? 0;
    const r = await addTag(id, Math.round(at * 10) / 10, note.trim() || "(no note)");
    if (r.error) return setError(r.error);
    setTags((t) => [...t, r.tag!].sort((a, b) => a.at_seconds - b.at_seconds));
    setNote("");
  };

  const outOfPlays = usedPlays >= maxPlays && !viewing;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        {videoUrl ? (
          <video
            ref={video}
            src={videoUrl}
            controls={!outOfPlays}
            controlsList="nodownload noplaybackrate"
            disablePictureInPicture
            onPlay={onPlay}
            onEnded={() => setViewing(false)}
            onContextMenu={(e) => e.preventDefault()}
            className="w-full rounded-md bg-black"
          />
        ) : (
          <div className="card text-sm">The recording has not been uploaded yet. Please contact the certification admin.</div>
        )}
        <p className="muted">
          Plays used: {usedPlays} of {maxPlays} (one viewing plus one replay). Pausing is fine.
        </p>
        <div className="flex gap-2">
          <input className="input" placeholder="Short note for this moment" value={note} maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void tag())} />
          <button className="btn btn-primary" type="button" onClick={tag}>Tag</button>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <ul className="space-y-1 text-sm">
          {tags.map((t) => (
            <li key={t.id} className="flex gap-2"><span className="badge font-mono">{mmss(t.at_seconds)}</span>{t.note}</li>
          ))}
        </ul>
      </div>
      <div>
        {debrief && (
          <ResponseForm id={id} fields={debrief.fields} initial={debrief.initial} tags={tags} submitLabel="Submit debrief" />
        )}
      </div>
    </div>
  );
}
