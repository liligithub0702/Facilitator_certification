"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Countdown to a server-set deadline. The server is the source of truth: when time runs
 * out the page refreshes and Postgres moves the submission to its next phase.
 * `serverNow` corrects for a wrong clock on the facilitator's machine.
 */
export function Timer({ deadline, serverNow, label }: { deadline: string; serverNow: number; label: string }) {
  const router = useRouter();
  const [offset] = useState(() => serverNow - Date.now());
  const [left, setLeft] = useState(() => new Date(deadline).getTime() - serverNow);
  const fired = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      const ms = new Date(deadline).getTime() - (Date.now() + offset);
      setLeft(ms);
      if (ms <= 0 && !fired.current) {
        fired.current = true;
        // Give the server's grace window a moment, then let it lock the phase.
        setTimeout(() => router.refresh(), 1500);
      }
    }, 250);
    return () => clearInterval(id);
  }, [deadline, offset, router]);

  const s = Math.max(0, Math.ceil(left / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return (
    <div
      className={`sticky top-2 z-10 inline-flex items-center gap-2 rounded-md border bg-surface px-3 py-1.5 font-mono text-sm ${s <= 60 ? "border-danger text-danger" : "border-border"}`}
      role="timer"
      aria-live={s <= 60 ? "polite" : "off"}
    >
      <span className="font-sans text-muted">{label}</span> {mm}:{ss}
    </div>
  );
}
