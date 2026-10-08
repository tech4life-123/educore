import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApplyAdjustmentForm, RefundForm, VoidAdjustmentForm } from "@/components/finance/adjustment-forms";
import { CancelPlanForm, CreatePlanForm } from "@/components/finance/plan-forms";
import { PaymentActions } from "@/components/finance/payment-actions";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  FEE_TYPE_LABEL,
  formatMoney,
  INVOICE_DISPLAY_LABEL,
  INVOICE_DISPLAY_TONE,
  METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
} from "@/lib/finance";
import { formatDate } from "@/lib/format";
import { todayIn } from "@/lib/attendance";
import { hasCapability } from "@/lib/auth/roles";
import { requireCapability } from "@/services/auth";
import { getInvoiceDetail } from "@/services/finance";
import { getSchoolProfile } from "@/services/school";
import { cancelInvoiceAction, issueInvoiceAction } from "../../actions";

const INSTALLMENT_LABEL: Record<string, string> = { paid: "Paid", partial: "Part paid", upcoming: "Upcoming", overdue: "Overdue", inactive: "Inactive" };
const INSTALLMENT_TONE: Record<string, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  paid: "success",
  partial: "warning",
  upcoming: "brand",
  overdue: "danger",
  inactive: "neutral",
};

export const metadata: Metadata = { title: "Invoice" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function InvoiceDetailPage({ params, searchParams }: PageProps<"/finance/invoices/[id]">) {
  const { id } = await params;
  const { profile, school } = await requireCapability("finance.manage", `/finance/invoices/${id}`);
  const isAdmin = hasCapability(profile.role, "school.manage");
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const detail = await getInvoiceDetail(id);
  if (!detail) notFound();
  const { invoice, items, balance, student, payments, adjustments, refunds, plans } = detail;
  const activePlan = plans.find((p) => p.status === "active") ?? null;
  const today = todayIn((await getSchoolProfile(school.id))?.timezone ?? "Africa/Monrovia");
  const refundedByPayment = new Map<string, number>();
  for (const r of refunds) refundedByPayment.set(r.payment_id, (refundedByPayment.get(r.payment_id) ?? 0) + r.amount);
  
  const cur = invoice.currency;
  const isDraft = invoice.status === "draft";
  const isIssued = invoice.status === "issued";

  return (
    <div className="space-y-6">
      {sp.created ? <Alert tone="success" title="Draft saved">Review the lines, then issue the invoice to charge the student’s account.</Alert> : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{invoice.invoice_number ?? "Draft invoice"}</h2>
          <p className="mt-1 text-sm text-muted">
            {student ? (
              <Link href={`/finance/accounts/${student.studentId}`} className="font-medium underline">
                {student.name}
              </Link>
            ) : (
              "Unknown student"
            )}
            {student?.admissionNumber ? ` · ${student.admissionNumber}` : ""} · {detail.academicYear ?? "—"}
            {detail.term ? ` · ${detail.term}` : ""}
          </p>
        </div>
        <Badge tone={INVOICE_DISPLAY_TONE[balance.displayStatus] ?? "neutral"}>{INVOICE_DISPLAY_LABEL[balance.displayStatus] ?? balance.displayStatus}</Badge>
      </div>

      <div className={`grid gap-4 ${balance.adjustmentsTotal > 0 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <Card>
          <CardBody>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Total</p>
            <p className="mt-1 text-xl font-semibold">{formatMoney(balance.totalAmount, cur)}</p>
          </CardBody>
        </Card>
        {balance.adjustmentsTotal > 0 ? (
          <Card>
            <CardBody>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Discounts &amp; waivers</p>
              <p className="mt-1 text-xl font-semibold">− {formatMoney(balance.adjustmentsTotal, cur)}</p>
            </CardBody>
          </Card>
        ) : null}
        <Card>
          <CardBody>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Paid</p>
            <p className="mt-1 text-xl font-semibold">{formatMoney(balance.amountPaid, cur)}</p>
            {balance.amountRefunded > 0 ? <p className="mt-1 text-xs text-subtle">After {formatMoney(balance.amountRefunded, cur)} refunded</p> : null}
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Balance due</p>
            <p className="mt-1 text-xl font-semibold">{isIssued ? formatMoney(balance.balanceDue, cur) : "—"}</p>
            <p className="mt-1 text-xs text-subtle">Due {formatDate(invoice.due_date)}</p>
          </CardBody>
        </Card>
      </div>

      <Card aria-labelledby="lines-title">
        <CardHeader titleId="lines-title" title="Fee lines" />
        <Table caption="Invoice lines">
          <THead>
            <TR>
              <TH>Fee</TH>
              <TH>Description</TH>
              <TH className="text-right">Amount</TH>
            </TR>
          </THead>
          <TBody>
            {items.map((i) => (
              <TR key={i.id}>
                <TD>{FEE_TYPE_LABEL[i.fee_type]}</TD>
                <TD>{i.description}</TD>
                <TD className="text-right">{formatMoney(i.amount, cur)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {invoice.notes ? <p className="border-t border-border px-5 py-3 text-sm text-muted">{invoice.notes}</p> : null}
      </Card>

      {isDraft ? (
        <Card>
          <CardHeader title="Issue this invoice" description="Issuing assigns the invoice number and puts each line on the student’s account. Lines can’t be changed afterwards." />
          <CardBody className="flex flex-wrap items-start gap-4">
            <ActionForm action={issueInvoiceAction} compact aria-label="Issue invoice">
              <input type="hidden" name="invoice_id" value={invoice.id} />
              <SubmitButton loadingText="Issuing…">Issue invoice</SubmitButton>
            </ActionForm>
            <ActionForm action={cancelInvoiceAction} compact aria-label="Discard draft">
              <input type="hidden" name="invoice_id" value={invoice.id} />
              <div className="flex flex-wrap items-center gap-2">
                <Input name="reason" aria-label="Reason for discarding" placeholder="Reason" maxLength={200} className="h-9 w-48 text-sm" />
                <ConfirmButton question="Discard it?" confirmLabel="Yes, discard" pendingLabel="Discarding…">
                  Discard draft
                </ConfirmButton>
              </div>
            </ActionForm>
          </CardBody>
        </Card>
      ) : null}

      {invoice.status === "cancelled" ? (
        <Alert tone="warning" title="This invoice was cancelled">
          {invoice.cancel_reason}
        </Alert>
      ) : null}

      {!isDraft ? (
        <Card aria-labelledby="pay-title">
          <CardHeader
            titleId="pay-title"
            title="Payments"
            action={
              isIssued ? (
                <Link href={`/finance/payments/new?student=${invoice.student_id}&invoice=${invoice.id}`} className={buttonClasses("primary", "sm")}>
                  Record a payment
                </Link>
              ) : null
            }
          />
          {payments.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">No payments recorded against this invoice.</p>
          ) : (
            <Table caption="Payments on this invoice">
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Method</TH>
                  <TH>Reference</TH>
                  <TH className="text-right">Amount</TH>
                  <TH>Status</TH>
                  <TH>
                    <span className="sr-only">Actions</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {payments.map((p) => (
                  <TR key={p.id}>
                    <TD className="text-sm text-muted">{formatDate(p.paid_on)}</TD>
                    <TD>{METHOD_LABEL[p.method]}</TD>
                    <TD className="font-mono text-xs">{p.reference}</TD>
                    <TD className="text-right">{formatMoney(p.amount, p.currency)}</TD>
                    <TD>
                      <Badge tone={PAYMENT_STATUS_TONE[p.status]}>{PAYMENT_STATUS_LABEL[p.status]}</Badge>
                    </TD>
                    <TD>
                      <PaymentActions paymentId={p.id} status={p.status} label={`payment ${p.reference}`} />
                      {isAdmin && p.status === "posted" && p.amount - (refundedByPayment.get(p.id) ?? 0) > 0 ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-muted underline">Refund…</summary>
                          <div className="mt-2">
                            <RefundForm paymentId={p.id} maxAmount={p.amount - (refundedByPayment.get(p.id) ?? 0)} currency={p.currency} />
                          </div>
                        </details>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      ) : null}

      {!isDraft && (isIssued || adjustments.length > 0) ? (
        <Card aria-labelledby="adj-title">
          <CardHeader
            titleId="adj-title"
            title="Discounts, scholarships & waivers"
            description={isAdmin ? "Reduce what the family owes. Each one is recorded in the ledger and can be voided." : "Only the school administrator can grant these."}
          />
          {isAdmin && isIssued && balance.balanceDue > 0 ? (
            <CardBody>
              <ApplyAdjustmentForm invoiceId={invoice.id} balanceDue={balance.balanceDue} currency={cur} />
            </CardBody>
          ) : null}
          {adjustments.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">None applied.</p>
          ) : (
            <Table caption="Adjustments on this invoice">
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Type</TH>
                  <TH>Reason</TH>
                  <TH className="text-right">Amount</TH>
                  <TH>Status</TH>
                  <TH>
                    <span className="sr-only">Actions</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {adjustments.map((a) => (
                  <TR key={a.id}>
                    <TD className="text-sm text-muted">{formatDate(a.created_at)}</TD>
                    <TD className="capitalize">{a.kind}</TD>
                    <TD className="text-sm">
                      {a.reason}
                      {a.status === "voided" ? <span className="block text-xs text-subtle">Voided: {a.voided_reason}</span> : null}
                    </TD>
                    <TD className="text-right">{formatMoney(a.amount, a.currency)}</TD>
                    <TD>
                      <Badge tone={a.status === "applied" ? "success" : "neutral"}>{a.status === "applied" ? "Applied" : "Voided"}</Badge>
                    </TD>
                    <TD>{isAdmin && a.status === "applied" && isIssued ? <VoidAdjustmentForm adjustmentId={a.id} /> : null}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      ) : null}

      {!isDraft && (isIssued || plans.length > 0) ? (
        <Card aria-labelledby="plan-title">
          <CardHeader
            titleId="plan-title"
            title="Payment plan"
            description="An agreement to pay in instalments. It doesn’t change what is owed; payments are recorded as usual and fill the instalments in date order."
          />
          {activePlan ? (
            <>
              <Table caption="Instalments of the active payment plan">
                <THead>
                  <TR>
                    <TH>#</TH>
                    <TH>Due</TH>
                    <TH className="text-right">Amount</TH>
                    <TH className="text-right">Paid</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {activePlan.installments.map((n) => (
                    <TR key={n.installmentId}>
                      <TD>{n.seq}</TD>
                      <TD className="text-sm text-muted">{formatDate(n.dueDate)}</TD>
                      <TD className="text-right">{formatMoney(n.amount, cur)}</TD>
                      <TD className="text-right">{formatMoney(n.paid, cur)}</TD>
                      <TD>
                        <Badge tone={INSTALLMENT_TONE[n.status] ?? "neutral"}>{INSTALLMENT_LABEL[n.status] ?? n.status}</Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {activePlan.note ? <p className="border-t border-border px-5 py-3 text-sm text-muted">{activePlan.note}</p> : null}
              {isIssued ? (
                <CardBody>
                  <CancelPlanForm planId={activePlan.id} />
                </CardBody>
              ) : null}
            </>
          ) : isIssued && balance.balanceDue > 0 ? (
            <CardBody>
              <CreatePlanForm invoiceId={invoice.id} balanceDue={balance.balanceDue} currency={cur} today={today} />
            </CardBody>
          ) : (
            <p className="px-5 py-4 text-sm text-muted">No active plan.</p>
          )}
          {plans.filter((p) => p.status === "cancelled").length > 0 ? (
            <p className="border-t border-border px-5 py-3 text-xs text-subtle">
              Earlier plans cancelled: {plans.filter((p) => p.status === "cancelled").map((p) => `${formatDate(p.created_at)} (${p.cancelled_reason})`).join("; ")}
            </p>
          ) : null}
        </Card>
      ) : null}

      {refunds.length > 0 ? (
        <Card aria-labelledby="ref-title">
          <CardHeader titleId="ref-title" title="Refunds" description="Money returned to the family. Refunds can’t be edited or deleted." />
          <Table caption="Refunds on this invoice">
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Method</TH>
                <TH>Reference</TH>
                <TH>Reason</TH>
                <TH className="text-right">Amount</TH>
              </TR>
            </THead>
            <TBody>
              {refunds.map((r) => (
                <TR key={r.id}>
                  <TD className="text-sm text-muted">{formatDate(r.refunded_on)}</TD>
                  <TD>{METHOD_LABEL[r.method]}</TD>
                  <TD className="font-mono text-xs">{r.reference ?? "—"}</TD>
                  <TD className="text-sm">{r.reason}</TD>
                  <TD className="text-right">{formatMoney(r.amount, r.currency)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}

      {isIssued && payments.every((p) => ["rejected", "failed", "cancelled", "reversed", "refunded"].includes(p.status)) ? (
        <Card>
          <CardHeader title="Cancel this invoice" description="Its charges are reversed in the ledger (never deleted). Not possible while a payment is pending or posted — reject or reverse it first." />
          <CardBody>
            <ActionForm action={cancelInvoiceAction} compact aria-label="Cancel invoice">
              <input type="hidden" name="invoice_id" value={invoice.id} />
              <div className="flex flex-wrap items-center gap-2">
                <Input name="reason" aria-label="Reason for cancelling" placeholder="Reason" maxLength={200} className="h-9 w-56 text-sm" />
                <ConfirmButton question="Cancel the invoice?" confirmLabel="Yes, cancel it" pendingLabel="Cancelling…">
                  Cancel invoice
                </ConfirmButton>
              </div>
            </ActionForm>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
