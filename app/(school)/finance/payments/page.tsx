import type { Metadata } from "next";
import Link from "next/link";
import { PaymentActions } from "@/components/finance/payment-actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatMoney, METHOD_LABEL, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE, type PaymentStatus } from "@/lib/finance";
import { formatDate } from "@/lib/format";
import { requireCapability } from "@/services/auth";
import { listPayments } from "@/services/finance";

export const metadata: Metadata = { title: "Payments" };

const FILTERS = ["open", "posted", "rejected", "reversed"] as const;
const FILTER_LABEL: Record<string, string> = { open: "Awaiting confirmation", posted: "Posted", rejected: "Rejected", reversed: "Reversed" };

export default async function PaymentsPage({ searchParams }: PageProps<"/finance/payments">) {
  await requireCapability("finance.manage", "/finance/payments");
  const sp = await searchParams;
  const status = typeof sp.status === "string" && (FILTERS as readonly string[]).includes(sp.status) ? (sp.status as (typeof FILTERS)[number]) : undefined;
  const payments = await listPayments({ status });

  return (
    <div className="space-y-4">
      {sp.recorded ? (
        <Alert tone="success" title="Payment recorded">
          It is <strong>pending</strong>: it changes no balance until someone confirms it below.
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter payments" className="flex flex-wrap gap-2">
          {[undefined, ...FILTERS].map((f) => (
            <Link
              key={f ?? "all"}
              href={f ? `/finance/payments?status=${f}` : "/finance/payments"}
              aria-current={f === status ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                f === status ? "border-brand bg-brand-soft font-medium text-foreground" : "border-border text-muted hover:bg-surface-muted",
              )}
            >
              {f ? FILTER_LABEL[f] : "All"}
            </Link>
          ))}
        </nav>
        <Link href="/finance/payments/new" className={buttonClasses("primary")}>
          Record a payment
        </Link>
      </div>

      <Card>
        {payments.length === 0 ? (
          <EmptyState icon="finance" title="No payments here" description="Record a bank, cash or mobile-money payment to get started." />
        ) : (
          <Table caption="Payments">
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Student</TH>
                <TH>Method / reference</TH>
                <TH>Invoice</TH>
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
                  <TD>
                    <Link href={`/finance/accounts/${p.student_id}`} className="hover:underline">
                      {p.studentName}
                    </Link>
                  </TD>
                  <TD>
                    <div>{METHOD_LABEL[p.method]}</div>
                    <div className="font-mono text-xs text-muted">{p.reference}</div>
                    {p.explanation ? <div className="max-w-xs text-xs text-subtle">{p.explanation}</div> : null}
                  </TD>
                  <TD className="text-sm">
                    {p.invoice_id ? (
                      <Link href={`/finance/invoices/${p.invoice_id}`} className="underline">
                        {p.invoiceNumber}
                      </Link>
                    ) : (
                      <span className="text-muted">Not linked</span>
                    )}
                  </TD>
                  <TD className="text-right">{formatMoney(p.amount, p.currency)}</TD>
                  <TD>
                    <Badge tone={PAYMENT_STATUS_TONE[p.status as PaymentStatus]}>{PAYMENT_STATUS_LABEL[p.status as PaymentStatus]}</Badge>
                    {p.status_reason ? <div className="mt-1 max-w-[12rem] text-xs text-subtle">{p.status_reason}</div> : null}
                  </TD>
                  <TD>
                    <PaymentActions paymentId={p.id} status={p.status as PaymentStatus} label={`payment ${p.reference}`} />
                    {p.receiptId ? (
                      <Link href={`/print/receipts/${p.receiptId}`} className="mt-1 block text-sm underline">
                        Receipt
                      </Link>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
