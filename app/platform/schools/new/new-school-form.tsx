"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { TextField } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { CredentialsCard } from "@/components/users/credentials-card";
import { createSchoolAction, type CreateSchoolState } from "./actions";

const TYPES = [
  { value: "high_school", label: "High school" },
  { value: "junior_high", label: "Junior high school" },
  { value: "elementary", label: "Elementary school" },
  { value: "vocational", label: "Vocational institution" },
  { value: "college", label: "College" },
  { value: "university", label: "University" },
  { value: "other", label: "Other" },
];

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function NewSchoolFormInner({ onReset, siteUrl }: { siteUrl: string; onReset: () => void }) {
  const [state, formAction] = useActionState<CreateSchoolState, FormData>(createSchoolAction, {});
  const v = state.values ?? {};
  const [slug, setSlug] = useState(v.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(false);

  if (state.created) {
    const c = state.created;
    return (
      <div className="space-y-6">
        <Alert tone="success" title="School created">
          {c.schoolName} ({c.schoolCode}) is active on EduCore.
        </Alert>
        {c.admin ? (
          <CredentialsCard
            fullName={c.admin.fullName}
            roleLabel="School Administrator"
            schoolName={c.schoolName}
            loginId={c.admin.loginId}
            temporaryPassword={c.admin.temporaryPassword}
            siteUrl={siteUrl}
          />
        ) : (
          <Alert tone="danger" title="The administrator account wasn’t created">
            {c.adminError} The school exists; ask Claude or use the SQL snippet to attach an administrator.
          </Alert>
        )}
        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={onReset}
            className="text-sm font-medium text-foreground underline underline-offset-4"
          >
            Create another school
          </button>
          <span className="text-muted">·</span>
          <Link href="/platform" className="text-sm font-medium text-foreground underline underline-offset-4">
            Back to schools
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="space-y-8">
      {state.formError ? <Alert tone="danger">{state.formError}</Alert> : null}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground">School</legend>
        <TextField
          id="name"
          name="name"
          label="School name"
          required
          defaultValue={v.name}
          error={state.fieldErrors?.name}
          onChange={(e) => {
            if (!slugEdited) setSlug(slugify(e.target.value));
          }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="code"
            name="code"
            label="School code"
            required
            maxLength={20}
            hint="Used in usernames, e.g. stu0042@SPHS-01. Can’t be changed later."
            defaultValue={v.code}
            className="uppercase"
            error={state.fieldErrors?.code}
          />
          <TextField
            id="slug"
            name="slug"
            label="Web name (slug)"
            required
            value={slug}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value.toLowerCase());
            }}
            error={state.fieldErrors?.slug}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField id="schoolType" name="schoolType" label="Type" options={TYPES} defaultValue={v.schoolType ?? "high_school"} />
          <TextField id="motto" name="motto" label="Motto" defaultValue={v.motto} hint="Optional" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField id="city" name="city" label="City" defaultValue={v.city} />
          <TextField id="county" name="county" label="County" defaultValue={v.county} />
          <TextField
            id="primaryColor"
            name="primaryColor"
            label="Brand colour"
            placeholder="#1E3A8A"
            hint="Optional hex colour"
            defaultValue={v.primaryColor}
            error={state.fieldErrors?.primaryColor}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground">First school administrator</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="adminFirstName" name="adminFirstName" label="First name" required defaultValue={v.adminFirstName} />
          <TextField id="adminLastName" name="adminLastName" label="Last name" required defaultValue={v.adminLastName} />
          <TextField id="adminEmail" name="adminEmail" type="email" label="Email" defaultValue={v.adminEmail} hint="Email and/or username" />
          <TextField id="adminUsername" name="adminUsername" label="Username" autoCapitalize="none" defaultValue={v.adminUsername} />
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton loadingText="Creating school…">Create school</SubmitButton>
        <ButtonLink href="/platform" variant="ghost">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}

/** Remounting with a new key gives the form fresh action state for the next entry. */
export function NewSchoolForm(props: { siteUrl: string }) {
  const [key, setKey] = useState(0);
  return <NewSchoolFormInner key={key} {...props} onReset={() => setKey((k) => k + 1)} />;
}
