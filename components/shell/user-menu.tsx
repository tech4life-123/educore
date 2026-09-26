"use client";

import Link from "next/link";
import { DropdownMenu, menuItemClasses } from "@/components/ui/dropdown-menu";
import { Icons } from "@/components/ui/icons";
import { initialsFor } from "@/lib/branding";

export function UserMenu({
  fullName,
  email,
  roleLabel,
  settingsHref,
  signOutAction,
}: {
  fullName: string;
  email: string | null;
  roleLabel: string;
  settingsHref?: string;
  signOutAction: () => Promise<void>;
}) {
  return (
    <DropdownMenu
      triggerLabel={`Account menu for ${fullName}`}
      trigger={
        <>
          <span className="flex size-8 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-foreground">
            {initialsFor(fullName)}
          </span>
          <span className="hidden text-left md:block">
            <span className="block max-w-40 truncate text-sm font-medium">{fullName}</span>
            <span className="block text-xs text-muted">{roleLabel}</span>
          </span>
          <Icons.chevronDown className="hidden text-muted md:block" width={16} height={16} />
        </>
      }
    >
      <div className="border-b border-border px-3 py-2">
        <p className="truncate text-sm font-medium">{fullName}</p>
        {email ? <p className="truncate text-xs text-muted">{email}</p> : null}
        <p className="text-xs text-muted md:hidden">{roleLabel}</p>
      </div>
      {settingsHref ? (
        <Link href={settingsHref} role="menuitem" className={menuItemClasses}>
          <Icons.user width={16} height={16} />
          Profile & settings
        </Link>
      ) : null}
      <form action={signOutAction}>
        <button type="submit" role="menuitem" className={menuItemClasses}>
          <Icons.logout width={16} height={16} />
          Sign out
        </button>
      </form>
    </DropdownMenu>
  );
}
