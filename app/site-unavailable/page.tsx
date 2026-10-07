import type { Metadata } from "next";
import { EduCoreLogo } from "@/components/brand/educore-logo";

export const metadata: Metadata = { title: "Site unavailable" };

/**
 * Shown, via a proxy.ts rewrite (never a redirect — the address bar keeps
 * whatever domain the visitor typed), for a hostname that is neither this
 * app's own host nor a verified school domain. Deliberately generic: it
 * names no school, confirms nothing about what domains exist or don't, and
 * is reachable only when EDUCORE_PRIMARY_HOSTS is configured (see
 * ARCHITECTURE.md §21.2) — otherwise this route sits unused.
 */
export default function SiteUnavailablePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <EduCoreLogo />
      <div>
        <h1 className="text-2xl font-semibold text-foreground">This site isn’t set up yet</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">This address isn’t connected to a school on EduCore. If you administer this domain, check that it’s set up correctly, or get in touch with your school.</p>
      </div>
    </div>
  );
}
