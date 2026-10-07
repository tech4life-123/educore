"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { TextField } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { CredentialsCard } from "@/components/users/credentials-card";
import { createUserAction, type CreateUserState } from "../actions";

const ROLE_OPTIONS = [
  { value: "student", label: "Student" },
  { value: "teacher", label: "Teacher" },
  { value: "parent", label: "Parent / Guardian" },
  { value: "school_admin", label: "School Administrator" },
  { value: "finance_officer", label: "Finance Officer" },
  { value: "admissions_officer", label: "Admissions Officer" },
] as const;

const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLE_OPTIONS.map((o) => [o.value, o.label]));

function NewUserFormInner({ onReset,
  schoolCode,
  schoolName,
  siteUrl,
  parentsAllowed,
}: {
  schoolCode: string;
  schoolName: string;
  siteUrl: string;
  parentsAllowed: boolean;
  onReset: () => void;
}) {
  const [state, formAction] = useActionState<CreateUserState, FormData>(createUserAction, {});
  const [username, setUsername] = useState("");

  if (state.created) {
    const c = state.created;
    return (
      <div className="space-y-6">
        <Alert tone="success" title="Account created">
          {c.fullName} can now sign in.
        </Alert>
        <CredentialsCard
          fullName={c.fullName}
          roleLabel={ROLE_LABEL[c.role] ?? c.role}
          schoolName={schoolName}
          loginId={c.loginId}
          temporaryPassword={c.temporaryPassword}
          siteUrl={siteUrl}
        />
        <div className="flex flex-wrap gap-3 print:hidden">
          {/* Full page load resets the form state for the next person. */}
          <button type="button" onClick={onReset} className={buttonClasses()}>
            Add another user
          </button>
          <ButtonLink href="/users" variant="secondary">
            Back to user accounts
          </ButtonLink>
        </div>
      </div>
    );
  }

  const v = state.values ?? {};
  const roleOptions = parentsAllowed ? ROLE_OPTIONS : ROLE_OPTIONS.filter((o) => o.value !== "parent");

  return (
    <form action={formAction} noValidate className="space-y-6">
      {state.formError ? <Alert tone="danger" title="Couldn’t create the account">{state.formError}</Alert> : null}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground">Person</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField id="firstName" name="firstName" label="First name" required maxLength={100} defaultValue={v.firstName} autoComplete="off" />
          <TextField id="middleName" name="middleName" label="Middle name" maxLength={100} defaultValue={v.middleName} autoComplete="off" />
          <TextField id="lastName" name="lastName" label="Last name" required maxLength={100} defaultValue={v.lastName} autoComplete="off" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="role"
            name="role"
            label="Role"
            required
            options={roleOptions}
            defaultValue={v.role ?? "student"}
            error={state.fieldErrors?.role}
          />
          <TextField id="phone" name="phone" type="tel" label="Phone" inputMode="tel" hint="Optional" defaultValue={v.phone} autoComplete="off" />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground">Login</legend>
        <p className="text-sm text-muted">
          Give a <strong>username</strong> (for people without email), an <strong>email</strong>, or both. If an email is
          given, the person signs in with it.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
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
            hint={
              username
                ? `They will sign in as ${username}@${schoolCode}`
                : "e.g. a student ID like stu0042. Letters, numbers, dots, dashes."
            }
            error={state.fieldErrors?.username}
          />
          <TextField
            id="email"
            name="email"
            type="email"
            label="Email address"
            inputMode="email"
            autoComplete="off"
            hint="Optional"
            defaultValue={v.email}
            error={state.fieldErrors?.email}
          />
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton loadingText="Creating account…">Create account</SubmitButton>
        <Link href="/users" className="text-sm font-medium text-muted hover:text-foreground">
          Cancel
        </Link>
      </div>
    </form>
  );
}

/** Remounting with a new key gives the form fresh action state for the next entry. */
export function NewUserForm(props: { schoolCode: string; schoolName: string; siteUrl: string; parentsAllowed: boolean }) {
  const [key, setKey] = useState(0);
  return <NewUserFormInner key={key} {...props} onReset={() => setKey((k) => k + 1)} />;
}
