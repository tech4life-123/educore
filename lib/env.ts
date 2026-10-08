/**
 * Public (browser-safe) configuration.
 *
 * Only values that are safe to ship to every visitor may live here. The
 * Supabase URL and publishable/anon key are public by design: all data access
 * with them is constrained by Row Level Security.
 *
 * NEXT_PUBLIC_* values must be referenced literally (process.env.NEXT_PUBLIC_X)
 * so Next.js can inline them at build time.
 */

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export interface PublicEnv {
  supabaseUrl: string;
  supabaseKey: string;
}

/**
 * Supabase URL. NEXT_PUBLIC_SUPABASE_URL is preferred; SUPABASE_URL (the name
 * the Supabase ↔ Vercel integration also syncs) is accepted as a server-side
 * fallback. Both are public values.
 */
export function getSupabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || undefined;
}

/**
 * Public (RLS-bound) Supabase key — publishable key preferred, legacy anon key
 * accepted, under either the NEXT_PUBLIC_ name or the integration's server name.
 * Never the service-role key.
 */
export function getSupabasePublicKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    undefined
  );
}

export function getPublicEnv(): PublicEnv {
  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabasePublicKey();

  if (!supabaseUrl || !supabaseKey) {
    throw new ConfigurationError(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).",
    );
  }

  return { supabaseUrl, supabaseKey };
}

export function isSupabaseConfigured(): boolean {
  try {
    getPublicEnv();
    return true;
  } catch {
    return false;
  }
}

/**
 * Hostnames that are "the app itself", never a school's marketing domain —
 * e.g. a custom root domain the pilot school signs in through today.
 * EDUCORE_PRIMARY_HOSTS is a comma-separated list; unset/empty means the
 * hostname-fallback feature in proxy.ts stays entirely off (see
 * ARCHITECTURE.md §21.2) — this must never silently start gating real
 * traffic just because the list is empty.
 */
export function getPrimaryHosts(): string[] {
  return (process.env.EDUCORE_PRIMARY_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The platform-owned base domain for school addresses (<slug>.<base>), e.g.
 * "educore.example". Unset means automatic school addresses are off. Only a
 * plain hostname is accepted; anything else is treated as unset.
 */
export function getSchoolDomainBase(): string | undefined {
  const v = (process.env.EDUCORE_SCHOOL_DOMAIN ?? "").trim().toLowerCase();
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(v) ? v : undefined;
}
