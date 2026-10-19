import { AppShell } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";

export default async function Layout({ children }: LayoutProps<"/grader">) {
  const { profile } = await requireRole("grader", "admin");
  return <AppShell profile={profile}>{children}</AppShell>;
}
