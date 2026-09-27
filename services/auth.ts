import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ConfigurationError } from "@/lib/env";
import { hasCapability, homePathForRole, type AppRole, type Capability } from "@/lib/auth/roles";
import type { Tables } from "@/types/database";

/**
 * Data Access Layer for identity and authorization.
 *
 * Every protected page / action calls one of the require* functions below.
 * Results are memoised per request with React `cache`, so layouts and pages
 * share a single round-trip.
 */

export type Profile = Tables<"profiles">;
export type School = Tables<"schools">;
export type SchoolSettings = Tables<"school_settings">;

/** Shape passed to UI — no internal ids beyond what the UI needs. */
export type ViewerProfile = Pick<
  Profile,
  | "id"
  | "first_name"
  | "middle_name"
  | "last_name"
  | "phone"
  | "photo_url"
  | "role"
  | "status"
  | "username"
  | "email"
  | "must_change_password"
>;
export type ViewerSchool = Pick<
  School,
  "id" | "name" | "code" | "motto" | "logo_url" | "primary_color" | "secondary_color" | "school_type" | "city" | "county" | "country"
>;

export type AuthContext =
  | { status: "unauthenticated" }
  | { status: "not_configured" }
  | { status: "error" }
  | { status: "no_profile"; user: User }
  | { status: "profile_inactive"; user: User; profile: ViewerProfile }
  | { status: "platform"; user: User; profile: ViewerProfile }
  | { status: "school_unavailable"; user: User; profile: ViewerProfile }
  | { status: "ok"; user: User; profile: ViewerProfile; school: ViewerSchool };

export type SchoolMemberContext = Extract<AuthContext, { status: "ok" }>;
export type PlatformContext = Extract<AuthContext, { status: "platform" }>;

const PROFILE_COLUMNS =
  "id, first_name, middle_name, last_name, phone, photo_url, role, status, username, email, must_change_password, school_id" as const;
const SCHOOL_COLUMNS =
  "id, name, code, motto, logo_url, primary_color, secondary_color, school_type, city, county, country" as const;

export const getAuthContext = cache(async (): Promise<AuthContext> => {
  // Identity is always per-request: never let a protected page be prerendered,
  // even when the build environment has no Supabase settings.
  await connection();

  let supabase;
  try {
    supabase = await createClient();
  } catch (error) {
    if (error instanceof ConfigurationError) return { status: "not_configured" };
    throw error;
  }

  try {
    // getUser() validates the session with the Supabase Auth server.
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return { status: "unauthenticated" };
    const user = userData.user;

    // RLS: a user can always read their own profile row.
    const { data: profileRow, error: profileError } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[auth] profile lookup failed", profileError.code);
      return { status: "error" };
    }
    if (!profileRow) return { status: "no_profile", user };

    const { school_id: schoolId, ...profile } = profileRow;

    if (profile.status !== "active") return { status: "profile_inactive", user, profile };
    if (profile.role === "super_admin") return { status: "platform", user, profile };
    if (!schoolId) return { status: "school_unavailable", user, profile };

    // RLS: returns the row only if the school is active and is the user's own.
    const { data: school, error: schoolError } = await supabase
      .from("schools")
      .select(SCHOOL_COLUMNS)
      .eq("id", schoolId)
      .maybeSingle();

    if (schoolError) {
      console.error("[auth] school lookup failed", schoolError.code);
      return { status: "error" };
    }
    if (!school) return { status: "school_unavailable", user, profile };

    return { status: "ok", user, profile, school };
  } catch (error) {
    console.error("[auth] unexpected failure", error instanceof Error ? error.name : "unknown");
    return { status: "error" };
  }
});

/** Any signed-in user. Unauthenticated visitors go to /login. */
export async function requireUser(nextPath?: string) {
  const context = await getAuthContext();
  if (context.status === "unauthenticated" || context.status === "not_configured") {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  }
  return context;
}

/** An active member of an active school. Everyone else is routed appropriately. */
export async function requireSchoolMember(nextPath: string): Promise<SchoolMemberContext> {
  const context = await requireUser(nextPath);
  if (context.status === "ok") {
    if (context.profile.must_change_password) redirect("/change-password");
    return context;
  }
  if (context.status === "platform") redirect("/platform");
  redirect("/account");
}

/** Platform super admin — verified server-side from their own profile row. */
export async function requireSuperAdmin(): Promise<PlatformContext> {
  const context = await requireUser("/platform");
  if (context.status === "platform") {
    if (context.profile.must_change_password) redirect("/change-password");
    return context;
  }
  if (context.status === "ok") redirect("/dashboard?denied=platform");
  redirect("/account");
}

/** A school member holding a specific capability. */
export async function requireCapability(capability: Capability, nextPath: string) {
  const context = await requireSchoolMember(nextPath);
  if (!hasCapability(context.profile.role, capability)) {
    redirect("/dashboard?denied=1");
  }
  return context;
}

export function landingPathFor(context: AuthContext): string {
  switch (context.status) {
    case "ok":
    case "platform":
      return homePathForRole(context.profile.role as AppRole);
    case "unauthenticated":
    case "not_configured":
      return "/login";
    default:
      return "/account";
  }
}
