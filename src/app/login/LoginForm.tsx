"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type LoginState } from "./actions";

export function LoginForm() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [inState, inAction, inPending] = useActionState<LoginState, FormData>(signIn, {});
  const [upState, upAction, upPending] = useActionState<LoginState, FormData>(signUp, {});
  const state = mode === "in" ? inState : upState;
  const pending = inPending || upPending;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-md border border-border p-1 text-sm" role="tablist">
        {(["in", "up"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded px-2 py-1 ${mode === m ? "bg-accent text-accent-fg" : "text-muted"}`}
          >
            {m === "in" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form key={mode} action={mode === "in" ? inAction : upAction} className="space-y-3">
        {mode === "up" && (
          <div>
            <label htmlFor="full_name" className="label">Your name</label>
            <input id="full_name" name="full_name" autoComplete="name" required className="input" />
          </div>
        )}
        <div>
          <label htmlFor="email" className="label">Work email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            minLength={mode === "up" ? 8 : undefined}
            required
            className="input"
          />
          {mode === "up" && <p className="muted mt-1">At least 8 characters.</p>}
        </div>
        <button className="btn btn-primary w-full" disabled={pending}>
          {pending ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
        {state.error && <p className="text-sm text-danger">{state.error}</p>}
        {mode === "in" && <p className="muted">Forgot your password? Ask the certification admin to reset it.</p>}
      </form>
    </div>
  );
}
