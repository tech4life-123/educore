import type { Enums } from "@/types/database";

export type DocumentStatus = Enums<"document_request_status">;

export const DOC_STATUS_LABEL: Record<DocumentStatus, string> = {
  requested: "Requested",
  payment_pending: "Payment needed",
  paid: "Paid",
  under_review: "Waiting for approval",
  approved: "Ready to generate",
  generated: "Ready",
  printed: "Printed",
  delivered: "Delivered",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const DOC_STATUS_TONE: Record<DocumentStatus, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  requested: "neutral",
  payment_pending: "warning",
  paid: "brand",
  under_review: "warning",
  approved: "brand",
  generated: "success",
  printed: "success",
  delivered: "success",
  rejected: "danger",
  cancelled: "neutral",
};

/** Statuses where the request is still moving (can be reviewed, cancelled or generated). */
export const OPEN_STATUSES: readonly DocumentStatus[] = ["requested", "payment_pending", "paid", "under_review", "approved"];

/**
 * The database raises coded messages for the document gates; turn them into
 * words a clerk or parent can act on.
 */
export function documentErrorMessage(error: { code?: string; message?: string } | null | undefined, fallback: string): string {
  const m = error?.message ?? "";
  if (m.startsWith("PAYMENT_REQUIRED")) return "Payment required: the document fee hasn’t been paid yet.";
  if (m.startsWith("FINANCIAL_CLEARANCE_REQUIRED")) return "Financial clearance required: the student still owes the school money.";
  if (m.startsWith("APPROVAL_REQUIRED")) return "This document needs to be approved first.";
  if (m.startsWith("OVERRIDE_REASON_REQUIRED")) return "Give the reason for overriding the requirement.";
  switch (error?.code) {
    case "23505":
      return "There is already an open request for this document.";
    case "42501":
      return "You don’t have permission to do that.";
    case "22023":
      return m && m.length < 200 ? m : fallback;
    default:
      return fallback;
  }
}
