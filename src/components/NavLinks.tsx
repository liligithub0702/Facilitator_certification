"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  // The longest matching href wins, so /admin/users does not also light up /admin.
  const active = items
    .filter((i) => path === i.href || path.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className="flex flex-wrap gap-1 text-sm">
      {items.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={`rounded-full px-3 py-1.5 font-semibold transition ${
            n.href === active ? "bg-white text-brand-indigo" : "text-white/75 hover:bg-white/10 hover:text-white"
          }`}
        >
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
