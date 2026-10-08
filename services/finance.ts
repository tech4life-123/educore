import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

/**
 * Finance reads. Everything runs as the signed-in user, so RLS decides what
 * comes back: finance staff see their school's records; nobody else sees
 * more than their own. Balances are never computed here — they come from the
 * database views over the ledger.
 *
 * All writes live in the finance_* database functions (see the server
 * actions); this module is read-only.
 */

export type FinanceSettings = Pick<Tables<"finance_settings">, "school_id" | "default_currency" | "invoice_prefix">;
export type PaymentRow = Tables<"payments">;
export type InvoiceItemRow = Tables<"invoice_items">;
export type LedgerEntryRow = Tables<"student_account_entries">;
export type AdjustmentRow = Tables<"invoice_adjustments">;
export type RefundRow = Tables<"payment_refunds">;
export type PlanRow = Tables<"payment_plans">;
export interface InstallmentRow {
  installmentId: string;
  seq: number;
  dueDate: string;
  amount: number;
  paid: number;
  remaining: number;
  /** paid | partial | upcoming | overdue | inactive */
  status: string;
}

export interface StudentRef {
  studentId: string;
  name: string;
  admissionNumber: string | null;
  status: string;
}

export interface InvoiceListRow {
  invoiceId: string;
  invoiceNumber: string | null;
  studentId: string;
  studentName: string;
  currency: string;
  status: string;
  displayStatus: string;
  dueDate: string;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
}

export interface PaymentListRow extends PaymentRow {
  studentName: string;
  invoiceNumber: string | null;
  /** Receipt issued when the payment was posted (kept even if the payment is later reversed). */
  receiptId: string | null;
}

function fail(scope: string, error: { code?: string } | null): never {
  console.error(`[finance] ${scope} failed`, error?.code ?? "unknown");
  throw new Error(`Unable to load ${scope}`);
}

const num = (v: number | string | null | undefined) => Number(v ?? 0);

function displayName(r: { first_name: string | null; middle_name: string | null; last_name: string | null }): string {
  return [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ") || "Unknown";
}

export const getFinanceSettings = cache(async (): Promise<FinanceSettings | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("finance_settings").select("school_id, default_currency, invoice_prefix").maybeSingle();
  if (error) fail("finance settings", error);
  return data;
});

/** Students of the caller's school (name + admission number only). */
export async function searchFinanceStudents(search?: string, limit = 50): Promise<StudentRef[]> {
  const supabase = await createClient();
  let q = supabase
    .from("finance_students")
    .select("student_id, first_name, middle_name, last_name, admission_number, status")
    .order("last_name")
    .order("first_name")
    .limit(limit);
  const term = search?.trim().replace(/[%,()]/g, " ").slice(0, 60);
  if (term) {
    q = q.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,admission_number.ilike.%${term}%`);
  }
  const { data, error } = await q;
  if (error) fail("students", error);
  return (data ?? []).map((r) => ({
    studentId: r.student_id ?? "",
    name: displayName(r),
    admissionNumber: r.admission_number,
    status: String(r.status ?? ""),
  }));
}

async function studentMap(ids: string[]): Promise<Map<string, StudentRef>> {
  const unique = [...new Set(ids)].filter(Boolean);
  const map = new Map<string, StudentRef>();
  if (unique.length === 0) return map;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("finance_students")
    .select("student_id, first_name, middle_name, last_name, admission_number, status")
    .in("student_id", unique);
  if (error) fail("students", error);
  for (const r of data ?? []) {
    map.set(r.student_id ?? "", {
      studentId: r.student_id ?? "",
      name: displayName(r),
      admissionNumber: r.admission_number,
      status: String(r.status ?? ""),
    });
  }
  return map;
}

export async function getStudentRef(studentId: string): Promise<StudentRef | null> {
  return (await studentMap([studentId])).get(studentId) ?? null;
}

export async function listInvoices({
  displayStatus,
  studentId,
  limit = 200,
}: { displayStatus?: string; studentId?: string; limit?: number } = {}): Promise<InvoiceListRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("invoice_balances")
    .select("invoice_id, invoice_number, student_id, currency, status, due_date, total_amount, amount_paid, balance_due, display_status")
    .order("due_date", { ascending: false })
    .limit(limit);
  if (displayStatus) q = q.eq("display_status", displayStatus);
  if (studentId) q = q.eq("student_id", studentId);
  const { data, error } = await q;
  if (error) fail("invoices", error);
  const rows = data ?? [];
  const names = await studentMap(rows.map((r) => r.student_id ?? ""));
  return rows.map((r) => ({
    invoiceId: r.invoice_id ?? "",
    invoiceNumber: r.invoice_number,
    studentId: r.student_id ?? "",
    studentName: names.get(r.student_id ?? "")?.name ?? "Unknown student",
    currency: r.currency ?? "USD",
    status: String(r.status ?? ""),
    displayStatus: r.display_status ?? "",
    dueDate: r.due_date ?? "",
    totalAmount: num(r.total_amount),
    amountPaid: num(r.amount_paid),
    balanceDue: num(r.balance_due),
  }));
}

export interface InvoiceDetail {
  invoice: Tables<"invoices">;
  items: InvoiceItemRow[];
  balance: {
    totalAmount: number;
    /** Net of refunds. */
    amountPaid: number;
    balanceDue: number;
    displayStatus: string;
    /** Discounts, scholarships and waivers currently applied. */
    adjustmentsTotal: number;
    amountRefunded: number;
  };
  student: StudentRef | null;
  payments: PaymentRow[];
  adjustments: AdjustmentRow[];
  refunds: RefundRow[];
  /** Plans on this invoice, newest first; the active one (if any) has `status: "active"`. */
  plans: (PlanRow & { installments: InstallmentRow[] })[];
  academicYear: string | null;
  term: string | null;
}

export async function getInvoiceDetail(invoiceId: string): Promise<InvoiceDetail | null> {
  const supabase = await createClient();
  const { data: invoice, error } = await supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (error) fail("invoice", error);
  if (!invoice) return null;

  const [items, bal, pays, year, term, adjs, refs, planRows, instRows] = await Promise.all([
    supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("created_at").order("id"),
    supabase.from("invoice_balances").select("total_amount, amount_paid, balance_due, display_status, adjustments_total, amount_refunded").eq("invoice_id", invoiceId).maybeSingle(),
    supabase.from("payments").select("*").eq("invoice_id", invoiceId).order("created_at", { ascending: false }),
    supabase.from("academic_years").select("name").eq("id", invoice.academic_year_id).maybeSingle(),
    invoice.term_id
      ? supabase.from("academic_terms").select("name").eq("id", invoice.term_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("invoice_adjustments").select("*").eq("invoice_id", invoiceId).order("created_at", { ascending: false }),
    supabase.from("payment_refunds").select("*").eq("invoice_id", invoiceId).order("created_at", { ascending: false }),
    supabase.from("payment_plans").select("*").eq("invoice_id", invoiceId).order("created_at", { ascending: false }),
    supabase.from("plan_installment_status").select("installment_id, plan_id, seq, due_date, amount, paid, remaining, status").eq("invoice_id", invoiceId).order("seq"),
  ]);
  for (const r of [items, bal, pays, year, term, adjs, refs, planRows, instRows]) if (r.error) fail("invoice", r.error);

  return {
    invoice,
    items: items.data ?? [],
    balance: {
      totalAmount: num(bal.data?.total_amount),
      amountPaid: num(bal.data?.amount_paid),
      balanceDue: num(bal.data?.balance_due),
      displayStatus: bal.data?.display_status ?? invoice.status,
      adjustmentsTotal: num(bal.data?.adjustments_total),
      amountRefunded: num(bal.data?.amount_refunded),
    },
    student: await getStudentRef(invoice.student_id),
    payments: pays.data ?? [],
    adjustments: (adjs.data ?? []).map((a) => ({ ...a, amount: num(a.amount) })),
    refunds: (refs.data ?? []).map((r) => ({ ...r, amount: num(r.amount) })),
    plans: (planRows.data ?? []).map((p) => ({
      ...p,
      installments: (instRows.data ?? [])
        .filter((i) => i.plan_id === p.id)
        .map((i) => ({
          installmentId: i.installment_id ?? "",
          seq: i.seq ?? 0,
          dueDate: i.due_date ?? "",
          amount: num(i.amount),
          paid: num(i.paid),
          remaining: num(i.remaining),
          status: i.status ?? "inactive",
        })),
    })),
    academicYear: year.data?.name ?? null,
    term: term.data?.name ?? null,
  };
}

export async function listPayments({
  status,
  studentId,
  limit = 200,
}: { status?: PaymentRow["status"] | "open"; studentId?: string; limit?: number } = {}): Promise<PaymentListRow[]> {
  const supabase = await createClient();
  let q = supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(limit);
  if (status === "open") q = q.in("status", ["pending", "processing"]);
  else if (status) q = q.eq("status", status);
  if (studentId) q = q.eq("student_id", studentId);
  const { data, error } = await q;
  if (error) fail("payments", error);
  const rows = data ?? [];

  const invoiceIds = [...new Set(rows.map((r) => r.invoice_id).filter((v): v is string => !!v))];
  const paymentIds = rows.map((r) => r.id);
  const [names, invs, rcpts] = await Promise.all([
    studentMap(rows.map((r) => r.student_id)),
    invoiceIds.length
      ? supabase.from("invoices").select("id, invoice_number").in("id", invoiceIds)
      : Promise.resolve({ data: [] as { id: string; invoice_number: string | null }[], error: null }),
    paymentIds.length
      ? supabase.from("receipts").select("id, payment_id").in("payment_id", paymentIds)
      : Promise.resolve({ data: [] as { id: string; payment_id: string }[], error: null }),
  ]);
  if (invs.error) fail("payments", invs.error);
  if (rcpts.error) fail("payments", rcpts.error);
  const numbers = new Map((invs.data ?? []).map((i) => [i.id, i.invoice_number]));
  const receiptByPayment = new Map((rcpts.data ?? []).map((r) => [r.payment_id, r.id]));

  return rows.map((r) => ({
    ...r,
    amount: num(r.amount),
    studentName: names.get(r.student_id)?.name ?? "Unknown student",
    invoiceNumber: r.invoice_id ? (numbers.get(r.invoice_id) ?? null) : null,
    receiptId: receiptByPayment.get(r.id) ?? null,
  }));
}

export interface StudentAccount {
  student: StudentRef;
  balances: { currency: string; totalCharges: number; totalPaid: number; balance: number; totalAdjustments: number; totalRefunded: number }[];
  entries: LedgerEntryRow[];
  invoices: InvoiceListRow[];
  payments: PaymentListRow[];
}

export async function getStudentAccount(studentId: string): Promise<StudentAccount | null> {
  const student = await getStudentRef(studentId);
  if (!student) return null;
  const supabase = await createClient();
  const [bal, entries, invoices, payments] = await Promise.all([
    supabase.from("student_balances").select("currency, total_charges, total_paid, balance, total_adjustments, total_refunded").eq("student_id", studentId).order("currency"),
    supabase.from("student_account_entries").select("*").eq("student_id", studentId).order("created_at", { ascending: false }).limit(200),
    listInvoices({ studentId }),
    listPayments({ studentId }),
  ]);
  for (const r of [bal, entries]) if (r.error) fail("student account", r.error);
  return {
    student,
    balances: (bal.data ?? []).map((b) => ({
      currency: b.currency ?? "USD",
      totalCharges: num(b.total_charges),
      totalPaid: num(b.total_paid),
      balance: num(b.balance),
      totalAdjustments: num(b.total_adjustments),
      totalRefunded: num(b.total_refunded),
    })),
    entries: (entries.data ?? []).map((e) => ({ ...e, amount: num(e.amount) })),
    invoices,
    payments,
  };
}

export interface FinanceOverview {
  /** Outstanding (what students owe) and collected, per currency — never mixed. */
  perCurrency: { currency: string; outstanding: number; charged: number; collected: number }[];
  overdueInvoices: number;
  /** Instalments of active payment plans that are past due and unpaid. */
  overdueInstallments: number;
  pendingPayments: PaymentListRow[];
  /** Overdue or due within a week, soonest first — who finance should chase. */
  followUp: { invoiceId: string; invoiceNumber: string | null; studentName: string; installment: number | null; currency: string; dueDate: string; amountDue: number; kind: "overdue" | "due_soon"; daysOverdue: number }[];
  followUpTotal: number;
  pendingCount: number;
  collectedThisMonth: { currency: string; amount: number }[];
}

export async function getFinanceOverview(monthStart: string): Promise<FinanceOverview> {
  const supabase = await createClient();
  const [follow, bal, overdue, pendingCount, month, pending, monthRefunds, lateInstallments] = await Promise.all([
    supabase.from("fee_reminders").select("student_id, invoice_id, invoice_number, seq, currency, due_date, amount_due, kind, days_overdue", { count: "exact" }).order("due_date").limit(8),
    supabase.from("student_balances").select("currency, total_charges, total_paid, balance, total_refunded").limit(10000),
    supabase.from("invoice_balances").select("invoice_id", { count: "exact", head: true }).eq("display_status", "overdue"),
    supabase.from("payments").select("id", { count: "exact", head: true }).in("status", ["pending", "processing"]),
    supabase.from("payments").select("currency, amount").eq("status", "posted").gte("paid_on", monthStart).limit(10000),
    listPayments({ status: "open", limit: 8 }),
    supabase.from("payment_refunds").select("currency, amount").gte("refunded_on", monthStart).limit(10000),
    supabase.from("plan_installment_status").select("installment_id", { count: "exact", head: true }).eq("status", "overdue"),
  ]);
  for (const r of [follow, bal, overdue, pendingCount, month, monthRefunds, lateInstallments]) if (r.error) fail("finance overview", r.error);

  const followNames = await studentMap((follow.data ?? []).map((r) => r.student_id ?? "").filter(Boolean));
  const per = new Map<string, { outstanding: number; charged: number; collected: number }>();
  for (const b of bal.data ?? []) {
    const c = b.currency ?? "USD";
    const cur = per.get(c) ?? { outstanding: 0, charged: 0, collected: 0 };
    cur.outstanding += Math.max(num(b.balance), 0);
    cur.charged += num(b.total_charges);
    cur.collected += num(b.total_paid) - num(b.total_refunded); // net of refunds
    per.set(c, cur);
  }
  const monthly = new Map<string, number>();
  for (const p of month.data ?? []) monthly.set(p.currency, (monthly.get(p.currency) ?? 0) + num(p.amount));
  // Money handed back this month comes off what was collected.
  for (const r of monthRefunds.data ?? []) monthly.set(r.currency, (monthly.get(r.currency) ?? 0) - num(r.amount));

  return {
    perCurrency: [...per.entries()].map(([currency, v]) => ({ currency, ...v })).sort((a, b) => a.currency.localeCompare(b.currency)),
    overdueInvoices: overdue.count ?? 0,
    overdueInstallments: lateInstallments.count ?? 0,
    followUp: (follow.data ?? []).map((r) => ({
      invoiceId: r.invoice_id ?? "",
      invoiceNumber: r.invoice_number,
      studentName: followNames.get(r.student_id ?? "")?.name ?? "Unknown student",
      installment: r.seq,
      currency: r.currency ?? "USD",
      dueDate: r.due_date ?? "",
      amountDue: num(r.amount_due),
      kind: r.kind === "overdue" ? ("overdue" as const) : ("due_soon" as const),
      daysOverdue: Number(r.days_overdue ?? 0),
    })),
    followUpTotal: follow.count ?? 0,
    pendingPayments: pending,
    pendingCount: pendingCount.count ?? 0,
    collectedThisMonth: [...monthly.entries()].map(([currency, amount]) => ({ currency, amount })),
  };
}

export interface FeeStructureRow {
  id: string;
  name: string;
  currency: string;
  isActive: boolean;
  academicYear: string;
  term: string | null;
  items: Tables<"fee_items">[];
}

export async function listFeeStructures(): Promise<FeeStructureRow[]> {
  const supabase = await createClient();
  const [structures, items, years, terms] = await Promise.all([
    supabase.from("fee_structures").select("*").order("created_at", { ascending: false }),
    supabase.from("fee_items").select("*").order("created_at"),
    supabase.from("academic_years").select("id, name"),
    supabase.from("academic_terms").select("id, name"),
  ]);
  for (const r of [structures, items, years, terms]) if (r.error) fail("fee structures", r.error);
  const yearName = new Map((years.data ?? []).map((y) => [y.id, y.name]));
  const termName = new Map((terms.data ?? []).map((t) => [t.id, t.name]));
  return (structures.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    currency: s.currency,
    isActive: s.is_active,
    academicYear: yearName.get(s.academic_year_id) ?? "—",
    term: s.term_id ? (termName.get(s.term_id) ?? null) : null,
    items: (items.data ?? []).filter((i) => i.fee_structure_id === s.id).map((i) => ({ ...i, amount: num(i.amount) })),
  }));
}

// ------------------------------------------------------------------ receipts

export interface ReceiptDetail {
  receipt: Tables<"receipts">;
  student: { name: string; admissionNumber: string | null } | null;
  invoiceNumber: string | null;
  payment: PaymentRow | null;
  officerName: string | null;
  /** The payment still stands (not reversed/refunded). */
  isValid: boolean;
}

/**
 * One receipt. RLS lets finance staff read their school's, and a student or
 * linked parent read their own — the same query serves the portal.
 */
export async function getReceipt(receiptId: string): Promise<ReceiptDetail | null> {
  const supabase = await createClient();
  const { data: receipt, error } = await supabase.from("receipts").select("*").eq("id", receiptId).maybeSingle();
  if (error) fail("receipt", error);
  if (!receipt) return null;

  const [pay, inv, officer, student] = await Promise.all([
    supabase.from("payments").select("*").eq("id", receipt.payment_id).maybeSingle(),
    receipt.invoice_id
      ? supabase.from("invoices").select("invoice_number").eq("id", receipt.invoice_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    receipt.issued_by
      ? supabase.from("profiles").select("first_name, middle_name, last_name").eq("id", receipt.issued_by).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("profiles").select("first_name, middle_name, last_name").eq("id", receipt.student_id).maybeSingle(),
  ]);
  for (const r of [pay, inv, officer, student]) if (r.error) fail("receipt", r.error);
  const sp = await supabase.from("student_profiles").select("admission_number").eq("profile_id", receipt.student_id).maybeSingle();

  return {
    receipt: { ...receipt, amount: num(receipt.amount), previous_balance: num(receipt.previous_balance), remaining_balance: num(receipt.remaining_balance) },
    student: student.data ? { name: displayName(student.data), admissionNumber: sp.data?.admission_number ?? null } : null,
    invoiceNumber: inv.data?.invoice_number ?? null,
    payment: pay.data ? { ...pay.data, amount: num(pay.data.amount) } : null,
    officerName: officer.data ? displayName(officer.data) : null,
    isValid: pay.data?.status === "posted",
  };
}

// ---------------------------------------------------------- reconciliation

export interface TransactionRow extends Tables<"incoming_transactions"> {
  /** Pending payments that could be the same money: same method, currency and amount, or the same reference. */
  suggestions: PaymentListRow[];
}

export async function listTransactions(status: "unmatched" | "matched" | "rejected" = "unmatched", limit = 200): Promise<TransactionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incoming_transactions")
    .select("*")
    .eq("status", status)
    .order("transaction_date", { ascending: false })
    .limit(limit);
  if (error) fail("transactions", error);
  const rows = (data ?? []).map((t) => ({ ...t, amount: num(t.amount) }));
  if (status !== "unmatched" || rows.length === 0) return rows.map((t) => ({ ...t, suggestions: [] }));

  const open = await listPayments({ status: "open", limit: 500 });
  return rows.map((t) => ({
    ...t,
    suggestions: open.filter(
      (p) =>
        (p.method === t.method && p.currency === t.currency && p.amount === t.amount) ||
        (p.method === t.method && !!p.reference && p.reference.toLowerCase() === t.reference.toLowerCase()),
    ),
  }));
}

export async function countUnmatchedTransactions(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase.from("incoming_transactions").select("id", { count: "exact", head: true }).eq("status", "unmatched");
  if (error) fail("transactions", error);
  return count ?? 0;
}

// ----------------------------------------------------------------- reports

export interface CollectionLine {
  paymentId: string;
  paidOn: string;
  studentName: string;
  method: PaymentRow["method"];
  reference: string;
  invoiceNumber: string | null;
  currency: string;
  amount: number;
}

export interface FinanceReport {
  from: string;
  to: string;
  collections: CollectionLine[];
  /** Totals of posted payments in the range, per currency and per method. */
  byMethod: { currency: string; method: PaymentRow["method"]; count: number; total: number }[];
  totals: { currency: string; total: number }[];
  /** Issued invoices that still owe money, with how many days past due they are. */
  outstanding: (InvoiceListRow & { daysOverdue: number })[];
  aging: { currency: string; current: number; d1_30: number; d31_60: number; d61_plus: number; total: number }[];
}

const dayNumber = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86_400_000);

/** Collections (posted payments by date paid) and who still owes what. `today` is the school's local date. */
export async function getFinanceReport(from: string, to: string, today: string): Promise<FinanceReport> {
  const supabase = await createClient();
  const [posted, invoices, refundRows] = await Promise.all([
    listPayments({ status: "posted", limit: 5000 }),
    listInvoices({ displayStatus: undefined, limit: 5000 }),
    supabase.from("payment_refunds").select("payment_id, amount").limit(10000),
  ]);
  if (refundRows.error) fail("finance report", refundRows.error);
  // A partly refunded payment counts only for what the school kept.
  const refundedBy = new Map<string, number>();
  for (const r of refundRows.data ?? []) refundedBy.set(r.payment_id, (refundedBy.get(r.payment_id) ?? 0) + Math.round(num(r.amount) * 100));

  const collections = posted
    .filter((p) => p.paid_on >= from && p.paid_on <= to)
    .sort((a, b) => a.paid_on.localeCompare(b.paid_on))
    .map((p) => ({
      paymentId: p.id,
      paidOn: p.paid_on,
      studentName: p.studentName,
      method: p.method,
      reference: p.reference ?? "",
      invoiceNumber: p.invoiceNumber,
      currency: p.currency,
      amount: (Math.round(p.amount * 100) - (refundedBy.get(p.id) ?? 0)) / 100,
    }));

  const cents = (n: number) => Math.round(n * 100);
  const methodMap = new Map<string, { currency: string; method: PaymentRow["method"]; count: number; cents: number }>();
  const totalMap = new Map<string, number>();
  for (const c of collections) {
    const k = `${c.currency}|${c.method}`;
    const m = methodMap.get(k) ?? { currency: c.currency, method: c.method, count: 0, cents: 0 };
    m.count += 1;
    m.cents += cents(c.amount);
    methodMap.set(k, m);
    totalMap.set(c.currency, (totalMap.get(c.currency) ?? 0) + cents(c.amount));
  }

  const outstanding = invoices
    .filter((i) => i.status === "issued" && i.balanceDue > 0)
    .map((i) => ({ ...i, daysOverdue: Math.max(0, dayNumber(today) - dayNumber(i.dueDate)) }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || b.balanceDue - a.balanceDue);

  const agingMap = new Map<string, { current: number; d1_30: number; d31_60: number; d61_plus: number }>();
  for (const i of outstanding) {
    const a = agingMap.get(i.currency) ?? { current: 0, d1_30: 0, d31_60: 0, d61_plus: 0 };
    const bucket = i.daysOverdue === 0 ? "current" : i.daysOverdue <= 30 ? "d1_30" : i.daysOverdue <= 60 ? "d31_60" : "d61_plus";
    a[bucket] += cents(i.balanceDue);
    agingMap.set(i.currency, a);
  }

  return {
    from,
    to,
    collections,
    byMethod: [...methodMap.values()].map((m) => ({ currency: m.currency, method: m.method, count: m.count, total: m.cents / 100 })).sort((a, b) => a.currency.localeCompare(b.currency) || b.total - a.total),
    totals: [...totalMap.entries()].map(([currency, c]) => ({ currency, total: c / 100 })).sort((a, b) => a.currency.localeCompare(b.currency)),
    outstanding,
    aging: [...agingMap.entries()]
      .map(([currency, a]) => ({
        currency,
        current: a.current / 100,
        d1_30: a.d1_30 / 100,
        d31_60: a.d31_60 / 100,
        d61_plus: a.d61_plus / 100,
        total: (a.current + a.d1_30 + a.d31_60 + a.d61_plus) / 100,
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
  };
}
