import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";

/**
 * "My fees" reads for students and parents.
 *
 * Everything runs as the signed-in person, so row-level security decides what
 * comes back: a student sees their own account, a parent sees only linked
 * children, and nobody sees drafts or payments that haven't been posted.
 * Balances are never computed here — they come from the database views over
 * the ledger. This module is read-only.
 *
 * Names are passed in by the caller (from the guardian links); the finance
 * student directory is for finance staff only and is deliberately not used.
 */

export interface FamilyBalance {
  currency: string;
  totalCharges: number;
  totalPaid: number;
  /** Discounts, scholarships and waivers granted. */
  totalAdjustments: number;
  totalRefunded: number;
  /** Positive: still owed. Zero: settled. Negative: the school holds a credit. */
  balance: number;
}

export interface FamilyInvoiceItem {
  id: string;
  description: string;
  amount: number;
}

export interface FamilyInstallment {
  seq: number;
  dueDate: string;
  amount: number;
  paid: number;
  /** paid | partial | upcoming | overdue */
  status: string;
}

export interface FamilyInvoice {
  invoiceId: string;
  invoiceNumber: string | null;
  currency: string;
  displayStatus: string;
  issueDate: string | null;
  dueDate: string;
  totalAmount: number;
  amountPaid: number;
  /** Discounts, scholarships and waivers applied to this invoice. */
  adjustmentsTotal: number;
  balanceDue: number;
  items: FamilyInvoiceItem[];
  /** The active payment plan's instalments, if the school agreed one. */
  installments: FamilyInstallment[];
}

export interface FamilyPayment {
  id: string;
  paidOn: string;
  method: Enums<"payment_method">;
  reference: string | null;
  currency: string;
  amount: number;
  status: Enums<"payment_status">;
  invoiceNumber: string | null;
  receiptId: string | null;
  receiptNumber: string | null;
}

export interface FamilyAccount {
  studentId: string;
  name: string;
  balances: FamilyBalance[];
  invoices: FamilyInvoice[];
  payments: FamilyPayment[];
}

function fail(scope: string, error: { code?: string } | null): never {
  console.error(`[my-fees] ${scope} failed`, error?.code ?? "unknown");
  throw new Error(`Unable to load ${scope}`);
}

const num = (v: number | string | null | undefined) => Number(v ?? 0);

/** Group rows by a key, keeping order. */
function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

/**
 * The fee accounts of the given people (a student themself, or a parent's
 * linked children). The caller must already have decided who the viewer may
 * ask about; RLS is the second lock behind that.
 */
export async function getFamilyAccounts(people: { id: string; name: string }[]): Promise<FamilyAccount[]> {
  const ids = [...new Set(people.map((p) => p.id))];
  if (ids.length === 0) return [];

  const supabase = await createClient();
  const [bal, inv, pay, inst] = await Promise.all([
    supabase.from("student_balances").select("student_id, currency, total_charges, total_paid, balance, total_adjustments, total_refunded").in("student_id", ids).order("currency"),
    supabase
      .from("invoice_balances")
      .select("invoice_id, invoice_number, student_id, currency, due_date, total_amount, amount_paid, balance_due, display_status, adjustments_total")
      .in("student_id", ids)
      .order("due_date", { ascending: false })
      .limit(500),
    supabase
      .from("payments")
      .select("id, student_id, invoice_id, paid_on, method, reference, currency, amount, status, created_at")
      .in("student_id", ids)
      .order("paid_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("plan_installment_status")
      .select("invoice_id, seq, due_date, amount, paid, status")
      .in("student_id", ids)
      .neq("status", "inactive")
      .order("seq")
      .limit(2000),
  ]);
  for (const r of [bal, inv, pay, inst]) if (r.error) fail("fees", r.error);

  const invoiceRows = inv.data ?? [];
  const paymentRows = pay.data ?? [];
  const invoiceIds = invoiceRows.map((i) => i.invoice_id).filter((v): v is string => !!v);
  const paymentIds = paymentRows.map((p) => p.id);

  const [issued, items, receipts] = await Promise.all([
    invoiceIds.length
      ? supabase.from("invoices").select("id, issue_date").in("id", invoiceIds)
      : Promise.resolve({ data: [] as { id: string; issue_date: string | null }[], error: null }),
    invoiceIds.length
      ? supabase.from("invoice_items").select("id, invoice_id, description, amount").in("invoice_id", invoiceIds).order("created_at").order("id")
      : Promise.resolve({ data: [] as { id: string; invoice_id: string; description: string; amount: number }[], error: null }),
    paymentIds.length
      ? supabase.from("receipts").select("id, payment_id, receipt_number").in("payment_id", paymentIds)
      : Promise.resolve({ data: [] as { id: string; payment_id: string; receipt_number: string }[], error: null }),
  ]);
  for (const r of [issued, items, receipts]) if (r.error) fail("fees", r.error);

  const issueDate = new Map((issued.data ?? []).map((i) => [i.id, i.issue_date]));
  const itemsByInvoice = groupBy(items.data ?? [], (i) => i.invoice_id);
  const receiptByPayment = new Map((receipts.data ?? []).map((r) => [r.payment_id, r]));
  const invoiceNumber = new Map(invoiceRows.map((i) => [i.invoice_id ?? "", i.invoice_number]));

  const installmentsByInvoice = groupBy(inst.data ?? [], (r) => r.invoice_id ?? "");
  const balancesByStudent = groupBy(bal.data ?? [], (b) => b.student_id ?? "");
  const invoicesByStudent = groupBy(invoiceRows, (i) => i.student_id ?? "");
  const paymentsByStudent = groupBy(paymentRows, (p) => p.student_id);

  return people.map((person) => ({
    studentId: person.id,
    name: person.name,
    balances: (balancesByStudent.get(person.id) ?? []).map((b) => ({
      currency: b.currency ?? "USD",
      totalCharges: num(b.total_charges),
      totalPaid: num(b.total_paid),
      totalAdjustments: num(b.total_adjustments),
      totalRefunded: num(b.total_refunded),
      balance: num(b.balance),
    })),
    invoices: (invoicesByStudent.get(person.id) ?? []).map((i) => ({
      invoiceId: i.invoice_id ?? "",
      invoiceNumber: i.invoice_number,
      currency: i.currency ?? "USD",
      displayStatus: i.display_status ?? "",
      issueDate: issueDate.get(i.invoice_id ?? "") ?? null,
      dueDate: i.due_date ?? "",
      totalAmount: num(i.total_amount),
      amountPaid: num(i.amount_paid),
      adjustmentsTotal: num(i.adjustments_total),
      balanceDue: num(i.balance_due),
      items: (itemsByInvoice.get(i.invoice_id ?? "") ?? []).map((it) => ({ id: it.id, description: it.description, amount: num(it.amount) })),
      installments: (installmentsByInvoice.get(i.invoice_id ?? "") ?? []).map((r) => ({
        seq: r.seq ?? 0,
        dueDate: r.due_date ?? "",
        amount: num(r.amount),
        paid: num(r.paid),
        status: r.status ?? "upcoming",
      })),
    })),
    payments: (paymentsByStudent.get(person.id) ?? []).map((p) => ({
      id: p.id,
      paidOn: p.paid_on,
      method: p.method,
      reference: p.reference,
      currency: p.currency,
      amount: num(p.amount),
      status: p.status,
      invoiceNumber: p.invoice_id ? (invoiceNumber.get(p.invoice_id) ?? null) : null,
      receiptId: receiptByPayment.get(p.id)?.id ?? null,
      receiptNumber: receiptByPayment.get(p.id)?.receipt_number ?? null,
    })),
  }));
}
