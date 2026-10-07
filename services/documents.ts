import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { DocumentStatus } from "@/lib/documents";
import type { Json, Tables } from "@/types/database";

/**
 * Document-services reads. Everything runs as the signed-in person; the
 * `document_request_details` view applies the same visibility as the tables
 * (family: own/children, staff: the types they may process). Read-only.
 */

export type DocumentTypeRow = Tables<"document_types">;

export interface DocumentRequestRow {
  id: string;
  studentId: string;
  studentName: string;
  admissionNumber: string | null;
  typeId: string;
  typeCode: string;
  typeName: string;
  feeAmount: number;
  typeCurrency: string | null;
  requiresPayment: boolean;
  requiresClearance: boolean;
  requiresApproval: boolean;
  allowOverride: boolean;
  status: DocumentStatus;
  note: string | null;
  reviewDecision: string | null;
  reviewNote: string | null;
  overrideReason: string | null;
  cancelledReason: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  invoiceBalanceDue: number;
  invoiceCurrency: string | null;
  documentId: string | null;
  documentNumber: string | null;
  documentRevoked: boolean;
  createdAt: string;
}

function fail(scope: string, error: { code?: string } | null): never {
  console.error(`[documents] ${scope} failed`, error?.code ?? "unknown");
  throw new Error(`Unable to load ${scope}`);
}

const num = (v: number | string | null | undefined) => Number(v ?? 0);

export async function listDocumentTypes(options: { activeOnly?: boolean } = {}): Promise<DocumentTypeRow[]> {
  const supabase = await createClient();
  let q = supabase.from("document_types").select("*").order("name");
  if (options.activeOnly) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) fail("document types", error);
  return (data ?? []).map((t) => ({ ...t, fee_amount: num(t.fee_amount) }));
}

export async function listDocumentRequests({
  studentIds,
  status,
  limit = 300,
}: { studentIds?: string[]; status?: DocumentStatus | "open"; limit?: number } = {}): Promise<DocumentRequestRow[]> {
  const supabase = await createClient();
  let q = supabase.from("document_request_details").select("*").order("created_at", { ascending: false }).limit(limit);
  if (studentIds) q = q.in("student_id", studentIds);
  if (status === "open") q = q.in("status", ["requested", "payment_pending", "paid", "under_review", "approved"]);
  else if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) fail("document requests", error);
  return (data ?? []).map((r) => ({
    id: r.id ?? "",
    studentId: r.student_id ?? "",
    studentName: [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ") || "Unknown student",
    admissionNumber: r.admission_number,
    typeId: r.document_type_id ?? "",
    typeCode: r.type_code ?? "",
    typeName: r.type_name ?? "Document",
    feeAmount: num(r.fee_amount),
    typeCurrency: r.type_currency,
    requiresPayment: !!r.requires_payment,
    requiresClearance: !!r.requires_clearance,
    requiresApproval: !!r.requires_approval,
    allowOverride: !!r.allow_override,
    status: (r.status ?? "requested") as DocumentStatus,
    note: r.note,
    reviewDecision: r.review_decision,
    reviewNote: r.review_note,
    overrideReason: r.override_reason,
    cancelledReason: r.cancelled_reason,
    invoiceId: r.invoice_id,
    invoiceNumber: r.invoice_number,
    invoiceStatus: r.invoice_status,
    invoiceBalanceDue: num(r.invoice_balance_due),
    invoiceCurrency: r.invoice_currency,
    documentId: r.document_id,
    documentNumber: r.document_number,
    documentRevoked: !!r.document_revoked_at,
    createdAt: r.created_at ?? "",
  }));
}

export interface Clearance {
  cleared: boolean;
  holds: { currency: string; balance: number }[];
}

/** Financial standing of one student (family and school staff only; the database refuses anyone else). */
export async function getClearance(studentId: string): Promise<Clearance | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("student_clearance", { p_student_id: studentId });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const o = data as { cleared?: boolean; holds?: { currency: string; balance: number }[] };
  return { cleared: !!o.cleared, holds: (o.holds ?? []).map((h) => ({ currency: h.currency, balance: num(h.balance) })) };
}

export interface IssuedDocument {
  id: string;
  requestId: string;
  documentNumber: string;
  verificationToken: string;
  issuedAt: string;
  revoked: boolean;
  revokeReason: string | null;
  payload: DocumentPayload;
  typeName: string;
  typeCode: string;
}

export interface TranscriptRecord {
  academic_year: string;
  term: string;
  class: string;
  average: number | null;
  rank: number | null;
  class_size: number | null;
  data?: { subjects?: { name: string; semesterAverage: number | null }[]; promotion?: string | null } | null;
}

export interface DocumentPayload {
  document_type: string;
  code: string;
  school: { name: string; code: string };
  student: { name: string; admission_number: string | null; date_of_birth: string | null; gender: string | null; admission_date: string | null };
  class: string | null;
  academic_year: string | null;
  records: TranscriptRecord[];
  financial_standing: { cleared: boolean; holds: { currency: string; balance: number }[] };
}

export async function getIssuedDocument(id: string): Promise<IssuedDocument | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("issued_documents")
    .select("id, request_id, document_number, verification_token, issued_at, revoked_at, revoke_reason, payload, document_type_id")
    .eq("id", id)
    .maybeSingle();
  if (error) fail("document", error);
  if (!data) return null;
  const { data: type } = await supabase.from("document_types").select("name, code").eq("id", data.document_type_id).maybeSingle();
  return {
    id: data.id,
    requestId: data.request_id,
    documentNumber: data.document_number,
    verificationToken: data.verification_token,
    issuedAt: data.issued_at,
    revoked: !!data.revoked_at,
    revokeReason: data.revoke_reason,
    payload: data.payload as unknown as DocumentPayload,
    typeName: type?.name ?? "Document",
    typeCode: type?.code ?? "",
  };
}

export type { Json };
