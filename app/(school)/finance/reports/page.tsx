import type { Metadata } from "next";
import Link from "next/link";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { todayIn } from "@/lib/attendance";
import { formatMoney, METHOD_LABEL } from "@/lib/finance";
import { formatDate } from "@/lib/format";
import { requireCapability } from "@/services/auth";
import { getFinanceReport } from "@/services/finance";
import { getSchoolProfile } from "@/services/school";

export const metadata: Metadata = { title: "Finance reports" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function FinanceReportsPage({ searchParams }: PageProps<"/finance/reports">) {
  const { school } = await requireCapability("finance.manage", "/finance/reports");
  const sp = await searchParams;
  const profile = await getSchoolProfile(school.id);
  const today = todayIn(profile?.timezone ?? "Africa/Monrovia");
  const from = DATE.test(one(sp.from)) ? one(sp.from) : `${today.slice(0, 8)}01`;
  const to = DATE.test(one(sp.to)) ? one(sp.to) : today;
  const report = await getFinanceReport(from, to, today);
  const qs = `from=${from}&to=${to}`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Collections" description="Posted payments by the date they were paid. Rejected, pending and reversed payments are not counted." />
        <CardBody className="space-y-5">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label htmlFor="from" className="block text-sm font-medium text-foreground">From</label>
              <Input id="from" name="from" type="date" defaultValue={from} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="to" className="block text-sm font-medium text-foreground">To</label>
              <Input id="to" name="to" type="date" defaultValue={to} />
            </div>
            <Button type="submit" variant="secondary">Update</Button>
            <a href={`/finance/reports/export?kind=collections&${qs}`} className={buttonClasses("secondary")}>
              Download CSV
            </a>
          </form>

          {report.totals.length === 0 ? (
            <p className="text-sm text-muted">No posted payments between {formatDate(from)} and {formatDate(to)}.</p>
          ) : (
            <>
              <dl className="flex flex-wrap gap-6">
                {report.totals.map((t) => (
                  <div key={t.currency}>
                    <dt className="text-sm text-muted">Collected ({t.currency})</dt>
                    <dd className="text-2xl font-semibold text-foreground">{formatMoney(t.total, t.currency)}</dd>
                  </div>
                ))}
              </dl>
              <Table caption="Collections by method">
                <THead>
                  <TR>
                    <TH>Method</TH>
                    <TH>Currency</TH>
                    <TH className="text-right">Payments</TH>
                    <TH className="text-right">Total</TH>
                  </TR>
                </THead>
                <TBody>
                  {report.byMethod.map((m) => (
                    <TR key={`${m.currency}-${m.method}`}>
                      <TD>{METHOD_LABEL[m.method]}</TD>
                      <TD>{m.currency}</TD>
                      <TD className="text-right">{m.count}</TD>
                      <TD className="text-right">{formatMoney(m.total, m.currency)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Outstanding fees"
          description="Issued invoices that still owe money, grouped by how late they are."
          action={
            <a href="/finance/reports/export?kind=outstanding" className={buttonClasses("secondary")}>
              Download CSV
            </a>
          }
        />
        {report.outstanding.length === 0 ? (
          <EmptyState icon="finance" title="Nothing outstanding" description="Every issued invoice is paid." />
        ) : (
          <>
            <Table caption="Ageing of unpaid invoices">
              <THead>
                <TR>
                  <TH>Currency</TH>
                  <TH className="text-right">Not yet due</TH>
                  <TH className="text-right">1–30 days</TH>
                  <TH className="text-right">31–60 days</TH>
                  <TH className="text-right">61+ days</TH>
                  <TH className="text-right">Total</TH>
                </TR>
              </THead>
              <TBody>
                {report.aging.map((a) => (
                  <TR key={a.currency}>
                    <TD>{a.currency}</TD>
                    <TD className="text-right">{formatMoney(a.current, a.currency)}</TD>
                    <TD className="text-right">{formatMoney(a.d1_30, a.currency)}</TD>
                    <TD className="text-right">{formatMoney(a.d31_60, a.currency)}</TD>
                    <TD className="text-right">{formatMoney(a.d61_plus, a.currency)}</TD>
                    <TD className="text-right font-medium">{formatMoney(a.total, a.currency)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Table caption="Unpaid invoices, most overdue first">
              <THead>
                <TR>
                  <TH>Invoice</TH>
                  <TH>Student</TH>
                  <TH>Due</TH>
                  <TH className="text-right">Days late</TH>
                  <TH className="text-right">Balance due</TH>
                </TR>
              </THead>
              <TBody>
                {report.outstanding.slice(0, 100).map((i) => (
                  <TR key={i.invoiceId}>
                    <TD>
                      <Link href={`/finance/invoices/${i.invoiceId}`} className="underline">
                        {i.invoiceNumber}
                      </Link>
                    </TD>
                    <TD>
                      <Link href={`/finance/accounts/${i.studentId}`} className="hover:underline">
                        {i.studentName}
                      </Link>
                    </TD>
                    <TD className="text-sm text-muted">{formatDate(i.dueDate)}</TD>
                    <TD className="text-right">{i.daysOverdue || "—"}</TD>
                    <TD className="text-right">{formatMoney(i.balanceDue, i.currency)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {report.outstanding.length > 100 ? <p className="px-5 py-3 text-xs text-subtle">Showing the 100 most overdue. Download the CSV for the full list.</p> : null}
          </>
        )}
      </Card>
    </div>
  );
}
