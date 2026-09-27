"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Shows a one-time login slip. The temporary password exists only in this
 * response — it is never stored or retrievable again.
 */
export function CredentialsCard({
  fullName,
  roleLabel,
  schoolName,
  loginId,
  temporaryPassword,
  siteUrl,
}: {
  fullName: string;
  roleLabel: string;
  schoolName: string;
  loginId: string;
  temporaryPassword: string;
  siteUrl: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  const slip = `${schoolName}\n${fullName} (${roleLabel})\nSign in at: ${siteUrl}/login\nLogin: ${loginId}\nTemporary password: ${temporaryPassword}\nYou will be asked to choose your own password.`;

  return (
    <div className="space-y-4">
      <Alert tone="warning" title="Save these details now">
        This temporary password is shown only once. Give it to {fullName} in person or print the slip.
      </Alert>

      <div className="print-area rounded-xl border-2 border-dashed border-border bg-surface p-5 print:border-solid" >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{schoolName} · EduCore login</p>
        <p className="mt-2 text-lg font-semibold text-foreground">{fullName}</p>
        <p className="text-sm text-muted">{roleLabel}</p>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-muted">Sign in at</dt>
            <dd className="font-medium text-foreground">{siteUrl}/login</dd>
          </div>
          <div>
            <dt className="text-muted">Login</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-surface-muted px-2 py-1 font-mono text-base text-foreground">{loginId}</code>
              <button
                type="button"
                onClick={() => copy("login", loginId)}
                className="text-xs font-medium text-foreground underline underline-offset-2 print:hidden"
              >
                {copied === "login" ? "Copied" : "Copy"}
              </button>
            </dd>
          </div>
          <div>
            <dt className="text-muted">Temporary password</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-surface-muted px-2 py-1 font-mono text-base tracking-wider text-foreground">
                {temporaryPassword}
              </code>
              <button
                type="button"
                onClick={() => copy("password", temporaryPassword)}
                className="text-xs font-medium text-foreground underline underline-offset-2 print:hidden"
              >
                {copied === "password" ? "Copied" : "Copy"}
              </button>
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-muted">They will be asked to choose their own password when they first sign in.</p>
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Button variant="secondary" onClick={() => window.print()}>
          Print slip
        </Button>
        <Button variant="secondary" onClick={() => copy("all", slip)}>
          {copied === "all" ? "Copied" : "Copy all details"}
        </Button>
      </div>
      <p aria-live="polite" className="sr-only">
        {copied ? `${copied} copied to clipboard` : ""}
      </p>
    </div>
  );
}
