"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

export interface PickerOption {
  value: string;
  label: string;
  detail?: string;
}

/**
 * Searchable checkbox list for choosing many items (students, subjects).
 * Checked values are submitted as repeated `name` fields; filtering only hides
 * rows, so ticked items stay selected while you search.
 */
export function CheckboxPicker({
  name,
  options,
  searchLabel,
  emptyText = "Nothing to choose from.",
}: {
  name: string;
  options: PickerOption[];
  searchLabel: string;
  emptyText?: string;
}) {
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => `${o.label} ${o.detail ?? ""}`.toLowerCase().includes(q)) : options;
  }, [options, query]);

  if (options.length === 0) return <p className="text-sm text-muted">{emptyText}</p>;

  const allVisibleChecked = visible.length > 0 && visible.every((o) => checked.has(o.value));
  const toggle = (value: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(value);
      else next.delete(value);
      return next;
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor={`${name}-search`}>
          {searchLabel}
        </label>
        <Input
          id={`${name}-search`}
          type="search"
          placeholder={searchLabel}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-5 w-5 accent-[var(--brand)]"
            checked={allVisibleChecked}
            onChange={(e) => {
              const on = e.target.checked;
              setChecked((prev) => {
                const next = new Set(prev);
                for (const o of visible) {
                  if (on) next.add(o.value);
                  else next.delete(o.value);
                }
                return next;
              });
            }}
          />
          <span>Select all{query ? " shown" : ""}</span>
        </label>
        <span className="text-sm text-muted" aria-live="polite">
          {checked.size} selected
        </span>
      </div>
      <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {options.map((o) => {
          const hidden = !visible.includes(o);
          return (
            <li key={o.value} hidden={hidden}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-surface-muted">
                <input
                  type="checkbox"
                  name={name}
                  value={o.value}
                  checked={checked.has(o.value)}
                  onChange={(e) => toggle(o.value, e.target.checked)}
                  className="h-5 w-5 shrink-0 accent-[var(--brand)]"
                />
                <span className="min-w-0 flex-1 truncate text-foreground">{o.label}</span>
                {o.detail ? <span className="shrink-0 font-mono text-xs text-muted">{o.detail}</span> : null}
              </label>
            </li>
          );
        })}
        {visible.length === 0 ? <li className="px-3 py-4 text-sm text-muted">No matches.</li> : null}
      </ul>
    </div>
  );
}
