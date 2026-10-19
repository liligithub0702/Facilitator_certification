import { AppShell } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

export default async function Layout({ children }: LayoutProps<"/facilitator">) {
  const { profile } = await requireRole("facilitator");
  return <AppShell profile={profile}>{children}</AppShell>;
}
