"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { CredentialsCard } from "@/components/users/credentials-card";
import { resetAdminPasswordAction, type AdminAccountState } from "./actions";

/** Resets one administrator's password and shows the one-time slip in place. */
export function ResetAdminPassword({
  schoolId,
  profileId,
  schoolName,
  siteUrl,
  name,
}: {
  schoolId: string;
  profileId: string;
  schoolName: string;
  siteUrl: string;
  name: string;
}) {
  const [state, formAction] = useActionState<AdminAccountState, FormData>(resetAdminPasswordAction, {});

  if (state.slip) {
    return (
      <div className="w-full space-y-3">
        <CredentialsCard
          fullName={state.slip.fullName}
          roleLabel="School Administrator"
          schoolName={schoolName}
          loginId={state.slip.loginId}
          temporaryPassword={state.slip.temporaryPassword}
          siteUrl={siteUrl}
        />
      </div>
    );
  }
  return (
    <form action={formAction} className="space-y-1" aria-label={`Reset password for ${name}`}>
      <input type="hidden" name="school_id" value={schoolId} />
      <input type="hidden" name="profile_id" value={profileId} />
      <SubmitButton size="sm" variant="secondary" loadingText="Resetting…">
        Reset password
      </SubmitButton>
      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
    </form>
  );
}
