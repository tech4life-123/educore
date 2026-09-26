"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icons } from "@/components/ui/icons";
import type { NavItem } from "@/lib/navigation";

export function NavList({ items, onNavigate }: { items: readonly NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const Icon = Icons[item.icon];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        if (!item.available) {
          return (
            <li key={item.href}>
              <span
                aria-disabled="true"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-subtle"
              >
                <Icon />
                <span className="flex-1">{item.label}</span>
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-muted">
                  Soon
                </span>
              </span>
            </li>
          );
        }

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-brand text-brand-foreground" : "text-foreground hover:bg-surface-muted",
              )}
            >
              <Icon />
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
