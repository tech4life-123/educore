"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Lightweight accessible dropdown (menu button pattern):
 * Enter/Space/ArrowDown open, arrow keys move, Escape closes and returns focus,
 * click outside closes.
 */
export function DropdownMenu({
  trigger,
  triggerLabel,
  children,
  align = "end",
  className,
}: {
  trigger: ReactNode;
  triggerLabel: string;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    // Move focus to the first item when opened.
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="flex items-center gap-2 rounded-lg p-1.5 text-foreground hover:bg-surface-muted"
      >
        {trigger}
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={triggerLabel}
          onKeyDown={onMenuKeyDown}
          onClick={(event) => {
            // Close AFTER the click finishes. Closing synchronously unmounts the
            // menu before the browser dispatches a menu item's form submit
            // ("form is not connected"), which silently broke Sign out.
            if ((event.target as HTMLElement).closest('[role="menuitem"]')) {
              setTimeout(() => setOpen(false), 0);
            }
          }}
          className={cn(
            "absolute z-40 mt-2 min-w-56 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export const menuItemClasses =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted focus:bg-surface-muted focus:outline-none";
