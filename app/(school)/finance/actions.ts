"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyDbError, type ActionState } from "@/lib/action-state";
import { isCurrency, parseAmount, type FeeType, type PaymentMethod } from "@/lib/finance";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/services/auth";

/**
 * Finance server actions. Each one only validates the shape of the input and
 * forwards it to a finance_* database function, which re-checks the caller's
 * role, derives the school from their profile, and enforces every business
 * rule (status changes, overpayment, duplicates…). Nothing here decides
 * whether money is real.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const METHODS = new Set<PaymentMethod>(["bank", "cash", "orange_money", "mtn_momo", "other"]);
const FEE_TYPES = new Set<FeeType>([
  "registration", "tuition", "examination", "laboratory", "library", "sports", "technology",
  "transportation", "boarding", "graduation", "transcript", "certificate", "id_card", "other",
]);

const str = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const err = (message: string): ActionState => ({ status: "error", message });

async function guard() {
  await requireCapability("finance.manage", "/finance");
  return createClient();
}

// ---------------------------------------------------------------- invoices

export interface InvoiceFormState extends ActionState {
  values?: Record<string, string>;
}

export async function createInvoiceAction(_prev: InvoiceFormState, formData: FormData): Promise<InvoiceFormState> {
  const supabase = await guard();
  const values: Record<string, string> = {};
  for (const k of ["student_id", "academic_year_id", "term_id", "currency", "due_date", "notes"]) values[k] = str(formData, k);

  if (!UUID.test(values.student_id)) return { ...err("Choose the student."), values };
  if (!UUID.test(values.academic_year_id)) return { ...err("Choose the academic year."), values };
  if (values.term_id && !UUID.test(values.term_id)) return { ...err("Choose a valid term."), values };
  if (!isCurrency(values.currency)) return { ...err("Choose USD or LRD."), values };
  if (!DATE.test(values.due_date)) return { ...err("Enter the due date."), values };

  const types = formData.getAll("line_type").map(String);
  const descriptions = formData.getAll("line_description").map((v) => String(v).trim());
  const amounts = formData.getAll("line_amount").map((v) => String(v).trim());
  const items: { fee_type: FeeType; description: string; amount: number; fee_item_id?: string }[] = [];
  const feeItemIds = formData.getAll("line_fee_item_id").map(String);
  for (let i = 0; i < amounts.length; i++) {
    if (!amounts[i]) continue; // blank row
    const amount = parseAmount(amounts[i]);
    if (amount === null) return { ...err(`Line ${i + 1}: enter an amount above zero with at most 2 decimals.`), values };
    const type = types[i] as FeeType;
    if (!FEE_TYPES.has(type)) return { ...err(`Line ${i + 1}: choose a fee type.`), values };
    items.push({
      fee_type: type,
      description: descriptions[i] ?? "",
      amount,
      ...(feeItemIds[i] && UUID.test(feeItemIds[i]) ? { fee_item_id: feeItemIds[i] } : {}),
    });
  }
  if (items.length === 0) return { ...err("Add at least one fee line with an amount."), values };

  const { data, error } = await supabase.rpc("finance_create_invoice", {
    p_student_id: values.student_id,
    p_guardian_id: null as unknown as string,
    p_academic_year_id: values.academic_year_id,
    p_term_id: (values.term_id || null) as unknown as string,
    p_currency: values.currency,
    p_due_date: values.due_date,
    p_notes: values.notes,
    p_items: items,
  });
  if (error || !data) return { ...err(friendlyDbError(error, "The invoice couldn’t be created.")), values };
  revalidatePath("/finance", "layout");
  redirect(`/finance/invoices/${data}?created=1`);
}

export async function issueInvoiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await guard();
  const id = str(formData, "invoice_id");
  if (!UUID.test(id)) return err("Invoice not found.");
  const { data, error } = await supabase.rpc("finance_issue_invoice", { p_invoice_id: id });
  if (error) return err(friendlyDbError(error, "The invoice couldn’t be issued."));
  revalidatePath("/finance", "layout");
  return { status: "success", message: `Issued as ${data}.` };
}

export async function cancelInvoiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await guard();
  const id = str(formData, "invoice_id");
  const reason = str(formData, "reason");
  if (!UUID.test(id)) return err("Invoice not found.");
  if (reason.length < 3) return err("Give a reason (at least 3 characters).");
  const { error } = await supabase.rpc("finance_cancel_invoice", { p_invoice_id: id, p_reason: reason });
  if (error) return err(friendlyDbError(error, "The invoice couldn’t be cancelled."));
  revalidatePath("/finance", "layout");
  return { status: "success", message: "Invoice cancelled. Its charges were reversed in the ledger." };
}

// ---------------------------------------------------------------- payments

export interface PaymentFormState extends ActionState {
  values?: Record<string, string>;
}

export async function recordPaymentAction(_prev: PaymentFormState, formData: FormData): Promise<PaymentFormState> {
  const supabase = await guard();
  const values: Record<string, string> = {};
  for (const k of ["student_id", "invoice_id", "amount", "currency", "method", "reference", "paid_on", "payer_name", "explanation", "transaction_id"]) {
    values[k] = str(formData, k);
  }
  const key = str(formData, "idempotency_key");

  if (!UUID.test(values.student_id)) return { ...err("Choose the student."), values };
  if (values.invoice_id && !UUID.test(values.invoice_id)) return { ...err("Choose a valid invoice."), values };
  const amount = parseAmount(values.amount);
  if (amount === null) return { ...err("Enter the amount (above zero, at most 2 decimals)."), values };
  if (!isCurrency(values.currency)) return { ...err("Choose USD or LRD."), values };
  if (!METHODS.has(values.method as PaymentMethod)) return { ...err("Choose how it was paid."), values };
  if (!values.reference) return { ...err("Enter the receipt, deposit slip or transaction reference."), values };
  if (!DATE.test(values.paid_on)) return { ...err("Enter the date the payment was made."), values };
  if ((values.method === "cash" || values.method === "other") && !values.explanation) {
    return { ...err("Explain this payment — it is required for cash and other manual payments."), values };
  }

  const { data, error } = await supabase.rpc("finance_record_payment", {
    p_student_id: values.student_id,
    p_invoice_id: (values.invoice_id || null) as unknown as string,
    p_amount: amount,
    p_currency: values.currency,
    p_method: values.method as PaymentMethod,
    p_reference: values.reference,
    p_transaction_id: values.transaction_id,
    p_paid_on: values.paid_on,
    p_payer_name: values.payer_name,
    p_explanation: values.explanation,
    p_idempotency_key: key.length >= 8 ? key : (null as unknown as string),
  });
  if (error || !data) {
    const duplicate = error?.code === "23505";
    return {
      ...err(duplicate ? "A payment with this method and reference is already recorded." : friendlyDbError(error, "The payment couldn’t be recorded.")),
      values,
    };
  }
  revalidatePath("/finance", "layout");
  redirect(`/finance/payments?recorded=${data}`);
}

export async function confirmPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await guard();
  const id = str(formData, "payment_id");
  if (!UUID.test(id)) return err("Payment not found.");
  const { error } = await supabase.rpc("finance_confirm_payment", { p_payment_id: id });
  if (error) return err(friendlyDbError(error, "The payment couldn’t be confirmed."));
  revalidatePath("/finance", "layout");
  return { status: "success", message: "Confirmed and posted to the student’s account." };
}

export async function rejectPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await guard();
  const id = str(formData, "payment_id");
  const reason = str(formData, "reason");
  if (!UUID.test(id)) return err("Payment not found.");
  if (reason.length < 3) return err("Give a reason (at least 3 characters).");
  const { error } = await supabase.rpc("finance_reject_payment", { p_payment_id: id, p_reason: reason });
  if (error) return err(friendlyDbError(error, "The payment couldn’t be rejected."));
  revalidatePath("/finance", "layout");
  return { status: "success", message: "Payment rejected." };
}

export async function reversePaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await guard();
  const id = str(formData, "payment_id");
  const reason = str(formData, "reason");
  if (!UUID.test(id)) return err("Payment not found.");
  if (reason.length < 3) return err("Give a reason (at least 3 characters).");
  const { error } = await supabase.rpc("finance_reverse_payment", { p_payment_id: id, p_reason: reason });
  if (error) return err(friendlyDbError(error, "The payment couldn’t be reversed."));
  revalidatePath("/finance", "layout");
  return { status: "success", message: "Payment reversed. An offsetting entry was added to the ledger." };
}

// ------------------------------------- discounts, scholarships, refunds (admin)
// Only the school administrator may reduce what a family owes or give money
// back; the database enforces the same rule, so this is just the early exit.

const ADJUSTMENT_KINDS = new Set(["discount", "scholarship", "waiver"]);

async function adminGuard() {
  await requireCapability("school.manage", "/finance");
  return createClient();
}

export async function applyAdjustmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await adminGuard();
  const id = str(formData, "invoice_id");
  const kind = str(formData, "kind");
  const reason = str(formData, "reason");
  const amount = parseAmount(str(formData, "amount"));
  if (!UUID.test(id)) return err("Invoice not found.");
  if (!ADJUSTMENT_KINDS.has(kind)) return err("Choose discount, scholarship or waiver.");
  if (amount === null || amount <= 0) return err("Enter an amount greater than zero (at most 2 decimals).");
  if (reason.length < 3) return err("Give a reason (at least 3 characters).");
  const { error } = await supabase.rpc("finance_apply_adjustment", { p_invoice_id: id, p_kind: kind, p_amount: amount, p_reason: reason });
  if (error) return err(friendlyDbError(error, "The adjustment couldn’t be applied."));
  revalidatePath("/finance", "layout");
  revalidatePath("/my-fees");
  return { status: "success", message: "Applied. The family’s balance was reduced." };
}

export async function voidAdjustmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await adminGuard();
  const id = str(formData, "adjustment_id");
  const reason = str(formData, "reason");
  if (!UUID.test(id)) return err("Adjustment not found.");
  if (reason.length < 3) return err("Give a reason (at least 3 characters).");
  const { error } = await supabase.rpc("finance_void_adjustment", { p_adjustment_id: id, p_reason: reason });
  if (error) return err(friendlyDbError(error, "The adjustment couldn’t be voided."));
  revalidatePath("/finance", "layout");
  revalidatePath("/my-fees");
  return { status: "success", message: "Voided. The amount is owed again." };
}

export async function refundPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await adminGuard();
  const id = str(formData, "payment_id");
  const method = str(formData, "method") as PaymentMethod;
  const reason = str(formData, "reason");
  const reference = str(formData, "reference");
  const amount = parseAmount(str(formData, "amount"));
  if (!UUID.test(id)) return err("Payment not found.");
  if (!METHODS.has(method)) return err("Choose how the money was returned.");
  if (amount === null || amount <= 0) return err("Enter an amount greater than zero (at most 2 decimals).");
  if (reason.length < 3) return err("Give a reason (at least 3 characters).");
  const { error } = await supabase.rpc("finance_refund_payment", {
    p_payment_id: id,
    p_amount: amount,
    p_method: method,
    p_reference: reference || (null as unknown as string),
    p_reason: reason,
    p_date: null as unknown as string,
  });
  if (error) return err(friendlyDbError(error, "The refund couldn’t be recorded."));
  revalidatePath("/finance", "layout");
  revalidatePath("/my-fees");
  return { status: "success", message: "Refund recorded. Hand over the money and keep the reference." };
}

// -------------------------------------------------- fee configuration (admin)

export async function createFeeStructureAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await guard();
  const name = str(formData, "name").replace(/\s+/g, " ");
  const yearId = str(formData, "academic_year_id");
  const termId = str(formData, "term_id");
  const currency = str(formData, "currency");
  if (name.length < 1 || name.length > 120) return err("Give the fee structure a name.");
  if (!UUID.test(yearId)) return err("Choose the academic year.");
  if (termId && !UUID.test(termId)) return err("Choose a valid term.");
  if (!isCurrency(currency)) return err("Choose USD or LRD.");
  const schoolId = await mySchoolId(supabase);
  if (!schoolId) return err("Your school couldn’t be determined.");
  const { error } = await supabase.from("fee_structures").insert({
    school_id: schoolId,
    name,
    academic_year_id: yearId,
    term_id: termId || null,
    currency,
  });
  if (error) return err(friendlyDbError(error, "The fee structure couldn’t be created."));
  revalidatePath("/finance/fees");
  return { status: "success", message: "Fee structure created. Add its fee items below." };
}

export async function addFeeItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await guard();
  const structureId = str(formData, "fee_structure_id");
  const type = str(formData, "fee_type") as FeeType;
  const description = str(formData, "description");
  const amount = parseAmount(str(formData, "amount"));
  if (!UUID.test(structureId)) return err("Fee structure not found.");
  if (!FEE_TYPES.has(type)) return err("Choose a fee type.");
  if (amount === null) return err("Enter the amount (above zero, at most 2 decimals).");
  const schoolId = await mySchoolId(supabase);
  if (!schoolId) return err("Your school couldn’t be determined.");
  const { error } = await supabase.from("fee_items").insert({
    school_id: schoolId,
    fee_structure_id: structureId,
    fee_type: type,
    description: description || null,
    amount,
  });
  if (error) return err(friendlyDbError(error, "The fee item couldn’t be added."));
  revalidatePath("/finance/fees");
  return { status: "success", message: "Fee item added." };
}

export async function removeFeeItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await guard();
  const id = str(formData, "fee_item_id");
  if (!UUID.test(id)) return err("Fee item not found.");
  const { error } = await supabase.from("fee_items").delete().eq("id", id);
  // Items already used on an invoice are protected by a foreign key.
  if (error) return err(friendlyDbError(error, "The fee item couldn’t be removed."));
  revalidatePath("/finance/fees");
  return { status: "success", message: "Fee item removed." };
}

export async function updateFinanceSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await guard();
  const currency = str(formData, "default_currency");
  const prefix = str(formData, "invoice_prefix").toUpperCase();
  if (!isCurrency(currency)) return err("Choose USD or LRD.");
  if (!/^[A-Z0-9]{2,8}$/.test(prefix)) return err("The invoice prefix is 2–8 letters or digits, e.g. INV.");
  const schoolId = await mySchoolId(supabase);
  if (!schoolId) return err("Your school couldn’t be determined.");
  const { data, error } = await supabase
    .from("finance_settings")
    .update({ default_currency: currency, invoice_prefix: prefix })
    .eq("school_id", schoolId)
    .select("school_id");
  if (error) return err(friendlyDbError(error, "The settings couldn’t be saved."));
  if (!data || data.length === 0) return err("Only a school administrator can change these settings.");
  revalidatePath("/finance", "layout");
  return { status: "success", message: "Settings saved. They apply to new invoices only." };
}

async function mySchoolId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const { data } = await supabase.from("finance_settings").select("school_id").maybeSingle();
  return data?.school_id ?? null;
}

// ----------------------------------------------------------- reconciliation

const TX_METHODS = new Set<PaymentMethod>(["bank", "orange_money", "mtn_momo", "other"]);

export async function logTransactionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await guard();
  const method = str(formData, "method") as PaymentMethod;
  const currency = str(formData, "currency");
  const reference = str(formData, "reference");
  const date = str(formData, "transaction_date");
  const amount = parseAmount(str(formData, "amount"));
  if (!TX_METHODS.has(method)) return err("Choose where the money arrived (bank or mobile money).");
  if (amount === null) return err("Enter the amount (above zero, at most 2 decimals).");
  if (!isCurrency(currency)) return err("Choose USD or LRD.");
  if (!reference) return err("Enter the bank or mobile-money reference.");
  if (!DATE.test(date)) return err("Enter the date on the statement.");

  const { error } = await supabase.rpc("finance_log_transaction", {
    p_method: method,
    p_amount: amount,
    p_currency: currency,
    p_reference: reference,
    p_date: date,
    p_payer_name: str(formData, "payer_name"),
    p_payer_phone: str(formData, "payer_phone"),
    p_notes: str(formData, "notes"),
  });
  if (error) {
    return err(error.code === "23505" ? "This reference is already logged for that method." : friendlyDbError(error, "The transaction couldn’t be logged."));
  }
  revalidatePath("/finance", "layout");
  return { status: "success", message: "Transaction logged. Match it to a payment or assign it to a student below." };
}

export async function matchTransactionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await guard();
  const tx = str(formData, "transaction_id");
  const payment = str(formData, "payment_id");
  if (!UUID.test(tx) || !UUID.test(payment)) return err("Choose a transaction and a payment.");
  const { error } = await supabase.rpc("finance_match_transaction", { p_transaction_id: tx, p_payment_id: payment });
  if (error) return err(friendlyDbError(error, "The match couldn’t be made."));
  revalidatePath("/finance", "layout");
  return { status: "success", message: "Matched. The payment is confirmed and posted to the student’s account." };
}

export async function rejectTransactionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await guard();
  const tx = str(formData, "transaction_id");
  const reason = str(formData, "reason");
  if (!UUID.test(tx)) return err("Choose a transaction.");
  if (reason.length < 3) return err("Give a short reason.");
  const { error } = await supabase.rpc("finance_reject_transaction", { p_transaction_id: tx, p_reason: reason });
  if (error) return err(friendlyDbError(error, "The transaction couldn’t be rejected."));
  revalidatePath("/finance", "layout");
  return { status: "success", message: "Rejected." };
}

export async function assignTransactionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await guard();
  const tx = str(formData, "transaction_id");
  const student = str(formData, "student_id");
  const invoice = str(formData, "invoice_id");
  if (!UUID.test(tx)) return err("Choose a transaction.");
  if (!UUID.test(student)) return err("Choose the student.");
  if (invoice && !UUID.test(invoice)) return err("Choose a valid invoice.");
  const { error } = await supabase.rpc("finance_assign_transaction", {
    p_transaction_id: tx,
    p_student_id: student,
    p_invoice_id: (invoice || null) as unknown as string,
    p_note: str(formData, "note"),
  });
  if (error) return err(friendlyDbError(error, "The transaction couldn’t be assigned."));
  redirect("/finance/reconciliation?assigned=1");
}
