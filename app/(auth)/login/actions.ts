"use server";

import { redirect } from "next/navigation";
import { isAuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ConfigurationError } from "@/lib/env";
import { homePathForRole } from "@/lib/auth/roles";
import { safeNextPath } from "@/lib/auth/safe-redirect";

export interface LoginState {
  formError?: string;
  fieldErrors?: { email?: string; password?: string };
  email?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));

  const fieldErrors: LoginState["fieldErrors"] = {};
  if (!email) fieldErrors.email = "Enter your email address.";
  else if (!EMAIL_PATTERN.test(email) || email.length > 254) fieldErrors.email = "Enter a valid email address.";
  if (!password) fieldErrors.password = "Enter your password.";
  else if (password.length > 128) fieldErrors.password = "Password is too long.";

  if (fieldErrors.email || fieldErrors.password) return { fieldErrors, email };

  let destination: string;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      return { formError: messageForAuthError(error), email };
    }

    // Decide where to go from the user's own profile (readable under RLS).
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (!profile || profile.status !== "active") {
      destination = "/account";
    } else if (profile.role === "super_admin") {
      destination = "/platform";
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

  redirect(destination);
}

export async function signOut() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch (error) {
    console.error("[auth] sign-out failed", error instanceof Error ? error.name : "unknown");
  }
  redirect("/login");
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
