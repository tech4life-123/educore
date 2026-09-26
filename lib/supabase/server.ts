import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Server Supabase client for Server Components, Server Actions and Route
 * Handlers. It acts AS THE SIGNED-IN USER (session read from cookies), so all
 * queries remain subject to Row Level Security.
 *
 * Create a new client per request — never share one across requests.
 */
export async function createClient() {
  const { supabaseUrl, supabaseKey } = getPublicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Safe to ignore: proxy.ts refreshes the session on every request.
        }
      },
    },
  });
}
