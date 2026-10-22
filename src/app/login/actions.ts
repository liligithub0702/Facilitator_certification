"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";

export type LoginState = { message?: string; error?: string };

export async function sendMagicLink(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };

  // Friendly early answer for the work-domain rule. The database enforces it regardless.
  const domains = await allowedDomains();
  const domain = email.split("@")[1];
  if (domains.length && !domains.includes(domain)) {
    return { error: `Use your work email (${domains.map((d) => `@${d}`).join(", ")}).` };
  }

  // Signs in existing users and creates an account (as a facilitator) for new ones.
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${siteUrl()}/auth/callback` },
  });
  if (error) {
    console.error("signInWithOtp failed", error.code, error.status, error.message);
    return { error: loginErrorMessage(error.code, error.status, error.message) };
  }
  return { message: "A sign-in link is on its way. Check your inbox (and spam folder)." };
}

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
function loginErrorMessage(code: string | undefined, status: number | undefined, message: string): string {
  const ref = ` (${code ?? status ?? "unknown"})`;
  switch (code) {
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return `Too many sign-in emails in a short time. Wait an hour and try again, or ask the admin to set up the email sender (SMTP).${ref}`;
    case "email_address_not_authorized":
      return `Emails can't be sent to this address yet: the app's email sender (SMTP) is not set up.${ref}`;
    case "email_address_invalid":
      return `That email address was not accepted. Check it for typos.${ref}`;
    case "signup_disabled":
    case "otp_disabled":
      return `New sign-ups are turned off. Ask the certification admin for an invite.${ref}`;
    case "unexpected_failure":
      return /saving new user/i.test(message)
        ? `This email can't be used to sign up. Use your work email, or ask the admin for an invite.${ref}`
        : `The sign-in service had a problem. Try again shortly.${ref}`;
  }
  if (status === 401 || /api key/i.test(message)) return `The app is not connected to Supabase correctly (check the keys in Vercel).${ref}`;
  return `Could not send the link: ${message}${ref}`;
}
