"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";

export type LoginState = { message?: string; error?: string };

export async function sendMagicLink(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Invite-only: never create accounts from the login page.
    options: { shouldCreateUser: false, emailRedirectTo: `${siteUrl()}/auth/callback` },
  });
  // Unknown addresses get the same message as known ones, so the form can't be used to probe accounts.
  const unknownUser = error && ["otp_disabled", "signup_disabled", "user_not_found"].includes(error.code ?? "");
  if (error && !unknownUser) {
    console.error("signInWithOtp failed", error.code, error.message);
    return { error: "Could not send the link. Try again shortly." };
  }
  return { message: "If this address has access, a sign-in link is on its way. Check your inbox." };
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
