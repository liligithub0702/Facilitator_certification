import Link from "next/link";
import type { ReactNode } from "react";
import type { Profile } from "@/lib/types";
import { NavLinks } from "./NavLinks";

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

/** The ✦ mark from DesignX: magenta → violet → blue-violet. */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid size-8 place-items-center rounded-[10px] bg-[linear-gradient(135deg,var(--color-brand-magenta),var(--color-brandmark-mid)_55%,var(--color-brandmark-end))] text-white shadow-soft ${className}`}
    >
      ✦
    </span>
  );
}

export function AppShell({ profile, children }: { profile: Profile; children: ReactNode }) {
  const name = profile.full_name ?? profile.email;
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <>
      <header className="no-print sticky top-0 z-20 bg-[linear-gradient(180deg,#211e52,var(--color-brand-indigo-deep))] text-white shadow-mid">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
          <Link href="/" className="flex items-center gap-2.5 font-extrabold tracking-tight">
            <BrandMark />
            <span>
              TMU <span className="font-semibold text-white/70">Certification</span>
            </span>
          </Link>
          <NavLinks items={NAV[profile.role]} />
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-right leading-tight sm:block">
              <span className="block font-semibold">{name}</span>
              <span className="block text-xs text-white/60 capitalize">{profile.role}</span>
            </span>
            <span className="grid size-9 place-items-center rounded-full bg-white/12 text-xs font-bold ring-1 ring-white/20">
              {initials}
            </span>
            <form action="/auth/signout" method="post">
              <button className="rounded-full px-3 py-1.5 text-sm font-semibold text-white/75 ring-1 ring-white/20 transition hover:bg-white/10 hover:text-white">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">{children}</main>
    </>
  );
}

/** DesignX page head: magenta eyebrow, large title, grey subtitle, actions on the right. */
export function PageHeader({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="h1">{title}</h1>
        {sub && <p className="mt-2 max-w-3xl text-[15px] text-brand-gray">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TONES: Record<string, string> = {
  passed: "border-ok/30 bg-ok-bg text-ok",
  certified: "border-ok/30 bg-ok-bg text-ok",
  approved: "border-ok/30 bg-ok-bg text-ok",
  not_passed: "border-danger/30 bg-danger-bg text-danger",
  reassessment_required: "border-danger/30 bg-danger-bg text-danger",
  development_required: "border-warn/30 bg-warn-bg text-warn",
  submitted: "border-brand-blue/30 bg-brand-blue/8 text-brand-blue",
  draft: "border-warn/30 bg-warn-bg text-warn",
  in_progress: "border-brand-indigo/25 bg-brand-indigo/6 text-brand-indigo",
};

export function StatusBadge({ value }: { value: string | null | undefined }) {
  const v = value ?? "—";
  return <span className={`badge ${TONES[v] ?? ""}`}>{v.replace(/_/g, " ")}</span>;
}
