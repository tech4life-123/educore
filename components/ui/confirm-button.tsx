"use client";

import { useState, type ReactNode } from "react";
import { Button } from "./button";
import { SubmitButton } from "./submit-button";

/**
 * Two-step submit for destructive actions inside a form: the first click asks,
 * the second submits. Nothing overlays the page (no modal), so it behaves the
 * same in every browser.
 */
export function ConfirmButton({
  children,
  confirmLabel = "Yes, remove",
  pendingLabel = "Removing…",
  question = "Are you sure?",
}: {
  children: ReactNode;
  confirmLabel?: string;
  pendingLabel?: string;
  question?: string;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <Button variant="ghost" size="sm" className="text-danger" onClick={() => setArmed(true)}>
        {children}
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2" role="group" aria-label={question}>
      <span className="text-xs font-medium text-danger">{question}</span>
      <SubmitButton variant="danger" size="sm" loadingText={pendingLabel} autoFocus>
        {confirmLabel}
      </SubmitButton>
      <Button variant="secondary" size="sm" onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </span>
  );
}
