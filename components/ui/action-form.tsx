"use client";

import { createContext, useActionState, useContext, useEffect, useRef, useTransition, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import { Alert } from "./alert";

const PendingContext = createContext(false);

/** True while the surrounding <ActionForm> is submitting. */
export function useActionFormPending(): boolean {
  return useContext(PendingContext);
}

/**
 * A form bound to a server action that returns an {@link ActionState}.
 *
 * Unlike a plain `<form action>`, the fields are NOT cleared after the action
 * runs, so a validation error never throws away what the user typed. Pass
 * `resetOnSuccess` for "add" forms that should empty after a success.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  compact = false,

  "aria-label": ariaLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  /** Show feedback as a single line instead of an alert box (for table rows). */
  compact?: boolean;
  "aria-label"?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state.status === "success") formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <PendingContext.Provider value={pending}>
      <form
        ref={formRef}
        aria-label={ariaLabel}
        noValidate
        className={cn(compact ? "space-y-1" : "space-y-3", className)}
        onSubmit={(event) => {
          event.preventDefault();
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          const data = new FormData(event.currentTarget, submitter);
          startTransition(() => formAction(data));
        }}
      >
        {!compact && state.message ? (
          <Alert tone={state.status === "error" ? "danger" : "success"} title={state.status === "error" ? undefined : "Done"}>
            {state.message}
          </Alert>
        ) : null}
        {children}
        {compact && state.message ? (
          <p role={state.status === "error" ? "alert" : "status"} className={cn("text-xs font-medium", state.status === "error" ? "text-danger" : "text-success")}>
            {state.message}
          </p>
        ) : null}
      </form>
    </PendingContext.Provider>
  );
}
