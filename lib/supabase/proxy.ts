import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/env";
import { ACTIVITY_COOKIE, ACTIVITY_COOKIE_MAX_AGE_S, INACTIVITY_TIMEOUT_MS } from "@/lib/auth/inactivity";

export const PROTECTED_PREFIXES = ["/dashboard", "/platform", "/settings", "/account", "/users", "/academics", "/classes", "/grades", "/report-cards", "/attendance", "/students", "/teachers", "/announcements", "/reports", "/print", "/change-password"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Runs on every matched request (see proxy.ts):
 *  1. Refreshes the Supabase session cookie if needed.
 *  2. Performs an OPTIMISTIC redirect of signed-out visitors away from
 *     protected routes.
 *  3. Enforces the five-minute inactivity sign-out as a server-side backstop:
 *     if the last recorded activity is older than the timeout, the session
 *     is revoked here even if the browser's own timer (components/auth/
 *     inactivity-guard.tsx) never ran — e.g. JavaScript was blocked, or the
 *     tab was closed rather than left open. A fresh request is itself
 *     activity, so it refreshes the stamp for everyone else.
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

  const protectedPath = isProtectedPath(request.nextUrl.pathname);

  if (!isAuthenticated && protectedPath) {
    return redirectToLogin(request, response);
  }

  if (isAuthenticated && protectedPath) {
    const now = Date.now();
    const rawStamp = request.cookies.get(ACTIVITY_COOKIE)?.value;
    // Number("") is 0, not NaN — parsing an empty or missing cookie value
    // naively would read as "epoch zero", i.e. infinitely stale, and sign
    // out every fresh sign-in. A sane stamp is a real, past timestamp: it
    // must be a positive number no later than now (a future value can only
    // be clock skew or a corrupted cookie, never grounds to sign someone out).
    const stamped = rawStamp ? Number(rawStamp) : NaN;
    const hasSaneStamp = Number.isFinite(stamped) && stamped > 0 && stamped <= now;
    const stale = hasSaneStamp && now - stamped > INACTIVITY_TIMEOUT_MS;

    if (stale) {
      console.error(
        "[auth] inactivity sign-out",
        JSON.stringify({ path: request.nextUrl.pathname, idleMs: now - stamped }),
      );
      try {
        await supabase.auth.signOut();
      } catch {
        // Already invalid or unreachable — still redirect below either way.
      }
      return redirectToLogin(request, response, "inactivity");
    }

    // This request is itself real activity (a genuine navigation): refresh
    // the stamp so the clock only ever measures time since something the
    // person actually did.
    response.cookies.set(ACTIVITY_COOKIE, String(now), {
      path: "/",
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      maxAge: ACTIVITY_COOKIE_MAX_AGE_S,
    });
  }

  return response;
}

function redirectToLogin(request: NextRequest, carryCookiesFrom?: NextResponse, reason?: string) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  if (reason) loginUrl.searchParams.set("reason", reason);
  const redirect = NextResponse.redirect(loginUrl);
  carryCookiesFrom?.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  redirect.cookies.delete(ACTIVITY_COOKIE);
  return redirect;
}
