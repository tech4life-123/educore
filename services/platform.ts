import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { requireSuperAdmin } from "./auth";
import type { School } from "./auth";

export type PlatformSchoolRow = Pick<School, "id" | "name" | "code" | "school_type" | "status" | "county" | "created_at" | "is_demo">;

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
    .select("id, name, code, school_type, status, county, created_at, is_demo")
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
  "id" | "name" | "code" | "slug" | "school_type" | "status" | "county" | "city" | "motto" | "phone" | "email" | "created_at" | "is_demo"
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
      .select("id, name, code, slug, school_type, status, county, city, motto, phone, email, created_at, is_demo")
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

// ---------------------------------------------------------------------------
// Custom-domain requests (multi-school domains plan, step 4)
// ---------------------------------------------------------------------------

export interface PlatformDomainRow {
  id: string;
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  domain: string;
  domainType: "subdomain" | "custom";
  isPrimary: boolean;
  verificationStatus: "pending" | "verified" | "failed";
  sslStatus: string;
  /** Added to the Vercel project; waiting on the school's DNS. */
  connected: boolean;
  /** Plain-words DNS records the school still has to add (empty when none). */
  dnsInstructions: string | null;
  createdAt: string;
}

export type PlatformDomainsResult = { status: "ok"; domains: PlatformDomainRow[] } | { status: "not_configured" } | { status: "error" };

/**
 * Every custom-domain request across all schools, newest first, for the
 * Super Admin "Domains" review dashboard. Cross-tenant read via the
 * service-role client — same pattern as listSchoolsForPlatform — because a
 * super admin has no RLS read access to other schools' school_domains rows.
 *
 * Built-in *.educore subdomains are included too (read-only here) so the
 * dashboard also shows what already exists, but only `custom` rows can be
 * acted on — see platform_set_domain_verification.
 */
export async function listDomainsForPlatform(): Promise<PlatformDomainsResult> {
  await requireSuperAdmin();

  const admin = createAdminClient();
  if (!admin) return { status: "not_configured" };

  const { data, error } = await admin
    .from("school_domains")
    .select("id, school_id, domain, domain_type, is_primary, verification_status, ssl_status, vercel_domain_id, verification_token, created_at, schools(name, code)")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[platform] domain listing failed", error.code);
    return { status: "error" };
  }

  return {
    status: "ok",
    domains: data.map((d) => ({
      id: d.id,
      schoolId: d.school_id,
      schoolName: d.schools?.name ?? "—",
      schoolCode: d.schools?.code ?? "—",
      domain: d.domain,
      domainType: d.domain_type,
      isPrimary: d.is_primary,
      verificationStatus: d.verification_status,
      sslStatus: d.ssl_status,
      connected: d.vercel_domain_id !== null,
      dnsInstructions: d.verification_token,
      createdAt: d.created_at,
    })),
  };
}
