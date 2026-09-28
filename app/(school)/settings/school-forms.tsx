"use client";

import { useActionState, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { TextField } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { PLATFORM_BRAND, initialsFor, readableForeground } from "@/lib/branding";
import { updateBackgroundPreference, type BackgroundPreferenceState } from "./actions";
import {
  removeSchoolBackground,
  removeSchoolLogo,
  updateAcademicSettings,
  updateSchoolProfile,
  uploadSchoolBackground,
  uploadSchoolLogo,
  type SchoolFormState,
} from "./school-actions";

const HEX = /^#[0-9a-f]{6}$/i;

function Feedback({ state, successTitle = "Saved" }: { state: SchoolFormState; successTitle?: string }) {
  if (state.status === "error" && state.message) return <Alert tone="danger">{state.message}</Alert>;
  if (state.status === "success" && state.message) {
    return (
      <Alert tone="success" title={successTitle}>
        {state.message}
      </Alert>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// School details & colours
// ---------------------------------------------------------------------------

export interface SchoolProfileDefaults {
  name: string;
  code: string;
  motto: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  logo_url: string | null;
}

export function SchoolProfileForm({ defaults }: { defaults: SchoolProfileDefaults }) {
  const [state, formAction] = useActionState<SchoolFormState, FormData>(updateSchoolProfile, {});
  const [name, setName] = useState(defaults.name);
  const [motto, setMotto] = useState(defaults.motto ?? "");
  const [primary, setPrimary] = useState(defaults.primary_color ?? PLATFORM_BRAND.primary);
  const [secondary, setSecondary] = useState(defaults.secondary_color ?? PLATFORM_BRAND.secondary);
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} noValidate className="space-y-5">
      <Feedback state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="school-name"
          name="name"
          label="School name"
          required
          maxLength={200}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={err.name}
        />
        <TextField
          id="school-code"
          label="School code"
          value={defaults.code}
          disabled
          hint="Set by the platform. Used in usernames."
        />
      </div>
      <TextField
        id="school-motto"
        name="motto"
        label="Motto"
        maxLength={300}
        value={motto}
        onChange={(e) => setMotto(e.target.value)}
        error={err.motto}
      />
      <TextField
        id="school-address"
        name="address"
        label="Street address"
        maxLength={500}
        defaultValue={state.values?.address ?? defaults.address ?? ""}
        error={err.address}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="school-city"
          name="city"
          label="City / town"
          maxLength={100}
          defaultValue={state.values?.city ?? defaults.city ?? ""}
          error={err.city}
        />
        <TextField
          id="school-county"
          name="county"
          label="County"
          maxLength={100}
          defaultValue={state.values?.county ?? defaults.county ?? ""}
          error={err.county}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          id="school-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          label="Phone"
          defaultValue={state.values?.phone ?? defaults.phone ?? ""}
          error={err.phone}
        />
        <TextField
          id="school-email"
          name="email"
          type="email"
          label="Email"
          defaultValue={state.values?.email ?? defaults.email ?? ""}
          error={err.email}
        />
        <TextField
          id="school-website"
          name="website"
          type="url"
          inputMode="url"
          label="Website"
          placeholder="https://"
          defaultValue={state.values?.website ?? defaults.website ?? ""}
          error={err.website}
        />
      </div>

      <fieldset className="space-y-4 border-t border-border pt-5">
        <legend className="sr-only">Brand colours</legend>
        <p className="text-sm font-semibold text-foreground">Brand colours</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <ColourField
            id="primary_color"
            label="Primary colour"
            value={primary}
            onChange={setPrimary}
            error={err.primary_color}
            hint="Sidebar, buttons and highlights."
          />
          <ColourField
            id="secondary_color"
            label="Accent colour"
            value={secondary}
            onChange={setSecondary}
            error={err.secondary_color}
            hint="Used for small accents and printed documents."
          />
        </div>
        <BrandPreview name={name || defaults.name} motto={motto} primary={primary} secondary={secondary} />
      </fieldset>

      <SubmitButton loadingText="Saving…">Save school details</SubmitButton>
    </form>
  );
}

function ColourField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}) {
  const [draft, setDraft] = useState(value);
  const valid = HEX.test(draft);
  return (
    <div className="space-y-1.5">
      <label htmlFor={`${id}-text`} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={HEX.test(value) ? value : "#000000"}
          onChange={(e) => {
            setDraft(e.target.value);
            onChange(e.target.value);
          }}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-border bg-surface p-1"
        />
        <input
          id={`${id}-text`}
          name={id}
          value={draft}
          maxLength={7}
          spellCheck={false}
          autoCapitalize="off"
          aria-invalid={error || !valid ? true : undefined}
          aria-describedby={`${id}-hint`}
          onChange={(e) => {
            const next = e.target.value.trim();
            setDraft(next);
            if (HEX.test(next)) onChange(next.toLowerCase());
          }}
          className="block h-11 w-full rounded-lg border border-border bg-surface px-3 font-mono text-base uppercase text-foreground aria-[invalid=true]:border-danger sm:text-sm"
        />
      </div>
      <p id={`${id}-hint`} className="text-xs text-subtle">
        {hint} Format: #RRGGBB.
      </p>
      {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
    </div>
  );
}

function BrandPreview({
  name,
  motto,
  primary,
  secondary,
}: {
  name: string;
  motto: string;
  primary: string;
  secondary: string;
}) {
  const brand = HEX.test(primary) ? primary : PLATFORM_BRAND.primary;
  const accent = HEX.test(secondary) ? secondary : PLATFORM_BRAND.secondary;
  const fg = readableForeground(brand);
  const accentFg = readableForeground(accent);
  return (
    <div
      aria-label="Preview of your school’s branding"
      role="img"
      className="overflow-hidden rounded-lg border border-border"
    >
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: brand, color: fg }}>
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold"
          style={{ background: fg, color: brand }}
        >
          {initialsFor(name)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{name}</p>
          {motto ? <p className="truncate text-xs opacity-80">{motto}</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 bg-surface px-4 py-3">
        <span className="rounded-lg px-3 py-2 text-sm font-medium" style={{ background: brand, color: fg }}>
          Primary button
        </span>
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={{ background: accent, color: accentFg }}
        >
          Accent
        </span>
        <span className="text-sm font-medium" style={{ color: brand }}>
          Link text
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

export function LogoForm({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const [uploadState, uploadAction] = useActionState<SchoolFormState, FormData>(uploadSchoolLogo, {});
  const [removeState, removeAction] = useActionState<SchoolFormState, FormData>(removeSchoolLogo, {});
  // The picked file's preview belongs to the upload result that existed when it
  // was picked; once the upload returns, the preview is dropped (React also
  // resets the file input after the action).
  const [picked, setPicked] = useState<{
    url: string;
    since: SchoolFormState;
  } | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const preview = picked && picked.since === uploadState ? picked.url : null;

  const shown = preview ?? logoUrl;

  return (
    <div className="space-y-4">
      <Feedback state={uploadState} />
      <Feedback state={removeState} />

      <div className="flex flex-wrap items-center gap-4">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview or our own storage URL
          <img
            src={shown}
            alt={`${name} logo`}
            className="h-20 w-20 rounded-lg border border-border bg-surface object-contain"
          />
        ) : (
          <span className="flex h-20 w-20 items-center justify-center rounded-lg bg-brand text-xl font-semibold text-brand-foreground">
            {initialsFor(name)}
          </span>
        )}
        <div className="text-sm text-muted">
          <p>PNG, JPEG or WebP, up to 1 MB.</p>
          <p>A square image of at least 256 × 256 pixels looks best.</p>
        </div>
      </div>

      <form action={uploadAction} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="logo" className="block text-sm font-medium text-foreground">
            Choose a new logo
          </label>
          <input
            id="logo"
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-invalid={clientError || uploadState.fieldErrors?.logo ? true : undefined}
            onChange={(e) => {
              const file = e.target.files?.[0];
              setClientError(null);
              if (picked) URL.revokeObjectURL(picked.url);
              setPicked(null);
              if (!file) return;
              if (file.size > 1024 * 1024) {
                setClientError("That image is larger than 1 MB.");
                e.target.value = "";
                return;
              }
              if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
                setClientError("Use a PNG, JPEG or WebP image.");
                e.target.value = "";
                return;
              }
              setPicked({ url: URL.createObjectURL(file), since: uploadState });
            }}
            className="block w-full text-sm text-foreground file:mr-3 file:h-10 file:rounded-lg file:border file:border-border file:bg-surface-muted file:px-3 file:text-sm file:font-medium"
          />
          {clientError || uploadState.fieldErrors?.logo ? (
            <p className="text-sm font-medium text-danger">{clientError ?? uploadState.fieldErrors?.logo}</p>
          ) : null}
        </div>
        <SubmitButton loadingText="Uploading…" disabled={!preview}>
          Upload logo
        </SubmitButton>
      </form>

      {logoUrl ? (
        <form action={removeAction}>
          <SubmitButton variant="secondary" size="sm" loadingText="Removing…">
            Remove current logo
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Background image
// ---------------------------------------------------------------------------

export function BackgroundImageForm({ backgroundUrl }: { backgroundUrl: string | null }) {
  const [uploadState, uploadAction] = useActionState<SchoolFormState, FormData>(uploadSchoolBackground, {});
  const [removeState, removeAction] = useActionState<SchoolFormState, FormData>(removeSchoolBackground, {});
  // Same preview-lifetime pattern as LogoForm above.
  const [picked, setPicked] = useState<{
    url: string;
    since: SchoolFormState;
  } | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const preview = picked && picked.since === uploadState ? picked.url : null;

  const shown = preview ?? backgroundUrl;

  return (
    <div className="space-y-4">
      <Feedback state={uploadState} />
      <Feedback state={removeState} />

      <div className="flex flex-wrap items-center gap-4">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview or our own storage URL
          <img
            src={shown}
            alt="School background"
            className="h-20 w-32 rounded-lg border border-border bg-surface object-cover"
          />
        ) : (
          <span className="flex h-20 w-32 items-center justify-center rounded-lg border border-dashed border-border bg-surface-muted text-xs text-muted">
            No background set
          </span>
        )}
        <div className="text-sm text-muted">
          <p>PNG, JPEG or WebP, up to 3 MB.</p>
          <p>Shown, softly blurred, behind every page for everyone in your school.</p>
        </div>
      </div>

      <form action={uploadAction} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="background" className="block text-sm font-medium text-foreground">
            Choose a new background
          </label>
          <input
            id="background"
            name="background"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-invalid={clientError || uploadState.fieldErrors?.background ? true : undefined}
            onChange={(e) => {
              const file = e.target.files?.[0];
              setClientError(null);
              if (picked) URL.revokeObjectURL(picked.url);
              setPicked(null);
              if (!file) return;
              if (file.size > 3 * 1024 * 1024) {
                setClientError("That image is larger than 3 MB.");
                e.target.value = "";
                return;
              }
              if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
                setClientError("Use a PNG, JPEG or WebP image.");
                e.target.value = "";
                return;
              }
              setPicked({ url: URL.createObjectURL(file), since: uploadState });
            }}
            className="block w-full text-sm text-foreground file:mr-3 file:h-10 file:rounded-lg file:border file:border-border file:bg-surface-muted file:px-3 file:text-sm file:font-medium"
          />
          {clientError || uploadState.fieldErrors?.background ? (
            <p className="text-sm font-medium text-danger">{clientError ?? uploadState.fieldErrors?.background}</p>
          ) : null}
        </div>
        <SubmitButton loadingText="Uploading…" disabled={!preview}>
          Upload background
        </SubmitButton>
      </form>

      {backgroundUrl ? (
        <form action={removeAction}>
          <SubmitButton variant="secondary" size="sm" loadingText="Removing…">
            Remove background
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

/**
 * Personal on/off toggle for the background image, for the caller's own
 * screen only — shown to school admins only. Saves as soon as it's changed.
 */
export function BackgroundPreferenceToggle({ defaultChecked }: { defaultChecked: boolean }) {
  const [state, formAction] = useActionState<BackgroundPreferenceState, FormData>(updateBackgroundPreference, {});
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form action={formAction} ref={formRef} className="space-y-2">
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="show_school_background"
          defaultChecked={defaultChecked}
          onChange={() => formRef.current?.requestSubmit()}
          className="mt-0.5 h-5 w-5 rounded border-border accent-[var(--brand)]"
        />
        <span>
          <span className="font-medium text-foreground">Show the background on my screen</span>
          <span className="block text-muted">
            Turn this off to hide it just for you. It still shows for everyone else in your school.
          </span>
        </span>
      </label>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Academic configuration
// ---------------------------------------------------------------------------

const SYSTEM_OPTIONS = [
  { value: "semester", label: "Semesters (2 per year)" },
  { value: "trimester", label: "Trimesters (3 per year)" },
  { value: "quarter", label: "Quarters (4 per year)" },
  { value: "term", label: "Terms" },
] as const;

export function AcademicSettingsForm({
  defaults,
}: {
  defaults: {
    academic_system: string;
    passing_score: number;
    attendance_threshold: number;
    allow_parent_accounts: boolean;
  };
}) {
  const [state, formAction] = useActionState<SchoolFormState, FormData>(updateAcademicSettings, {});
  const err = state.fieldErrors ?? {};
  return (
    <form action={formAction} noValidate className="space-y-4">
      <Feedback state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          id="academic_system"
          name="academic_system"
          label="Academic system"
          options={SYSTEM_OPTIONS}
          defaultValue={state.values?.academic_system ?? defaults.academic_system}
          error={err.academic_system}
        />
        <TextField
          id="passing_score"
          name="passing_score"
          label="Passing score (%)"
          inputMode="decimal"
          defaultValue={state.values?.passing_score ?? String(defaults.passing_score)}
          error={err.passing_score}
          hint="Liberian schools commonly use 70."
        />
        <TextField
          id="attendance_threshold"
          name="attendance_threshold"
          label="Minimum attendance (%)"
          inputMode="decimal"
          defaultValue={state.values?.attendance_threshold ?? String(defaults.attendance_threshold)}
          error={err.attendance_threshold}
        />
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="allow_parent_accounts"
          defaultChecked={state.values ? state.values.allow_parent_accounts === "on" : defaults.allow_parent_accounts}
          className="mt-0.5 h-5 w-5 rounded border-border accent-[var(--brand)]"
        />
        <span>
          <span className="font-medium text-foreground">Allow parent &amp; guardian accounts</span>
          <span className="block text-muted">
            When off, new parent accounts can’t be created. Existing ones are not affected.
          </span>
        </span>
      </label>
      <SubmitButton loadingText="Saving…">Save academic settings</SubmitButton>
    </form>
  );
}
