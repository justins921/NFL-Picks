"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "This Week" },
  { href: "/my-picks", label: "My Picks" },
  { href: "/standings", label: "Standings" },
];

export function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = isAdmin ? [...TABS, { href: "/admin", label: "Family" }] : TABS;

  return (
    <nav className="sticky bottom-0 z-20 border-t border-line bg-field/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl">
        {tabs.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-1 items-center justify-center text-sm font-semibold ${
                active ? "text-chalk" : "text-muted"
              }`}
            >
              <span className={active ? "border-b-2 border-chalk pb-0.5" : ""}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
