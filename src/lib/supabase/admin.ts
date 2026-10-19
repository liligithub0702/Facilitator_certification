import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS, so use it only after the caller's rights have been
 * checked with the user client: inviting users, signing Module 2 video URLs and reading a
 * scenario's video path for a facilitator who owns the submission.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) is not set");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
