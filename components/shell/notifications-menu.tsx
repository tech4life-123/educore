"use client";

import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Icons } from "@/components/ui/icons";

/** Placeholder: notifications arrive in a later milestone. No fake items. */
export function NotificationsMenu() {
  return (
    <DropdownMenu triggerLabel="Notifications" trigger={<Icons.bell width={22} height={22} />} className="w-72">
      <EmptyState
        icon="bell"
        title="No notifications"
        description="Notifications will appear here once school modules are enabled."
      />
    </DropdownMenu>
  );
}
