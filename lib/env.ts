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
