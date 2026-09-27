"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CredentialSlips } from "@/components/users/credential-slips";
import { importAction, type ImportState } from "./actions";

const ROLE_LABEL: Record<string, string> = {
  student: "Student",
  teacher: "Teacher",
  parent: "Parent",
  school_admin: "Administrator",
};

const TEMPLATE =
  "first_name,middle_name,last_name,role,username,email,phone\n" +
  "Musu,,Kollie,student,stu0042,,\n" +
  "Joseph,T.,Flomo,teacher,,jflomo@example.com,+231 77 000 0000\n";

function download(filename: string, content: string) {
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ImportWizardInner({ onReset, schoolName, schoolCode, siteUrl }: { schoolName: string; schoolCode: string; siteUrl: string; onReset: () => void }) {
  const [state, formAction] = useActionState<ImportState, FormData>(importAction, { step: "upload" });

  if (state.step === "done" && state.results) {
    const ok = state.results.filter((r) => !r.error);
    const failed = state.results.filter((r) => r.error);

    return (
      <div className="space-y-6">
        <Alert tone={failed.length ? "warning" : "success"} title={`${ok.length} account${ok.length === 1 ? "" : "s"} created`}>
          {failed.length ? `${failed.length} row(s) could not be created — see below.` : "Everyone in the file can now sign in."}
        </Alert>

        {ok.length ? (
          <CredentialSlips
            schoolName={schoolName}
            siteUrl={siteUrl}
            filename={`${schoolCode}-logins.csv`}
            slips={ok.map((r) => ({
              key: String(r.line),
              fullName: r.fullName,
              roleLabel: ROLE_LABEL[r.role],
              loginId: r.loginId!,
              temporaryPassword: r.temporaryPassword!,
            }))}
          />
        ) : null}

        {failed.length ? (
          <div className="rounded-xl border border-border print:hidden">
            <Table caption="Rows that failed">
              <THead>
                <TR>
                  <TH>Line</TH>
                  <TH>Name</TH>
                  <TH>Problem</TH>
                </TR>
              </THead>
              <TBody>
                {failed.map((r) => (
                  <TR key={r.line}>
                    <TD>{r.line}</TD>
                    <TD>{r.fullName}</TD>
                    <TD className="text-danger">{r.error}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        ) : null}

        <div className="flex gap-2 print:hidden">
          <button
            type="button"
            onClick={onReset}
            className="text-sm font-medium text-foreground underline underline-offset-4"
          >
            Import another file
          </button>
          <span className="text-muted">·</span>
          <Link href="/users" className="text-sm font-medium text-foreground underline underline-offset-4">
            Back to user accounts
          </Link>
        </div>
      </div>
    );
  }

  if (state.step === "preview" && state.rows) {
    const valid = state.rows.filter((r) => r.errors.length === 0).length;
    const invalid = state.rows.length - valid;
    return (
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="csvText" value={state.csvText ?? ""} />
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        <Alert tone={invalid ? "warning" : "info"} title={`${state.fileName ?? "File"}: ${state.rows.length} row(s)`}>
          {valid} ready to import{invalid ? `, ${invalid} with problems (these will be skipped — fix them and import again later)` : ""}.
          Nothing has been created yet.
        </Alert>

        <div className="max-h-[28rem] overflow-auto rounded-xl border border-border">
          <Table caption="Import preview">
            <THead>
              <TR>
                <TH>Line</TH>
                <TH>Name</TH>
                <TH>Role</TH>
                <TH>Login</TH>
                <TH>Check</TH>
              </TR>
            </THead>
            <TBody>
              {state.rows.map((r) => (
                <TR key={r.line}>
                  <TD>{r.line}</TD>
                  <TD>{[r.input.firstName, r.input.middleName, r.input.lastName].filter(Boolean).join(" ")}</TD>
                  <TD>{ROLE_LABEL[r.input.role] ?? r.input.role}</TD>
                  <TD className="font-mono text-xs">{r.input.email || (r.input.username ? `${r.input.username}@${schoolCode}` : "—")}</TD>
                  <TD>{r.errors.length ? <span className="text-danger">{r.errors.join(" ")}</span> : <Badge tone="success">OK</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>

        <div className="flex flex-wrap gap-2">
          <SubmitButton name="intent" value="confirm" disabled={valid === 0} loadingText="Creating accounts…">
            Create {valid} account{valid === 1 ? "" : "s"}
          </SubmitButton>
          <button type="submit" name="intent" value="reset" className="text-sm font-medium text-muted hover:text-foreground">
            Choose a different file
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
        <li>
          Download the template and fill it in (Excel or Google Sheets). Required columns: <code>first_name</code>,{" "}
          <code>last_name</code>, <code>role</code>, and a <code>username</code> and/or <code>email</code>.
        </li>
        <li>Roles: student, teacher, parent, admin.</li>
        <li>Save as <strong>CSV</strong> (Excel: File → Save As → “CSV UTF-8”), then upload it below. Up to 100 people per file.</li>
      </ol>
      <Button variant="secondary" onClick={() => download("educore-users-template.csv", TEMPLATE)}>
        Download template
      </Button>

      <form action={formAction} className="space-y-4">
        {state.error ? <Alert tone="danger" title="Couldn’t read the file">{state.error}</Alert> : null}
        <div className="space-y-1.5">
          <label htmlFor="file" className="block text-sm font-medium text-foreground">
            CSV file
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="block w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium"
          />
        </div>
        <SubmitButton name="intent" value="preview" loadingText="Checking file…">
          Check file
        </SubmitButton>
      </form>
      <ButtonLink href="/users" variant="ghost" size="sm">
        Cancel
      </ButtonLink>
    </div>
  );
}

/** Remounting with a new key gives the form fresh action state for the next entry. */
export function ImportWizard(props: { schoolName: string; schoolCode: string; siteUrl: string }) {
  const [key, setKey] = useState(0);
  return <ImportWizardInner key={key} {...props} onReset={() => setKey((k) => k + 1)} />;
}
