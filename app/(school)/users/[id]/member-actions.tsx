"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SubmitButton } from "@/components/ui/submit-button";
import { CredentialsCard } from "@/components/users/credentials-card";
import { resetPasswordAction, setStatusAction, type MemberActionState } from "../actions";

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
  const [confirm, setConfirm] = useState<null | "suspend" | "reset">(null);

  const isActive = status === "active";

  return (
    <div className="space-y-4">
      {statusState.error ? <Alert tone="danger">{statusState.error}</Alert> : null}
      {statusState.success ? <Alert tone="success" title="Done">{statusState.success}</Alert> : null}
      {resetState.error ? <Alert tone="danger">{resetState.error}</Alert> : null}

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
      {!isActive ? <p className="text-xs text-muted">Reactivate the account before resetting its password.</p> : null}

      <Dialog
        open={confirm === "suspend"}
        onClose={() => setConfirm(null)}
        title={`Suspend ${fullName}?`}
        description="They will be signed out and unable to sign in or see any school data until reactivated. Nothing is deleted."
      >
        <form action={statusAction} onSubmit={() => setTimeout(() => setConfirm(null), 0)} className="flex justify-end gap-2 p-5">
          <input type="hidden" name="profileId" value={profileId} />
          <input type="hidden" name="status" value="suspended" />
          <Button variant="secondary" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
          <SubmitButton variant="danger" loadingText="Suspending…">
            Suspend
          </SubmitButton>
        </form>
      </Dialog>

      <Dialog
        open={confirm === "reset"}
        onClose={() => setConfirm(null)}
        title={`Reset ${fullName}’s password?`}
        description="Their current password stops working immediately. You’ll get a new one-time password to give them."
      >
        <form action={resetAction} onSubmit={() => setTimeout(() => setConfirm(null), 0)} className="flex justify-end gap-2 p-5">
          <input type="hidden" name="profileId" value={profileId} />
          <Button variant="secondary" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
          <SubmitButton loadingText="Resetting…">Reset password</SubmitButton>
        </form>
      </Dialog>
    </div>
  );
}
