"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";

// Email + password sign-in. No emails are sent, so no SMTP set-up is needed.
// Turn off "Confirm email" in Supabase Auth so new accounts can sign in straight away.

export type LoginState = { error?: string; message?: string };

const MIN_PASSWORD = 8;
const read = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function signIn(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = read(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "invalid_credentials") return { error: "Wrong email or password." };
    if (error.code === "email_not_confirmed") return { error: CONFIRM_EMAIL_ON };
    console.error("signInWithPassword failed", error.code, error.status, error.message);
    return { error: friendly(error.code, error.status, error.message) };
  }
  redirect("/");
}

export async function signUp(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = read(formData, "email").toLowerCase();
  const fullName = read(formData, "full_name");
  const password = String(formData.get("password") ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  if (!fullName) return { error: "Enter your name." };
  if (password.length < MIN_PASSWORD) return { error: `Use a password of at least ${MIN_PASSWORD} characters.` };

  // Friendly early answer for the work-domain rule. The database enforces it regardless.
  const domains = await allowedDomains();
  if (domains.length && !domains.includes(email.split("@")[1])) {
    return { error: `Use your work email (${domains.map((d) => `@${d}`).join(", ")}).` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
  if (error) {
    if (error.code === "user_already_exists") return { error: "An account with this email already exists. Sign in instead." };
    console.error("signUp failed", error.code, error.status, error.message);
    return { error: friendly(error.code, error.status, error.message) };
  }
  if (!data.session) return { error: CONFIRM_EMAIL_ON };
  redirect("/");
}

const CONFIRM_EMAIL_ON =
  "Your account needs email confirmation, which is switched off for this app. Ask the admin to turn off \"Confirm email\" in Supabase (Authentication → Sign In / Providers → Email).";

async function allowedDomains(): Promise<string[]> {
  try {
    const { data } = await createAdminClient().from("settings").select("value").eq("key", "signup").maybeSingle();
    const list = (data?.value as { allowed_domains?: string[] } | undefined)?.allowed_domains ?? [];
    return list.map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
  } catch {
    return [];
  }
}

export async function signInWithMicrosoft() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: { scopes: "email", redirectTo: `${siteUrl()}/auth/callback` },
  });
  if (error || !data.url) redirect("/login?error=sso");
  redirect(data.url);
}

/** Plain-language reasons for the failures people actually hit, with the code for support. */
function friendly(code: string | undefined, status: number | undefined, message: string): string {
  const ref = ` (${code ?? status ?? "unknown"})`;
  switch (code) {
    case "over_request_rate_limit":
      return `Too many attempts. Wait a few minutes and try again.${ref}`;
    case "weak_password":
      return `That password is too weak. Use a longer one.${ref}`;
    case "email_address_invalid":
      return `That email address was not accepted. Check it for typos.${ref}`;
    case "signup_disabled":
      return `New sign-ups are turned off. Ask the certification admin to create your account.${ref}`;
    case "unexpected_failure":
      return /saving new user/i.test(message)
        ? `This email can't be used to sign up. Use your work email, or ask the admin to create your account.${ref}`
        : `The sign-in service had a problem. Try again shortly.${ref}`;
  }
  if (/<!DOCTYPE|not valid JSON|fetch failed/i.test(message))
    return `The app can't reach Supabase. Check NEXT_PUBLIC_SUPABASE_URL in Vercel: it must look like https://<project-id>.supabase.co, then redeploy.${ref}`;
  if (status === 401 || /api key/i.test(message)) return `The app is not connected to Supabase correctly (check the keys in Vercel).${ref}`;
  return `${message}${ref}`;
}
