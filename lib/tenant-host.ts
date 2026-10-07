import "server-only";
import { getPrimaryHosts, getPublicEnv } from "@/lib/env";

export interface TenantHostMatch {
  schoolId: string;
}

/**
 * True when `hostname` is "the app itself" and must never be shown the
 * unrecognized-host fallback, regardless of what (if anything) is in
 * school_domains:
 *   - localhost / 127.0.0.1 — local development.
 *   - any *.vercel.app host — Vercel's own preview and production default
 *     domains for this project; a school's custom domain is never one of
 *     these, so matching the suffix is safe and needs no configuration.
 *   - anything explicitly listed in EDUCORE_PRIMARY_HOSTS.
 */
export function isKnownAppHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1") return true;
  if (h.endsWith(".vercel.app")) return true;
  return getPrimaryHosts().includes(h);
}

/**
 * Resolves a request hostname to the school that owns it, for a visitor who
 * may not be signed in at all. Returns null when the host has no verified
 * domain on record — the ordinary case for the app's own primary host, since
 * nothing is registered there. Callers must fall through to today's
 * behaviour on null, not treat it as an error.
 *
 * This is ROUTING information only, never authorization: a match only ever
 * decides which public page a visitor is shown. It must never be used to
 * decide what data a request can read or write — that stays entirely with
 * private.current_school_id(), derived solely from the signed-in user's own
 * profile (see ARCHITECTURE.md §21).
 *
 * Plain REST call with the public (RLS-bound) key — no cookies, no session,
 * safe to call before any auth state exists. The underlying table exposes
 * nothing to `anon` beyond (domain, school_id) for verified domains of
 * active schools (migration 20261006201500).
 */
export async function resolveTenantHost(host: string | null): Promise<TenantHostMatch | null> {
  if (!host) return null;
  const hostname = host.split(":")[0]?.toLowerCase();
  if (!hostname) return null;

  let supabaseUrl: string;
  let supabaseKey: string;
  try {
    ({ supabaseUrl, supabaseKey } = getPublicEnv());
  } catch {
    return null;
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/school_domains?select=school_id&domain=eq.${encodeURIComponent(hostname)}&limit=1`,
      {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
        // A domain's school never changes meaning from one request to the
        // next in a way that's safe to serve stale across deployments.
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ school_id?: string }>;
    const schoolId = rows[0]?.school_id;
    return schoolId ? { schoolId } : null;
  } catch {
    // Network or config hiccup: never let a lookup failure break routing —
    // fall through to ordinary behaviour rather than failing the request.
    return null;
  }
}
