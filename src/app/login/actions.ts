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
    console.error("signInWithOtp failed", error.code, error.message);
    return { error: "Could not send the link. Try again shortly." };
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
