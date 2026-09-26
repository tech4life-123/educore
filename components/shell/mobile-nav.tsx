"use client";

import { useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Icons } from "@/components/ui/icons";
import type { NavItem } from "@/lib/navigation";
import { NavList } from "./nav-list";

/** Hamburger button + slide-in navigation drawer for small screens. */
export function MobileNav({ items, header }: { items: readonly NavItem[]; header: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={open}
        className="-ml-1.5 rounded-lg p-1.5 text-foreground hover:bg-surface-muted lg:hidden"
      >
        <Icons.menu width={24} height={24} />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={header} variant="drawer">
        <nav aria-label="Main" className="p-3">
          <NavList items={items} onNavigate={() => setOpen(false)} />
        </nav>
      </Dialog>
    </>
  );
}
