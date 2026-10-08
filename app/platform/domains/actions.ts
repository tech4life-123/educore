"use server";

import { revalidatePath } from "next/cache";
import { friendlyDbError, type ActionState } from "@/lib/action-state";
import { getSchoolDomainBase } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkDomain, connectDomain, describeRecords, disconnectDomain, getVercelConfig } from "@/lib/vercel-domains";
import { requireSuperAdmin } from "@/services/auth";

const field = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const STATUSES = new Set(["verified", "failed"] as const);
type ReviewStatus = "verified" | "failed";

interface DomainRow {
  id: string;
  domain: string;
  domain_type: string;
  verification_status: string;
  vercel_domain_id: string | null;
}

/** Loads one custom-domain request with the service key. Callers have already required a super admin. */
async function loadCustomDomain(domainId: string) {
  const admin = createAdminClient();
  if (!admin) return { error: "The server-side service key is not set for this deployment." } as const;
  const { data, error } = await admin
    .from("school_domains")
    .select("id, domain, domain_type, verification_status, vercel_domain_id")
    .eq("id", domainId)
    .maybeSingle();
  if (error || !data) return { error: "That domain request was not found." } as const;
  const row = data as DomainRow;
  if (row.domain_type !== "custom") return { error: "Only custom domain requests can be managed here." } as const;
  return { admin, row } as const;
}

/**
 * Approve or reject a school's custom-domain request. Authorized again
 * inside the database (platform_set_domain_verification).
 *
 * With Vercel configured, "Approve" is done by the Connect and Check steps
 * below (a domain only becomes verified once its DNS really works), so this
 * only handles Reject there; it also takes a rejected domain off Vercel.
 * Without Vercel configured, Approve stays a manual review decision.
 */
export async function setDomainVerificationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const domainId = field(formData, "domain_id");
  const status = field(formData, "status") as ReviewStatus;
  if (!STATUSES.has(status)) return { status: "error", message: "Choose a valid status." };
  const cfg = getVercelConfig();
  if (status === "verified" && cfg) {
    return { status: "error", message: "Use “Connect to Vercel” and then “Check DNS”; a domain is approved once its DNS works." };
  }

  let removedNote = "";
  if (status === "failed" && cfg) {
    const loaded = await loadCustomDomain(domainId);
    if (!("error" in loaded) && loaded.row.vercel_domain_id) {
      const gone = await disconnectDomain(loaded.row.domain, cfg);
      if (!gone.ok) return { status: "error", message: `Could not remove it from Vercel: ${gone.message}` };
      await loaded.admin.from("school_domains").update({ vercel_domain_id: null, verification_token: null }).eq("id", domainId);
      removedNote = " It was also removed from Vercel.";
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_set_domain_verification", { p_domain_id: domainId, p_status: status });
  if (error) return { status: "error", message: friendlyDbError(error, "The request couldn’t be updated.") };

  revalidatePath("/platform/domains");
  return {
    status: "success",
    message: status === "verified" ? "Approved. Remember this doesn’t provision DNS/TLS yet." : `Rejected.${removedNote}`,
  };
}

/** Adds an approved-for-review custom domain to the Vercel project and records the DNS the school must set up. */
export async function connectDomainAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const cfg = getVercelConfig();
  if (!cfg) return { status: "error", message: "Vercel is not configured for this deployment." };
  const loaded = await loadCustomDomain(field(formData, "domain_id"));
  if ("error" in loaded) return { status: "error", message: loaded.error };
  if (loaded.row.verification_status !== "pending") return { status: "error", message: "Only requests awaiting review can be connected." };

  const result = await connectDomain(loaded.row.domain, cfg);
  if (!result.ok) return { status: "error", message: `Vercel said: ${result.message}` };

  const instructions = result.value.records.length ? describeRecords(result.value.records) : null;
  const { error } = await loaded.admin
    .from("school_domains")
    .update({ vercel_domain_id: loaded.row.domain, verification_token: instructions })
    .eq("id", loaded.row.id);
  if (error) return { status: "error", message: "Connected on Vercel, but the result could not be saved. Press Connect again." };

  revalidatePath("/platform/domains");
  return {
    status: "success",
    message: instructions
      ? `Connected. Ask the school to add: ${instructions}. Then press “Check DNS”.`
      : "Connected, and the DNS already looks right. Press “Check DNS” to finish.",
  };
}

/** Re-checks DNS; once Vercel confirms it, marks the domain verified so the app starts routing it. */
export async function checkDomainAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const cfg = getVercelConfig();
  if (!cfg) return { status: "error", message: "Vercel is not configured for this deployment." };
  const loaded = await loadCustomDomain(field(formData, "domain_id"));
  if ("error" in loaded) return { status: "error", message: loaded.error };
  if (!loaded.row.vercel_domain_id) return { status: "error", message: "Connect the domain to Vercel first." };

  const result = await checkDomain(loaded.row.domain, cfg);
  if (!result.ok) return { status: "error", message: `Vercel said: ${result.message}` };

  if (result.value.verified && !result.value.misconfigured) {
    const supabase = await createClient();
    const { error } = await supabase.rpc("platform_set_domain_verification", { p_domain_id: loaded.row.id, p_status: "verified" });
    if (error) return { status: "error", message: friendlyDbError(error, "The domain could not be marked verified.") };
    // Vercel issues the certificate on its own once DNS is right; there is no separate signal to wait for.
    await loaded.admin.from("school_domains").update({ ssl_status: "issued", verification_token: null }).eq("id", loaded.row.id);
    revalidatePath("/platform/domains");
    return { status: "success", message: "DNS is correct. The domain is verified and will start working as the certificate is issued." };
  }

  const instructions = result.value.records.length ? describeRecords(result.value.records) : null;
  await loaded.admin.from("school_domains").update({ verification_token: instructions }).eq("id", loaded.row.id);
  revalidatePath("/platform/domains");
  return {
    status: "error",
    message: instructions ? `Not ready yet. Still needed: ${instructions}.` : "Not ready yet. DNS changes can take a while to spread; try again later.",
  };
}

/** Gives every active school that has no system address one (<slug>.<base>). Safe to press repeatedly. */
export async function provisionMissingSubdomainsAction(): Promise<ActionState> {
  await requireSuperAdmin();
  const base = getSchoolDomainBase();
  if (!base) return { status: "error", message: "No base domain is set (EDUCORE_SCHOOL_DOMAIN)." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_provision_missing_subdomains", { p_base: base });
  if (error) return { status: "error", message: friendlyDbError(error, "The addresses couldn’t be created.") };
  revalidatePath("/platform/domains");
  return { status: "success", message: data === 0 ? "Every active school already has an address." : `Created ${data} school address${data === 1 ? "" : "es"}.` };
}
