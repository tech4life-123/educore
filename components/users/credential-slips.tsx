"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { csvCell } from "@/lib/csv";

export interface CredentialSlip {
  key: string;
  fullName: string;
  roleLabel: string;
  loginId: string;
  temporaryPassword: string;
}

function download(filename: string, content: string) {
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Printable login slips (two per row, cut along the dashed lines) plus a CSV
 * download. The passwords exist only in this response; they are never stored.
 */
export function CredentialSlips({
  slips,
  schoolName,
  siteUrl,
  filename,
}: {
  slips: CredentialSlip[];
  schoolName: string;
  siteUrl: string;
  filename: string;
}) {
  const csv =
    "name,role,login,temporary_password\n" +
    slips.map((s) => [s.fullName, s.roleLabel, s.loginId, s.temporaryPassword].map(csvCell).join(",")).join("\n");

  return (
    <div className="space-y-4">
      <Alert tone="warning" title="Save the login details now">
        These one-time passwords are shown only on this page. Download or print them before leaving — they can’t be shown
        again (you would have to reset them again).
      </Alert>
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button onClick={() => download(filename, csv)}>Download logins (CSV)</Button>
        <Button variant="secondary" onClick={() => window.print()}>
          Print login slips
        </Button>
      </div>
      <div className="print-area">
        <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2">
          {slips.map((s) => (
            <div key={s.key} className="break-inside-avoid rounded-lg border border-dashed border-border p-3 text-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{schoolName}</p>
              <p className="font-semibold text-foreground">{s.fullName}</p>
              <p className="text-xs text-muted">
                {s.roleLabel} · {siteUrl}/login
              </p>
              <p className="mt-2 font-mono text-foreground">Login: {s.loginId}</p>
              <p className="font-mono text-foreground">Password: {s.temporaryPassword}</p>
              <p className="mt-1 text-[11px] text-muted">You will be asked to choose your own password.</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
