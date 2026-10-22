// Supabase is only called from the server, so plain names (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
// are preferred. NEXT_PUBLIC_* and the legacy anon/service_role names from the Vercel
// integration are still accepted.
export const SUPABASE_URL = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
export const SUPABASE_PUBLIC_KEY = (
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  ""
).trim();

export function siteUrl(): string {
  const configured = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.trim().replace(/\/$/, "");
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** Request-time clock reading, used to correct countdowns for a skewed client clock. */
export function serverTime(): number {
  return Date.now();
}
