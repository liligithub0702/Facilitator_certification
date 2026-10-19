import Link from "next/link";
import type { ReactNode } from "react";
import type { Profile } from "@/lib/types";

const NAV: Record<Profile["role"], { href: string; label: string }[]> = {
  facilitator: [{ href: "/facilitator", label: "My certification" }],
  grader: [{ href: "/grader", label: "Grading queue" }],
  leader: [{ href: "/leader", label: "Overview" }],
  admin: [
    { href: "/admin", label: "Cohorts" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/scenarios", label: "Scenario library" },
    { href: "/admin/settings", label: "Settings" },
    { href: "/grader", label: "Grading" },
    { href: "/leader", label: "Overview" },
  ],
};

export function AppShell({ profile, children }: { profile: Profile; children: ReactNode }) {
  return (
    <>
      <header className="no-print border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="font-semibold">TMU Certification</Link>
          <nav className="flex flex-wrap gap-4 text-sm">
            {NAV[profile.role].map((n) => (
              <Link key={n.href} href={n.href} className="text-muted hover:text-foreground">{n.label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="muted">{profile.full_name ?? profile.email} · {profile.role}</span>
            <form action="/auth/signout" method="post">
              <button className="btn">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}

export function StatusBadge({ value }: { value: string | null | undefined }) {
  const v = value ?? "—";
  const tone =
    v === "passed" || v === "certified" || v === "approved"
      ? "text-ok border-ok"
      : v === "not_passed" || v === "reassessment_required"
        ? "text-danger border-danger"
        : v === "development_required" || v === "submitted" || v === "draft"
          ? "text-warn border-warn"
          : "";
  return <span className={`badge ${tone}`}>{v.replace(/_/g, " ")}</span>;
}
