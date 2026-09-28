"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ConfigurationError } from "@/lib/env";
import { ACTIVITY_COOKIE, ACTIVITY_COOKIE_MAX_AGE_S } from "@/lib/auth/inactivity";
import { homePathForRole } from "@/lib/auth/roles";
import { safeNextPath } from "@/lib/auth/safe-redirect";
import { parseLoginIdentifier } from "@/lib/auth/login-id";

export interface LoginState {
  formError?: string;
  fieldErrors?: { email?: string; password?: string };
  email?: string;
}

export async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));
  const identifier = parseLoginIdentifier(email);

  const fieldErrors: LoginState["fieldErrors"] = {};
  if (!email) fieldErrors.email = "Enter your email or username.";
  else if (identifier.kind === "invalid") {
    fieldErrors.email = "Enter your email, or your username with your school code, e.g. stu0042@PILOT-01.";
  }
  if (!password) fieldErrors.password = "Enter your password.";
  else if (password.length > 128) fieldErrors.password = "Password is too long.";

  if (fieldErrors.email || fieldErrors.password || identifier.kind === "invalid") return { fieldErrors, email };

  let destination: string;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email: identifier.authEmail, password });

    if (error || !data.user) {
      return { formError: messageForAuthError(error), email };
    }

    // Decide where to go from the user's own profile (readable under RLS).
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status, must_change_password")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (!profile || profile.status !== "active") {
      destination = "/account";
    } else if (profile.must_change_password) {
      destination = "/change-password";
    } else if (profile.role === "super_admin") {
      // A platform admin's own sub-page (e.g. a school they were looking at)
      // is safe to return to; anything else falls back to their home page.
      destination = next && next.startsWith("/platform") ? next : "/platform";
    } else {
      destination = next && !next.startsWith("/platform") ? next : homePathForRole(profile.role);
    }
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return { formError: "Sign-in is temporarily unavailable. Please contact your administrator.", email };
    }
    console.error("[auth] sign-in failed", error instanceof Error ? error.name : "unknown");
    return { formError: "We couldn’t reach the server. Check your connection and try again.", email };
  }

  // Baseline for the five-minute inactivity sign-out (lib/auth/inactivity.ts),
  // so the server-side check in proxy.ts has something to measure from even
  // before the browser's own activity tracker has run once.
  try {
    (await cookies()).set(ACTIVITY_COOKIE, String(Date.now()), {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: ACTIVITY_COOKIE_MAX_AGE_S,
    });
  } catch {
    // Non-essential: proxy.ts will stamp it on the very next request regardless.
  }

  redirect(destination);
}

export async function signOut() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch (error) {
    console.error("[auth] sign-out failed", error instanceof Error ? error.name : "unknown");
  }
  await clearActivityCookie();
  redirect("/login");
}

/**
 * Sign-out triggered by the client-side inactivity timer (components/auth/
 * inactivity-guard.tsx), not a form submit. It only revokes the session —
 * the caller navigates to /login?reason=inactivity&next=<page they were on>
 * itself, so they land back where they left off once they sign back in (see
 * the `next` handling in signIn above, and in lib/supabase/proxy.ts).
 */
export async function signOutInactive() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch (error) {
    console.error("[auth] inactivity sign-out failed", error instanceof Error ? error.name : "unknown");
  }
  await clearActivityCookie();
}

async function clearActivityCookie() {
  try {
    (await cookies()).delete(ACTIVITY_COOKIE);
  } catch {
    // Best-effort; a stale cookie alone can't extend a revoked session.
  }
}

function messageForAuthError(error: AuthError | null): string {
  if (!error) return "Sign-in failed. Please try again.";
  if (isAuthRetryableFetchError(error)) return "We couldn’t reach the server. Check your connection and try again.";
  if (error.status === 429) return "Too many attempts. Please wait a few minutes and try again.";
  if (error.code === "email_not_confirmed") return "Your email address has not been confirmed yet.";
  // Deliberately generic: never reveal whether an account exists.
  if (error.code === "invalid_credentials" || error.status === 400) return "Incorrect email or password.";
  if (error.status && error.status >= 500) return "The sign-in service is having trouble. Please try again shortly.";
  // No usable response (offline, captive portal, gateway page, etc.).
  return "We couldn’t reach the sign-in service. Check your connection and try again.";
}
