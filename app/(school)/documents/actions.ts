"use server";

import { revalidatePath } from "next/cache";
import { documentErrorMessage } from "@/lib/documents";
import type { ActionState } from "@/lib/action-state";
import { parseAmount } from "@/lib/finance";
import { createClient } from "@/lib/supabase/server";
import { requireCapability, requireSchoolMember } from "@/services/auth";

/**
 * Document-services server actions. Each validates the shape of its input and
 * forwards it to a doc_* database function, which re-checks who the caller is,
 * derives the school from their profile, and enforces every rule (fee,
 * clearance, approval, override). Nothing here decides whether a document is
 * allowed.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const err = (message: string): ActionState => ({ status: "error", message });
const ok = (message: string): ActionState => ({ status: "success", message });

function refresh() {
  revalidatePath("/documents", "layout");
  revalidatePath("/my-documents");
  revalidatePath("/my-fees");
  revalidatePath("/finance", "layout");
}

// ------------------------------------------------- students, parents, staff

export async function requestDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSchoolMember("/my-documents");
  const student = str(formData, "student_id");
  const type = str(formData, "type_id");
  if (!UUID.test(student) || !UUID.test(type)) return err("Choose the document.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("doc_request", { p_student_id: student, p_type_id: type, p_note: str(formData, "note") });
  if (error) return err(documentErrorMessage(error, "The request couldn’t be made."));
  refresh();
  return ok("Requested. If a fee applies, it now appears under My fees.");
}

export async function cancelRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSchoolMember("/my-documents");
  const id = str(formData, "request_id");
  if (!UUID.test(id)) return err("Choose a request.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("doc_cancel_request", { p_request_id: id, p_reason: str(formData, "reason") });
  if (error) return err(documentErrorMessage(error, "The request couldn’t be cancelled."));
  refresh();
  return ok("Cancelled.");
}

// -------------------------------------------------------------------- staff

async function guard() {
  await requireCapability("documents.manage", "/documents");
  return createClient();
}

export async function reviewRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await guard();
  const id = str(formData, "request_id");
  const approve = str(formData, "decision") === "approve";
  if (!UUID.test(id)) return err("Choose a request.");
  const { error } = await supabase.rpc("doc_review_request", { p_request_id: id, p_approve: approve, p_note: str(formData, "note") });
  if (error) return err(documentErrorMessage(error, "The review couldn’t be saved."));
  refresh();
  return ok(approve ? "Approved." : "Rejected.");
}

export async function generateDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await guard();
  const id = str(formData, "request_id");
  if (!UUID.test(id)) return err("Choose a request.");
  const { error } = await supabase.rpc("doc_generate", { p_request_id: id, p_override_reason: str(formData, "override_reason") });
  if (error) return err(documentErrorMessage(error, "The document couldn’t be generated."));
  refresh();
  return ok("Generated.");
}

export async function markDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await guard();
  const id = str(formData, "request_id");
  const status = str(formData, "status");
  if (!UUID.test(id) || (status !== "printed" && status !== "delivered")) return err("Choose a request.");
  const { error } = await supabase.rpc("doc_mark", { p_request_id: id, p_status: status });
  if (error) return err(documentErrorMessage(error, "It couldn’t be updated."));
  refresh();
  return ok(status === "printed" ? "Marked as printed." : "Marked as delivered.");
}

export async function revokeDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await guard();
  const id = str(formData, "document_id");
  const reason = str(formData, "reason");
  if (!UUID.test(id)) return err("Choose a document.");
  if (reason.length < 3) return err("Give a short reason.");
  const { error } = await supabase.rpc("doc_revoke", { p_document_id: id, p_reason: reason });
  if (error) return err(documentErrorMessage(error, "The document couldn’t be revoked."));
  refresh();
  return ok("Revoked. Its QR code now shows it as no longer valid.");
}

// ------------------------------------------------------ school admin settings

async function adminGuard() {
  await requireCapability("school.manage", "/documents/settings");
  return createClient();
}

export async function seedDocumentTypesAction(): Promise<ActionState> {
  const supabase = await adminGuard();
  const { data, error } = await supabase.rpc("doc_seed_types");
  if (error) return err(documentErrorMessage(error, "The standard documents couldn’t be added."));
  revalidatePath("/documents", "layout");
  return ok(data ? `Added ${data} standard document${data === 1 ? "" : "s"}. Review each one’s fee and rules.` : "The standard documents are already there.");
}

export async function saveDocumentTypeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await adminGuard();
  const id = str(formData, "id");
  const name = str(formData, "name");
  const code = str(formData, "code").toLowerCase();
  const feeRaw = str(formData, "fee_amount");
  const currency = str(formData, "currency");
  const flag = (k: string) => formData.get(k) === "on";

  if (id && !UUID.test(id)) return err("Choose a document.");
  if (!id && !/^[a-z][a-z0-9_]{1,39}$/.test(code)) return err("Use a short code of lower-case letters, numbers and underscores, e.g. enrolment_proof.");
  if (name.length < 2 || name.length > 80) return err("Enter a name (2–80 characters).");
  const fee = feeRaw === "" || feeRaw === "0" ? 0 : parseAmount(feeRaw);
  if (fee === null) return err("Enter the fee as an amount with at most 2 decimals, or leave it blank for free.");
  if (currency && currency !== "USD" && currency !== "LRD") return err("Choose USD or LRD.");
  if (flag("requires_payment") && fee <= 0) return err("Set a fee above zero, or turn off “payment required”.");

  const { error } = await supabase.rpc("doc_save_type", {
    p_id: (id || null) as unknown as string,
    p_code: code,
    p_name: name,
    p_description: str(formData, "description"),
    p_fee: fee,
    p_currency: currency,
    p_requires_payment: flag("requires_payment"),
    p_requires_clearance: flag("requires_clearance"),
    p_requires_approval: flag("requires_approval"),
    p_allow_override: flag("allow_override"),
    p_admissions_handled: flag("admissions_handled"),
    p_active: flag("active"),
  });
  if (error) return err(documentErrorMessage(error, "The document couldn’t be saved."));
  revalidatePath("/documents", "layout");
  revalidatePath("/my-documents");
  return ok("Saved.");
}
