"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { TextField } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { CredentialsCard } from "@/components/users/credentials-card";
import { addSchoolAdminAction, type AddAdminState } from "./actions";

interface Props {
  schoolId: string;
  schoolCode: string;
  schoolName: string;
  siteUrl: string;
}

function AddAdminFormInner({ schoolId, schoolCode, schoolName, siteUrl, onReset }: Props & { onReset: () => void }) {
  const [state, formAction] = useActionState<AddAdminState, FormData>(addSchoolAdminAction, {});
  const [username, setUsername] = useState("");

  if (state.created) {
    const c = state.created;
    return (
      <div className="space-y-4">
        <Alert tone="success" title="Administrator added">
          {c.fullName} can now sign in and manage {schoolName}.
        </Alert>
        <CredentialsCard
          fullName={c.fullName}
          roleLabel="School Administrator"
          schoolName={schoolName}
          loginId={c.loginId}
          temporaryPassword={c.temporaryPassword}
          siteUrl={siteUrl}
        />
        <button type="button" onClick={onReset} className={buttonClasses("secondary", "sm")}>
          Add another administrator
        </button>
      </div>
    );
  }

  const v = state.values ?? {};
  return (
    <form action={formAction} noValidate className="space-y-4">
      <input type="hidden" name="school_id" value={schoolId} />
      {state.formError ? <Alert tone="danger">{state.formError}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField id="firstName" name="firstName" label="First name" required maxLength={100} defaultValue={v.firstName} autoComplete="off" />
        <TextField id="middleName" name="middleName" label="Middle name" maxLength={100} defaultValue={v.middleName} autoComplete="off" />
        <TextField id="lastName" name="lastName" label="Last name" required maxLength={100} defaultValue={v.lastName} autoComplete="off" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          id="username"
          name="username"
          label="Username"
          autoCapitalize="none"
          spellCheck={false}
          autoComplete="off"
          maxLength={32}
          defaultValue={v.username}
          onChange={(e) => setUsername(e.target.value.trim().toLowerCase())}
          hint={username ? `Signs in as ${username}@${schoolCode}` : "Or give an email instead"}
          error={state.fieldErrors?.username}
        />
        <TextField id="email" name="email" type="email" label="Email address" inputMode="email" autoComplete="off" hint="Optional" defaultValue={v.email} error={state.fieldErrors?.email} />
        <TextField id="phone" name="phone" type="tel" label="Phone" inputMode="tel" hint="Optional" defaultValue={v.phone} autoComplete="off" />
      </div>
      <SubmitButton loadingText="Creating account…">Add administrator</SubmitButton>
    </form>
  );
}

/** Remounting with a new key gives the form fresh state for the next person. */
export function AddAdminForm(props: Props) {
  const [key, setKey] = useState(0);
  return <AddAdminFormInner key={key} {...props} onReset={() => setKey((k) => k + 1)} />;
}
