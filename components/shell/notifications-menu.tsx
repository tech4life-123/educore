"use client";

import Link from "next/link";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Icons } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export interface NotificationItem {
  id: string;
  title: string;
  href: string;
  meta: string;
  unread: boolean;
}

/** Bell with the latest announcements; the badge counts unread ones. */
export function NotificationsMenu({
  items = [],
  unreadCount = 0,
  allHref,
}: {
  items?: NotificationItem[];
  unreadCount?: number;
  allHref?: string;
}) {
  const label = unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications";
  return (
    <DropdownMenu
      triggerLabel={label}
      trigger={
        <span className="relative inline-flex">
          <Icons.bell width={22} height={22} />
          {unreadCount ? (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </span>
      }
      className="w-80"
    >
      {items.length === 0 ? (
        <EmptyState icon="bell" title="No notifications" description="New announcements will appear here." />
      ) : (
        <div className="py-1">
          {items.map((item) => (
            <Link key={item.id} href={item.href} role="menuitem" className="block px-4 py-2.5 hover:bg-surface-muted focus:bg-surface-muted focus:outline-none">
              <span className={cn("flex items-center gap-2 text-sm text-foreground", item.unread && "font-semibold")}>
                {item.unread ? <span className="size-2 shrink-0 rounded-full bg-brand" aria-label="Unread" /> : null}
                <span className="truncate">{item.title}</span>
              </span>
              <span className="block text-xs text-muted">{item.meta}</span>
            </Link>
          ))}
          {allHref ? (
            <Link href={allHref} role="menuitem" className="block border-t border-border px-4 py-2.5 text-sm font-medium text-brand hover:bg-surface-muted focus:bg-surface-muted focus:outline-none">
              All announcements
            </Link>
          ) : null}
        </div>
      )}
    </DropdownMenu>
  );
}
