"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { TextField } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { AUDIENCE_LABELS, type Audience } from "@/lib/announcements";
import type { AnnouncementFormState } from "@/app/(school)/announcements/actions";

export interface AnnouncementDefaults {
  id?: string;
  title: string;
  body: string;
  audience: Audience;
  classId: string;
  pinned: boolean;
  publishAt: string; // datetime-local in school time, or ""
  expiresOn: string;
}

export function AnnouncementForm({
  action,
  defaults,
  classes,
  isAdmin,
  submitLabel,
}: {
  action: (state: AnnouncementFormState, formData: FormData) => Promise<AnnouncementFormState>;
  defaults: AnnouncementDefaults;
  classes: { id: string; name: string }[];
  isAdmin: boolean;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const v = state.values;
  const [audience, setAudience] = useState<string>(v?.audience ?? (isAdmin ? defaults.audience : "class"));
  const audienceOptions = (isAdmin ? (Object.keys(AUDIENCE_LABELS) as Audience[]) : (["class"] as Audience[])).map((a) => ({
    value: a,
    label: AUDIENCE_LABELS[a],
  }));

  return (
    <form action={formAction} noValidate className="space-y-4">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <TextField id="title" name="title" label="Title" required maxLength={120} defaultValue={v?.title ?? defaults.title} placeholder="e.g. Mid-term break" />
      <div className="space-y-1.5">
        <label htmlFor="body" className="block text-sm font-medium text-foreground">
          Message <span className="text-danger" aria-hidden="true">*</span>
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={8}
          maxLength={5000}
          defaultValue={v?.body ?? defaults.body}
          className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-foreground sm:text-sm"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="audience" name="audience" label="Who should see it?" options={audienceOptions} value={audience} onChange={(e) => setAudience(e.target.value)} />
        {audience === "class" ? (
          <SelectField
            id="class_id"
            name="class_id"
            label="Class"
            placeholder="Choose…"
            options={classes.map((c) => ({ value: c.id, label: `Class ${c.name}` }))}
            defaultValue={v?.class_id ?? defaults.classId}
            hint="Its students, their parents and the class’s teachers."
          />
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="publish_at"
          name="publish_at"
          type="datetime-local"
          label="Publish at"
          defaultValue={v?.publish_at ?? defaults.publishAt}
          hint="Leave empty to publish now. Uses the school’s time zone."
        />
        <TextField id="expires_on" name="expires_on" type="date" label="Hide after" defaultValue={v?.expires_on ?? defaults.expiresOn} hint="Optional. Last day it is shown." />
      </div>
      {isAdmin ? (
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="pinned" defaultChecked={v ? v.pinned === "on" : defaults.pinned} className="h-5 w-5 accent-[var(--brand)]" />
          <span className="font-medium text-foreground">Pin to the top</span>
        </label>
      ) : null}
      <SubmitButton loadingText="Saving…">{submitLabel}</SubmitButton>
    </form>
  );
}
