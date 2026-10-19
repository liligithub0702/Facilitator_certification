"use client";

import { useState } from "react";

/** datetime-local in the user's own timezone; the offset lets the server store UTC. */
export function SessionInput({
  action,
  value,
  name = "session_at",
  label = "Live session time",
}: {
  action: (fd: FormData) => Promise<void>;
  value: string | null;
  name?: string;
  label?: string;
}) {
  const toLocal = (iso: string) => {
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  };
  const [tz] = useState(() => new Date().getTimezoneOffset());
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 text-sm">
      <label>
        <span className="label">{label}</span>
        <input type="datetime-local" name={name} defaultValue={value ? toLocal(value) : ""} className="input" />
      </label>
      <input type="hidden" name="tz_offset" value={tz} />
      <button className="btn">Save</button>
    </form>
  );
}
