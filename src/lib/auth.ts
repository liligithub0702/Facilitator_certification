import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";

/** Data access layer: the signed-in user, their profile and an RLS-scoped client. */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  return { supabase, user, profile };
});

export async function requireRole(...roles: Role[]) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.profile) redirect("/login?error=no-profile");
  if (!roles.includes(session.profile.role)) redirect("/");
  return { supabase: session.supabase, user: session.user, profile: session.profile };
}

export const HOME_BY_ROLE: Record<Role, string> = {
  facilitator: "/facilitator",
  grader: "/grader",
  admin: "/admin",
  leader: "/leader",
};
