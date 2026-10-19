"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, {});
  return (
    <form action={action} className="space-y-3">
      <div>
        <label htmlFor="email" className="label">Work email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </div>
      <button className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
      {state.message && <p className="text-sm text-ok">{state.message}</p>}
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
    </form>
  );
}
