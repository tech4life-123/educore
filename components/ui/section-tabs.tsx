"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/** Horizontal sub-navigation for a section; the active tab is marked with aria-current. */
export function SectionTabs({ label, tabs }: { label: string; tabs: ReadonlyArray<{ href: string; label: string; exact?: boolean }> }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto border-b border-border print:hidden">
      <ul className="flex min-w-max gap-1 px-1">
        {tabs.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center border-b-2 px-3 text-sm font-medium transition-colors",
                  active ? "border-brand text-foreground" : "border-transparent text-muted hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
