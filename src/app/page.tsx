import { redirect } from "next/navigation";
import { getSession, HOME_BY_ROLE } from "@/lib/auth";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.profile) redirect("/login?error=no-profile");
  redirect(HOME_BY_ROLE[session.profile.role]);
}
