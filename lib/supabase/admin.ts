import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSupabaseUrl } from "@/lib/env";

/**
 * PRIVILEGED Supabase client (service role). BYPASSES Row Level Security.
 *
 * Rules:
 *  - `import "server-only"` makes the build fail if this module is ever pulled
 *    into a Client Component bundle.
 *  - SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_ prefix, so Next.js never
 *    inlines it into browser JavaScript.
 *  - Only call this AFTER an explicit server-side authorization check
 *    (see requireSuperAdmin in services/auth.ts). Never pass user input
 *    straight into privileged queries.
 *
 * Returns null when the key is not configured so callers can degrade safely.
 */
export function createAdminClient() {
  const url = getSupabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
