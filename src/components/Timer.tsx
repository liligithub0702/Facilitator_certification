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
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-bold tabular-nums ${s <= 60 ? "border-danger bg-danger-bg text-danger" : "border-line-strong bg-paper text-ink"}`}
      role="timer"
      aria-live={s <= 60 ? "polite" : "off"}
    >
      <span className="font-semibold text-brand-gray">{label}</span> {mm}:{ss}
    </div>
  );
}
