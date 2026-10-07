import type { Enums } from "@/types/database";

/**
 * Finance display helpers. Amounts are plain numbers in the invoice's own
 * currency — nothing here ever converts between currencies.
 */

export type Currency = "USD" | "LRD";
export type PaymentStatus = Enums<"payment_status">;
export type PaymentMethod = Enums<"payment_method">;
export type FeeType = Enums<"fee_type">;

export const CURRENCIES: readonly Currency[] = ["USD", "LRD"];

export function isCurrency(value: unknown): value is Currency {
  return value === "USD" || value === "LRD";
}

/** 1234.5 → "$1,234.50" (USD) or "L$1,234.50" (LRD). */
export function formatMoney(amount: number | string | null | undefined, currency: string): string {
  const n = Number(amount ?? 0);
  const body = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const symbol = currency === "LRD" ? "L$" : currency === "USD" ? "$" : `${currency} `;
  return `${n < 0 ? "-" : ""}${symbol}${body}`;
}

/** Parse "1,250.50" style input into a number with at most 2 decimals, or null. */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n > 0 && n <= 10_000_000 ? n : null;
}

export const FEE_TYPE_LABEL: Record<FeeType, string> = {
  registration: "Registration",
  tuition: "Tuition",
  examination: "Examination",
  laboratory: "Laboratory",
  library: "Library",
  sports: "Sports",
  technology: "Technology",
  transportation: "Transportation",
  boarding: "Boarding",
  graduation: "Graduation",
  transcript: "Transcript",
  certificate: "Certificate",
  id_card: "ID card",
  other: "Other",
};

export const FEE_TYPE_OPTIONS = (Object.keys(FEE_TYPE_LABEL) as FeeType[]).map((value) => ({ value, label: FEE_TYPE_LABEL[value] }));

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  bank: "Bank deposit / transfer",
  orange_money: "Orange Money",
  mtn_momo: "MTN MoMo",
  cash: "Cash",
  other: "Other",
};

/** Methods an officer may record by hand in Phase 2. */
export const MANUAL_METHOD_OPTIONS: ReadonlyArray<{ value: PaymentMethod; label: string }> = [
  { value: "bank", label: METHOD_LABEL.bank },
  { value: "cash", label: METHOD_LABEL.cash },
  { value: "orange_money", label: `${METHOD_LABEL.orange_money} (manual entry)` },
  { value: "mtn_momo", label: `${METHOD_LABEL.mtn_momo} (manual entry)` },
  { value: "other", label: METHOD_LABEL.other },
];

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  confirmed: "Confirmed",
  reconciled: "Reconciled",
  posted: "Posted",
  failed: "Failed",
  rejected: "Rejected",
  reversed: "Reversed",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  pending: "warning",
  processing: "warning",
  confirmed: "brand",
  reconciled: "brand",
  posted: "success",
  failed: "danger",
  rejected: "danger",
  reversed: "danger",
  refunded: "neutral",
  cancelled: "neutral",
};

export const INVOICE_DISPLAY_LABEL: Record<string, string> = {
  draft: "Draft",
  issued: "Issued",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

export const INVOICE_DISPLAY_TONE: Record<string, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  issued: "brand",
  partially_paid: "warning",
  paid: "success",
  overdue: "danger",
  cancelled: "neutral",
};
