"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { TextField } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateOwnProfile, type ProfileFormState } from "./actions";

export function ProfileForm({
  defaults,
}: {
  defaults: { first_name: string; middle_name: string | null; last_name: string; phone: string | null };
}) {
  const [state, formAction] = useActionState<ProfileFormState, FormData>(updateOwnProfile, {});

  return (
    <form action={formAction} noValidate className="space-y-4">
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      {state.status === "success" && state.message ? (
        <Alert tone="success" title="Saved">
          {state.message}
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          id="first_name"
          name="first_name"
          label="First name"
          autoComplete="given-name"
          required
          maxLength={100}
          defaultValue={defaults.first_name}
          error={state.fieldErrors?.first_name}
        />
        <TextField
          id="middle_name"
          name="middle_name"
          label="Middle name"
          autoComplete="additional-name"
          maxLength={100}
          defaultValue={defaults.middle_name ?? ""}
          error={state.fieldErrors?.middle_name}
        />
        <TextField
          id="last_name"
          name="last_name"
          label="Last name"
          autoComplete="family-name"
          required
          maxLength={100}
          defaultValue={defaults.last_name}
          error={state.fieldErrors?.last_name}
        />
      </div>
      <div className="sm:max-w-xs">
        <TextField
          id="phone"
          name="phone"
          type="tel"
          label="Phone number"
          autoComplete="tel"
          inputMode="tel"
          hint="Optional. Include the country code, e.g. +231."
          defaultValue={defaults.phone ?? ""}
          error={state.fieldErrors?.phone}
        />
      </div>
      <SubmitButton loadingText="Saving…">Save changes</SubmitButton>
    </form>
  );
}
