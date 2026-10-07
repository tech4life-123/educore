"use server";

import { revalidatePath } from "next/cache";
import { friendlyDbError, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/services/auth";

const field = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const STATUSES = new Set(["verified", "failed"] as const);
type ReviewStatus = "verified" | "failed";

/**
 * Approve or reject a school's custom-domain request. Authorized again
 * inside the database (platform_set_domain_verification). This only flips
 * the review status here — it does not yet provision anything with Vercel
 * (that's a later phase of the plan), so "Approve" means "a super admin
 * reviewed and accepted this request," not "DNS/TLS are live."
 */
export async function setDomainVerificationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const domainId = field(formData, "domain_id");
  const status = field(formData, "status") as ReviewStatus;
  if (!STATUSES.has(status)) return { status: "error", message: "Choose a valid status." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_set_domain_verification", { p_domain_id: domainId, p_status: status });
  if (error) return { status: "error", message: friendlyDbError(error, "The request couldn’t be updated.") };

  revalidatePath("/platform/domains");
  return {
    status: "success",
    message: status === "verified" ? "Approved. Remember this doesn’t provision DNS/TLS yet." : "Rejected.",
  };
}
