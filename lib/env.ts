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

export function getPublicEnv(): PublicEnv {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
