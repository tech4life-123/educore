import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { todayIn } from "@/lib/attendance";
import { formatMoney, METHOD_LABEL } from "@/lib/finance";
import { formatDate } from "@/lib/format";
import { requireCapability } from "@/services/auth";
import { getFinanceOverview } from "@/services/finance";
import { getSchoolProfile } from "@/services/school";

export const metadata: Metadata = { title: "Finance" };

export default async function FinanceOverviewPage() {
  const { school } = await requireCapability("finance.manage", "/finance");
  const tz = (await getSchoolProfile(school.id))?.timezone ?? "Africa/Monrovia";
  const today = todayIn(tz);
  const o = await getFinanceOverview(`${today.slice(0, 7)}-01`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Link href="/finance/payments/new" className={buttonClasses("primary")}>
          Record a payment
        </Link>
        <Link href="/finance/invoices/new" className={buttonClasses("secondary")}>
          New invoice
        </Link>
      </div>

      <section aria-label="Totals" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {o.perCurrency.length === 0 ? (
          <Card className="sm:col-span-2 lg:col-span-4">
            <EmptyState icon="finance" title="No charges yet" description="Create fee structures, then issue the first invoice." />
          </Card>
        ) : (
          o.perCurrency.map((c) => (
            <Card key={c.currency}>
              <CardBody>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Outstanding ({c.currency})</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{formatMoney(c.outstanding, c.currency)}</p>
                <p className="mt-1 text-xs text-subtle">
                  {formatMoney(c.collected, c.currency)} collected of {formatMoney(c.charged, c.currency)} charged
                </p>
              </CardBody>
            </Card>
          ))
        )}
        <Card>
          <CardBody>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Overdue invoices</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{o.overdueInvoices}</p>
            {o.overdueInstallments > 0 ? <p className="mt-1 text-xs text-muted">{o.overdueInstallments} late instalment{o.overdueInstallments === 1 ? "" : "s"} on payment plans</p> : null}
            <Link href="/finance/invoices?status=overdue" className="mt-1 inline-block text-xs font-medium text-brand underline">
              View
            </Link>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Awaiting confirmation</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{o.pendingCount}</p>
            <Link href="/finance/payments?status=open" className="mt-1 inline-block text-xs font-medium text-brand underline">
              Review
            </Link>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Collected this month</p>
            {o.collectedThisMonth.length === 0 ? (
              <p className="mt-1 text-2xl font-semibold text-foreground">—</p>
            ) : (
              o.collectedThisMonth.map((m) => (
                <p key={m.currency} className="mt-1 text-xl font-semibold text-foreground">
                  {formatMoney(m.amount, m.currency)}
                </p>
              ))
            )}
          </CardBody>
        </Card>
      </section>

      <Card aria-labelledby="follow-title">
        <CardHeader
          titleId="follow-title"
          title="Follow up"
          description="Overdue, or due within a week. Families see the same reminder in their bell and on My fees; it clears itself when paid."
        />
        {o.followUp.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">Nothing is overdue or due this week.</p>
        ) : (
          <>
            <Table caption="Fees to follow up">
              <THead>
                <TR>
                  <TH>Student</TH>
                  <TH>For</TH>
                  <TH>Due</TH>
                  <TH className="text-right">Still to pay</TH>
                  <TH>
                    <span className="sr-only">Open</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {o.followUp.map((f) => (
                  <TR key={`${f.invoiceId}-${f.installment ?? 0}`}>
                    <TD>{f.studentName}</TD>
                    <TD className="text-sm">{f.installment ? `Instalment ${f.installment} of ${f.invoiceNumber ?? "invoice"}` : (f.invoiceNumber ?? "Invoice")}</TD>
                    <TD className="text-sm">
                      {formatDate(f.dueDate)}
                      <Badge tone={f.kind === "overdue" ? "danger" : "warning"} className="ml-2">
                        {f.kind === "overdue" ? `${f.daysOverdue}d late` : "Due soon"}
                      </Badge>
                    </TD>
                    <TD className="text-right">{formatMoney(f.amountDue, f.currency)}</TD>
                    <TD>
                      <Link href={`/finance/invoices/${f.invoiceId}`} className="text-xs font-medium text-brand underline">
                        Open
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {o.followUpTotal > o.followUp.length ? <p className="border-t border-border px-5 py-3 text-xs text-subtle">Showing {o.followUp.length} of {o.followUpTotal}. The Reports page lists everything outstanding.</p> : null}
          </>
        )}
      </Card>

      <Card aria-labelledby="pending-title">
        <CardHeader titleId="pending-title" title="Payments waiting for confirmation" description="Nothing counts toward a balance until it is confirmed." />
        {o.pendingPayments.length === 0 ? (
          <EmptyState icon="finance" title="Nothing waiting" />
        ) : (
          <Table caption="Pending payments">
            <THead>
              <TR>
                <TH>Student</TH>
                <TH>Method</TH>
                <TH>Reference</TH>
                <TH>Date</TH>
                <TH className="text-right">Amount</TH>
              </TR>
            </THead>
            <TBody>
              {o.pendingPayments.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <Link href="/finance/payments?status=open" className="font-medium underline">
                      {p.studentName}
                    </Link>
                  </TD>
                  <TD>{METHOD_LABEL[p.method]}</TD>
                  <TD className="font-mono text-xs">{p.reference}</TD>
                  <TD className="text-sm text-muted">{formatDate(p.paid_on)}</TD>
                  <TD className="text-right">
                    <Badge tone="warning">{formatMoney(p.amount, p.currency)}</Badge>
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
