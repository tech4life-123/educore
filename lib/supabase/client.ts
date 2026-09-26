import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Browser Supabase client. Uses ONLY the public publishable/anon key, so every
 * query is subject to Row Level Security as the signed-in user.
 */
export function createClient() {
  const { supabaseUrl, supabaseKey } = getPublicEnv();
  return createBrowserClient<Database>(supabaseUrl, supabaseKey);
}
