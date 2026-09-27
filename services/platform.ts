import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { requireSuperAdmin } from "./auth";
import type { School } from "./auth";

export type PlatformSchoolRow = Pick<School, "id" | "name" | "code" | "school_type" | "status" | "county" | "created_at">;

export type PlatformSchoolsResult =
  | { status: "ok"; schools: PlatformSchoolRow[] }
  | { status: "not_configured" }
  | { status: "error" };

/**
 * Cross-tenant school directory for platform operators.
 *
 * This is the ONLY place in the foundation that uses the service-role client.
 * It authorizes first (requireSuperAdmin verifies the caller's own profile row
 * via RLS), and only then performs the privileged, read-only query. The result
 * never leaves the server except as rendered HTML for that super admin.
 */
export async function listSchoolsForPlatform(): Promise<PlatformSchoolsResult> {
  await requireSuperAdmin();

  const admin = createAdminClient();
  if (!admin) return { status: "not_configured" };

  const { data, error } = await admin
    .from("schools")
    .select("id, name, code, school_type, status, county, created_at")
    .order("name", { ascending: true })
    .limit(500);

  if (error) {
    console.error("[platform] school listing failed", error.code);
    return { status: "error" };
  }
  return { status: "ok", schools: data };
}

// ---------------------------------------------------------------------------
// One school, for the platform detail page
// ---------------------------------------------------------------------------

export type PlatformSchool = Pick<
  School,
  "id" | "name" | "code" | "slug" | "school_type" | "status" | "county" | "city" | "motto" | "phone" | "email" | "created_at"
>;

export interface PlatformSchoolAdmin {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  username: string | null;
  email: string | null;
  status: string;
  createdAt: string;
}

export type PlatformSchoolResult =
  | { status: "ok"; school: PlatformSchool; admins: PlatformSchoolAdmin[] }
  | { status: "not_found" }
  | { status: "not_configured" }
  | { status: "error" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A school and its administrator accounts (names and logins only). */
export async function getSchoolForPlatform(schoolId: string): Promise<PlatformSchoolResult> {
  await requireSuperAdmin();
  if (!UUID.test(schoolId)) return { status: "not_found" };

  const admin = createAdminClient();
  if (!admin) return { status: "not_configured" };

  const [school, admins] = await Promise.all([
    admin
      .from("schools")
      .select("id, name, code, slug, school_type, status, county, city, motto, phone, email, created_at")
      .eq("id", schoolId)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("id, first_name, middle_name, last_name, username, email, status, created_at")
      .eq("school_id", schoolId)
      .eq("role", "school_admin")
      .order("created_at"),
  ]);
  if (school.error || admins.error) {
    console.error("[platform] school detail failed", school.error?.code ?? admins.error?.code);
    return { status: "error" };
  }
  if (!school.data) return { status: "not_found" };
  return {
    status: "ok",
    school: school.data,
    admins: admins.data.map((a) => ({
      id: a.id,
      firstName: a.first_name,
      middleName: a.middle_name,
      lastName: a.last_name,
      username: a.username,
      email: a.email,
      status: a.status,
      createdAt: a.created_at,
    })),
  };
}

// ---------------------------------------------------------------------------
// Cross-school statistics (aggregates only; authorized inside the database)
// ---------------------------------------------------------------------------

export type SchoolStatistics = Database["public"]["Functions"]["platform_school_statistics"]["Returns"][number];

export async function getPlatformStatistics(): Promise<SchoolStatistics[]> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_school_statistics");
  if (error) {
    console.error("[platform] statistics failed", error.code);
    throw new Error("Unable to load statistics");
  }
  return data.map((r) => ({ ...r, passing_score: Number(r.passing_score) }));
}
