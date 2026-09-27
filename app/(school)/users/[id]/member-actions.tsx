"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { CredentialsCard } from "@/components/users/credentials-card";
import { resetPasswordAction, setStatusAction, type MemberActionState } from "../actions";

/**
 * Suspend / reactivate / reset password.
 *
 * Confirmation happens INLINE (a panel that expands in the page) rather than
 * in a modal: nothing overlays the page, so there is no backdrop to click by
 * accident, and it behaves the same in every browser.
 */
export function MemberActions({
  profileId,
  fullName,
  roleLabel,
  status,
  loginId,
  schoolName,
  siteUrl,
}: {
  profileId: string;
  fullName: string;
  roleLabel: string;
  status: string;
  loginId: string;
  schoolName: string;
  siteUrl: string;
}) {
  const [statusState, statusAction] = useActionState<MemberActionState, FormData>(setStatusAction, {});
  const [resetState, resetAction] = useActionState<MemberActionState, FormData>(resetPasswordAction, {});
  // The panel remembers the action result that existed when it opened; as soon
  // as the action returns a new result, the panel is no longer shown.
  const [opened, setOpened] = useState<null | { kind: "suspend" | "reset"; since: MemberActionState }>(null);
  const confirm =
    opened && (opened.kind === "suspend" ? statusState : resetState) === opened.since ? opened.kind : null;
  const setConfirm = (kind: null | "suspend" | "reset") =>
    setOpened(kind ? { kind, since: kind === "suspend" ? statusState : resetState } : null);

  // Bring each new result into view (a DOM side effect only).
  const feedbackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (statusState.success || statusState.error || resetState.success || resetState.error) {
      feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      feedbackRef.current?.focus();
    }
  }, [statusState, resetState]);

  const isActive = status === "active";

  return (
    <div className="space-y-4">
      <div ref={feedbackRef} tabIndex={-1} className="space-y-4 outline-none">
        {statusState.error ? <Alert tone="danger" title="Couldn’t change the account">{statusState.error}</Alert> : null}
        {statusState.success ? <Alert tone="success" title="Done">{statusState.success}</Alert> : null}
        {resetState.error ? <Alert tone="danger" title="Couldn’t reset the password">{resetState.error}</Alert> : null}
        {resetState.temporaryPassword ? (
          <CredentialsCard
            fullName={fullName}
            roleLabel={roleLabel}
            schoolName={schoolName}
            loginId={loginId}
            temporaryPassword={resetState.temporaryPassword}
            siteUrl={siteUrl}
          />
        ) : null}
      </div>

      {confirm === null ? (
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="secondary" onClick={() => setConfirm("reset")} disabled={!isActive}>
            Reset password
          </Button>
          {isActive ? (
            <Button variant="danger" onClick={() => setConfirm("suspend")}>
              Suspend account
            </Button>
          ) : (
            <form action={statusAction}>
              <input type="hidden" name="profileId" value={profileId} />
              <input type="hidden" name="status" value="active" />
              <SubmitButton loadingText="Reactivating…">Reactivate account</SubmitButton>
            </form>
          )}
        </div>
      ) : null}
      {!isActive && confirm === null ? (
        <p className="text-xs text-muted">Reactivate the account before resetting its password.</p>
      ) : null}

      {confirm === "suspend" ? (
        <ConfirmPanel
          tone="danger"
          title={`Suspend ${fullName}?`}
          description="They will be signed out and unable to sign in or see any school data until reactivated. Nothing is deleted."
          action={statusAction}
          fields={{ profileId, status: "suspended" }}
          confirmLabel="Yes, suspend"
          pendingLabel="Suspending…"
          onCancel={() => setConfirm(null)}
        />
      ) : null}

      {confirm === "reset" ? (
        <ConfirmPanel
          tone="warning"
          title={`Reset ${fullName}’s password?`}
          description="Their current password stops working immediately. You’ll get a new one-time password to give them."
          action={resetAction}
          fields={{ profileId }}
          confirmLabel="Yes, reset password"
          pendingLabel="Resetting…"
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </div>
  );
}

function ConfirmPanel({
  tone,
  title,
  description,
  action,
  fields,
  confirmLabel,
  pendingLabel,
  onCancel,
}: {
  tone: "danger" | "warning";
  title: string;
  description: string;
  action: (formData: FormData) => void;
  fields: Record<string, string>;
  confirmLabel: string;
  pendingLabel: string;
  onCancel: () => void;
}) {
  return (
    <form
      action={action}
      role="alertdialog"
      aria-label={title}
      className={
        tone === "danger"
          ? "space-y-3 rounded-lg border border-danger/30 bg-danger-soft p-4 print:hidden"
          : "space-y-3 rounded-lg border border-warning/30 bg-warning-soft p-4 print:hidden"
      }
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-foreground/80">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <SubmitButton autoFocus variant={tone === "danger" ? "danger" : "primary"} loadingText={pendingLabel}>
          {confirmLabel}
        </SubmitButton>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
