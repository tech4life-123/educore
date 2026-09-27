import Link from "next/link";
import type { ReactNode } from "react";
import { brandStyle } from "@/lib/branding";
import type { NavItem } from "@/lib/navigation";
import { MobileNav } from "./mobile-nav";
import { NavList } from "./nav-list";
import { NotificationsMenu } from "./notifications-menu";
import { UserMenu } from "./user-menu";

export interface ShellIdentity {
  /** Rendered in the sidebar header and mobile drawer (logo + name). */
  brand: ReactNode;
  primaryColor: string | null;
  homeHref: string;
}

export interface ShellUser {
  fullName: string;
  email: string | null;
  roleLabel: string;
  settingsHref?: string;
}

/**
 * Responsive application frame.
 *  - Desktop (lg+): fixed sidebar + top bar + content.
 *  - Mobile: top bar with menu button → navigation drawer.
 */
export function AppShell({
  identity,
  user,
  navigation,
  signOutAction,
  notifications,
  banner,
  children,
}: {
  identity: ShellIdentity;
  user: ShellUser;
  navigation: readonly NavItem[];
  signOutAction: () => Promise<void>;
  /** Bell contents; defaults to an empty bell. */
  notifications?: ReactNode;
  /** Full-width notice under the top bar (e.g. demonstration school). */
  banner?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={brandStyle(identity.primaryColor)} className="min-h-dvh bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow"
      >
        Skip to main content
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface lg:flex print:!hidden">
        <Link href={identity.homeHref} className="flex items-center gap-3 border-b border-border px-4 py-4">
          {identity.brand}
        </Link>
        <nav aria-label="Main" className="flex-1 overflow-y-auto p-3">
          <NavList items={navigation} />
        </nav>
        <p className="border-t border-border px-4 py-3 text-xs text-subtle">Powered by EduCore</p>
      </aside>

      <div className="lg:pl-64 print:!pl-0">
        <header className="sticky top-0 z-20 flex h-16 print:hidden items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur sm:px-6">
          <MobileNav items={navigation} header={<span className="flex items-center gap-3">{identity.brand}</span>} />
          <div className="min-w-0 flex-1 lg:hidden">
            <Link href={identity.homeHref} className="flex items-center gap-2">
              {identity.brand}
            </Link>
          </div>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {notifications ?? <NotificationsMenu />}
            <UserMenu {...user} signOutAction={signOutAction} />
          </div>
        </header>

        {banner}
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8 print:max-w-none print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}

export function SchoolBrand({ logo, name, subtitle }: { logo: ReactNode; name: string; subtitle?: string }) {
  return (
    <>
      {logo}
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
        {subtitle ? <span className="block truncate text-xs text-muted">{subtitle}</span> : null}
      </span>
    </>
  );
}
