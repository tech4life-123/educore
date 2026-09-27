"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { TextField } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { changePassword, type ChangePasswordState } from "./actions";

export function ChangePasswordForm() {
  const [state, formAction] = useActionState<ChangePasswordState, FormData>(changePassword, {});

  return (
    <form action={formAction} noValidate className="space-y-4">
      {state.formError ? <Alert tone="danger">{state.formError}</Alert> : null}
      <TextField
        id="password"
        name="password"
        type="password"
        label="New password"
        autoComplete="new-password"
        hint="At least 8 characters, with a letter and a number."
        required
        error={state.fieldErrors?.password}
      />
      <TextField
        id="confirm"
        name="confirm"
        type="password"
        label="Confirm new password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirm}
      />
      <SubmitButton className="w-full" size="lg" loadingText="Saving…">
        Save new password
      </SubmitButton>
    </form>
  );
}
