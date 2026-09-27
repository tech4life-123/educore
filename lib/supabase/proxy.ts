import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/env";

export const PROTECTED_PREFIXES = ["/dashboard", "/platform", "/settings", "/account", "/users", "/academics", "/classes", "/grades", "/report-cards", "/attendance", "/students", "/teachers", "/print", "/change-password"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Runs on every matched request (see proxy.ts):
 *  1. Refreshes the Supabase session cookie if needed.
 *  2. Performs an OPTIMISTIC redirect of signed-out visitors away from
 *     protected routes.
 *
 * This is not the authorization boundary — every protected page re-checks
 * the session and role on the server (services/auth.ts), and the database
 * enforces tenant isolation with RLS.
 */
export async function updateSession(request: NextRequest) {
  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();

  let response = NextResponse.next({ request });

  // Misconfigured deployment: fail closed on protected routes.
  if (!url || !key) {
    return isProtectedPath(request.nextUrl.pathname) ? redirectToLogin(request) : response;
  }

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([header, value]) => response.headers.set(header, value));
      },
    },
  });

  // Do not run code between createServerClient and getClaims().
  // getClaims() verifies the JWT and refreshes the session when needed.
  let isAuthenticated = false;
  try {
    const { data } = await supabase.auth.getClaims();
    isAuthenticated = Boolean(data?.claims?.sub);
  } catch {
    isAuthenticated = false;
  }

  if (!isAuthenticated && isProtectedPath(request.nextUrl.pathname)) {
    return redirectToLogin(request, response);
  }

  return response;
}

function redirectToLogin(request: NextRequest, carryCookiesFrom?: NextResponse) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  const redirect = NextResponse.redirect(loginUrl);
  carryCookiesFrom?.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
