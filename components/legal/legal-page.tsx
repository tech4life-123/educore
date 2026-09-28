import Link from "next/link";
import type { ReactNode } from "react";
import { EduCoreLogo } from "@/components/brand/educore-logo";
import { Alert } from "@/components/ui/alert";

/**
 * Shared shell for /legal/privacy and /legal/terms. Public pages (no
 * sign-in required) — a prospective school, or anyone linked from the
 * footer, should be able to read these before creating an account.
 */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-10 sm:px-6">
      <Link href="/" className="mb-8 flex">
        <EduCoreLogo />
      </Link>

      <Alert tone="warning" title="Draft — not yet reviewed by a lawyer">
        This document was drafted to be a reasonable starting point, in plain English, for a school-records platform. It is not legal advice
        and has not been reviewed by a lawyer licensed in Liberia or elsewhere. Before this is relied on for a real school, it should be
        reviewed by qualified legal counsel, in particular for minors’ data and any applicable data-protection law.
      </Alert>

      <h1 className="mt-6 text-2xl font-semibold text-foreground">{title}</h1>
      <p className="text-sm text-subtle">Last updated: {updated}</p>

      <div className="prose-legal mt-6 space-y-6 text-sm leading-relaxed text-foreground">{children}</div>

      <div className="mt-10 flex gap-4 border-t border-border pt-6 text-sm">
        <Link href="/legal/privacy" className="text-brand hover:underline">
          Privacy Policy
        </Link>
        <Link href="/legal/terms" className="text-brand hover:underline">
          Terms of Service
        </Link>
        <Link href="/" className="text-muted hover:underline">
          Back to EduCore
        </Link>
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="mt-2 space-y-2 text-muted">{children}</div>
    </section>
  );
}
