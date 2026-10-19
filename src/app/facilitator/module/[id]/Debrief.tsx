import { DEBRIEF_FIELDS, type Tag } from "@/lib/types";

const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

export function Debrief({ debrief, tags }: { debrief: Record<string, string>; tags: Tag[] }) {
  return (
    <div className="space-y-4">
      <dl className="space-y-3">
        {DEBRIEF_FIELDS.map((f) => (
          <div key={f.key}>
            <dt className="text-sm font-medium">{f.label}</dt>
            <dd className="whitespace-pre-wrap text-sm">{debrief[f.key] || "—"}</dd>
          </div>
        ))}
      </dl>
      {tags.length > 0 && (
        <div>
          <h3 className="text-sm font-medium">Tags</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {tags.map((t) => (
              <li key={t.id} className="flex gap-2"><span className="badge font-mono">{mmss(Number(t.at_seconds))}</span>{t.note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
