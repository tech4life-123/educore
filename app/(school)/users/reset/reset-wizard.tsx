"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { SelectField } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { CredentialSlips } from "@/components/users/credential-slips";
import { bulkResetAction, type ResetState } from "./actions";

const ROLE_OPTIONS = [
  { value: "student", label: "Students" },
  { value: "teacher", label: "Teachers" },
  { value: "parent", label: "Parents & guardians" },
  { value: "school_admin", label: "Administrators (not you)" },
];

function Inner({
  classes,
  schoolName,
  schoolCode,
  siteUrl,
  onReset,
}: {
  classes: { id: string; name: string }[];
  schoolName: string;
  schoolCode: string;
  siteUrl: string;
  onReset: () => void;
}) {
  const [state, action] = useActionState<ResetState, FormData>(bulkResetAction, { step: "choose" });
  const [role, setRole] = useState("student");

  if (state.step === "done" && state.results) {
    const ok = state.results.filter((r) => r.temporaryPassword);
    const failed = state.results.filter((r) => r.error);
    return (
      <div className="space-y-6">
        <Alert tone={failed.length ? "warning" : "success"} title={`${ok.length} password${ok.length === 1 ? "" : "s"} reset`}>
          {failed.length
            ? `${failed.length} account(s) couldn’t be reset: ${failed.map((f) => f.fullName).join(", ")}.`
            : "Everyone below must choose their own password when they next sign in."}
        </Alert>
        {ok.length ? (
          <CredentialSlips
            schoolName={schoolName}
            siteUrl={siteUrl}
            filename={`${schoolCode}-new-logins.csv`}
            slips={ok.map((r) => ({
              key: r.key,
              fullName: r.fullName,
              roleLabel: r.roleLabel,
              loginId: r.loginId!,
              temporaryPassword: r.temporaryPassword!,
            }))}
          />
        ) : null}
        <div className="flex gap-3 text-sm print:hidden">
          <button type="button" onClick={onReset} className="font-medium underline underline-offset-4">
            Reset another group
          </button>
          <Link href="/users" className="font-medium underline underline-offset-4">
            Back to user accounts
          </Link>
        </div>
      </div>
    );
  }

  if (state.step === "confirm" && state.filters && state.targets) {
    const f = state.filters;
    return (
      <form action={action} className="space-y-5">
        <input type="hidden" name="intent" value="reset" />
        <input type="hidden" name="role" value={f.role} />
        <input type="hidden" name="class_id" value={f.classId} />
        {f.onlyTemporary ? <input type="hidden" name="only_temporary" value="on" /> : null}
        {state.targets.map((t) => (
          <input key={t.id} type="hidden" name="target" value={t.id} />
        ))}
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.targets.length === 0 ? (
          <Alert tone="info" title="No matching accounts">
            Nobody matches those choices{f.onlyTemporary ? " (only accounts still on a temporary password were included)" : ""}.
          </Alert>
        ) : (
          <>
            <Alert tone="warning" title={`${state.targets.length} account${state.targets.length === 1 ? "" : "s"} will get a new one-time password`}>
              Their current passwords stop working immediately, and they must choose a new password at next sign-in.
              {state.truncated ? " Only the first 200 are included; run it again for the rest." : ""}
            </Alert>
            <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
              {state.targets.map((t) => (
                <li key={t.id} className="flex justify-between gap-3 px-3 py-2">
                  <span className="text-foreground">{t.fullName}</span>
                  <span className="font-mono text-xs text-muted">{t.login}</span>
                </li>
              ))}
            </ul>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="understood" className="mt-0.5 h-5 w-5 accent-[var(--brand)]" />
              <span>I understand these accounts’ current passwords will stop working.</span>
            </label>
          </>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {state.targets.length ? (
            <SubmitButton variant="danger" loadingText="Resetting… this can take a minute">
              Reset {state.targets.length} password{state.targets.length === 1 ? "" : "s"}
            </SubmitButton>
          ) : null}
          <button type="button" onClick={onReset} className="text-sm font-medium underline underline-offset-4">
            Change selection
          </button>
        </div>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="intent" value="preview" />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="role" name="role" label="Whose passwords?" options={ROLE_OPTIONS} value={role} onChange={(e) => setRole(e.target.value)} />
        {role === "student" ? (
          <SelectField
            id="class_id"
            name="class_id"
            label="Class"
            placeholder="All students"
            options={classes.map((c) => ({ value: c.id, label: `Class ${c.name}` }))}
            hint="Classes in the current academic year."
          />
        ) : null}
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="only_temporary" defaultChecked className="mt-0.5 h-5 w-5 accent-[var(--brand)]" />
        <span>
          <span className="font-medium text-foreground">Only accounts that haven’t chosen their own password yet</span>
          <span className="block text-muted">Recommended — people who already set a password keep it.</span>
        </span>
      </label>
      <SubmitButton loadingText="Checking…">Show who will be reset</SubmitButton>
      <p className="text-xs text-muted">Nothing changes until you confirm on the next step.</p>
    </form>
  );
}

export function ResetWizard(props: { classes: { id: string; name: string }[]; schoolName: string; schoolCode: string; siteUrl: string }) {
  const [key, setKey] = useState(0);
  return <Inner key={key} {...props} onReset={() => setKey((k) => k + 1)} />;
}
