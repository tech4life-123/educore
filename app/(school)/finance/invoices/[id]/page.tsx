import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { requireCapability } from "@/services/auth";
import { getInvoiceDetail } from "@/services/finance";
import { cancelInvoiceAction, issueInvoiceAction } from "../../actions";

export const metadata: Metadata = { title: "Invoice" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function InvoiceDetailPage({ params, searchParams }: PageProps<"/finance/invoices/[id]">) {
  const { id } = await params;
  await requireCapability("finance.manage", `/finance/invoices/${id}`);
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const detail = await getInvoiceDetail(id);
  if (!detail) notFound();
  const { invoice, items, balance, student, payments } = detail;
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

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Total</p>
            <p className="mt-1 text-xl font-semibold">{formatMoney(balance.totalAmount, cur)}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Paid</p>
            <p className="mt-1 text-xl font-semibold">{formatMoney(balance.amountPaid, cur)}</p>
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
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
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
