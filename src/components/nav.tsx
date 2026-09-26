"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, LayoutGrid, MapPin, Plus, Trophy } from "lucide-react";

const TABS = [
  { href: "/log", label: "My Log", icon: BookOpen },
  { href: "/directory", label: "Directory", icon: LayoutGrid },
  { href: "/map", label: "Map", icon: MapPin },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
];

function useActive() {
  const path = usePathname();
  return (href: string) => (href === "/log" ? path === "/log" || /^\/log\/(?!new)/.test(path) : path.startsWith(href));
}

export function TopNav() {
  const isActive = useActive();
  return (
    <nav className="ml-4 hidden items-center gap-1 md:flex">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${isActive(t.href) ? "bg-cream text-brew-dark" : "text-stone-600 hover:text-brew"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

function Tab({ t, active }: { t: (typeof TABS)[number]; active: boolean }) {
  return (
    <Link
      href={t.href}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-brew-dark" : "text-stone-500"}`}
    >
      <t.icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : ""}`} />
      {t.label}
    </Link>
  );
}

export function BottomTabs() {
  const isActive = useActive();
  const [a, b, c, d] = TABS;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-crema bg-foam/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-md items-end">
        <Tab t={a} active={isActive(a.href)} />
        <Tab t={b} active={isActive(b.href)} />
        <Link href="/log/new" className="-mt-5 flex flex-1 flex-col items-center" aria-label="Log a root beer">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brew text-foam shadow-lg ring-4 ring-foam">
            <Plus className="h-7 w-7" />
          </span>
        </Link>
        <Tab t={c} active={isActive(c.href)} />
        <Tab t={d} active={isActive(d.href)} />
      </div>
    </nav>
  );
}
