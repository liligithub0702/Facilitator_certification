import { AppShell } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

export default async function Layout({ children }: LayoutProps<"/leader">) {
  const { profile } = await requireRole("leader", "admin");
  return <AppShell profile={profile}>{children}</AppShell>;
}
