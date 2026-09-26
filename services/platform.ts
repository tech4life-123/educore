import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
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
