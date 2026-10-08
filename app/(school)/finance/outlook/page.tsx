import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { todayIn } from "@/lib/attendance";
import { formatMoney, METHOD_LABEL } from "@/lib/finance";
import type { PaymentMethod } from "@/lib/finance";
import { requireCapability } from "@/services/auth";
import { getOutlook } from "@/services/finance";
import { getSchoolProfile } from "@/services/school";

export const metadata: Metadata = { title: "Finance outlook" };

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
const KIND: Record<string, string> = { discount: "Discounts", scholarship: "Scholarships", waiver: "Waivers" };

export default async function FinanceOutlookPage() {
  const { school } = await requireCapability("finance.manage", "/finance/outlook");
  const profile = await getSchoolProfile(school.id);
  const today = todayIn(profile?.timezone ?? "Africa/Monrovia");
  const o = await getOutlook(today);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="What is coming due"
          description="Money still to collect, grouped by when it falls due. The amounts are facts from invoices and payment plans; each currency is shown separately."
        />
        <CardBody className="space-y-8">
          {o.forecast.length === 0 ? (
            <p className="text-sm text-muted">Nothing is waiting to be collected.</p>
          ) : (
            o.forecast.map((f) => (
              <div key={f.currency} className="space-y-3">
                <Table caption={`Still to collect in ${f.currency}`}>
                  <THead>
                    <TR>
                      <TH>When</TH>
                      <TH className="text-right">Items</TH>
                      <TH className="text-right">Amount ({f.currency})</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {f.buckets.map((b) => (
                      <TR key={b.key}>
                        <TD className={b.key === "overdue" && b.amount > 0 ? "font-medium text-danger" : undefined}>{b.label}</TD>
                        <TD className="text-right">{b.count}</TD>
                        <TD className="text-right">{formatMoney(b.amount, f.currency)}</TD>
                      </TR>
                    ))}
                    <TR>
                      <TD className="font-semibold">Total</TD>
                      <TD className="text-right">{f.buckets.reduce((s, b) => s + b.count, 0)}</TD>
                      <TD className="text-right font-semibold">{formatMoney(f.total, f.currency)}</TD>
                    </TR>
                  </TBody>
                </Table>
                <p className="text-sm text-muted">
                  {f.rate === null || f.estimate === null
                    ? "Estimate: not enough history yet. It appears once at least 100 of fees have fallen due in the last 6 months."
                    : `Estimate: about ${formatMoney(f.estimate, f.currency)} of the money not yet due is likely to come in, based on ${Math.round(f.rate * 100)}% of what fell due in the last 6 months having been paid. This is a guess from your school's own past, not a promise.`}
                </p>
              </div>
            ))
          )}
        </CardBody>
      </Card>

      {o.perCurrency.map((c) => (
        <Card key={c.currency}>
          <CardHeader title={`Last 6 months (${c.currency})`} description="Collected is net of refunds. Charged is what was billed on invoices." />
          <CardBody className="space-y-6">
            <Table caption={`Monthly totals in ${c.currency}`}>
              <THead>
                <TR>
                  <TH>Month</TH>
                  <TH className="text-right">Charged</TH>
                  <TH className="text-right">Collected</TH>
                  <TH className="text-right">Refunded</TH>
                </TR>
              </THead>
              <TBody>
                {o.months.map((m, i) => (
                  <TR key={m}>
                    <TD>{monthLabel(m)}</TD>
                    <TD className="text-right">{formatMoney(c.charged[i], c.currency)}</TD>
                    <TD className="text-right">{formatMoney(c.collected[i], c.currency)}</TD>
                    <TD className="text-right">{formatMoney(c.refunds[i], c.currency)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-medium text-foreground">How families paid</h3>
                {c.methods.length === 0 ? (
                  <p className="text-sm text-muted">No payments in this period.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {c.methods.map((m) => (
                      <li key={m.method} className="flex justify-between gap-3">
                        <span>{METHOD_LABEL[m.method as PaymentMethod] ?? m.method}</span>
                        <span className="text-muted">{m.percent}% · {formatMoney(m.amount, c.currency)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium text-foreground">Fees reduced</h3>
                {c.discounts.length === 0 ? (
                  <p className="text-sm text-muted">No discounts, scholarships or waivers in this period.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {c.discounts.map((d) => (
                      <li key={d.kind} className="flex justify-between gap-3">
                        <span>{KIND[d.kind] ?? d.kind}</span>
                        <span className="text-muted">{formatMoney(d.amount, c.currency)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </CardBody>
        </Card>
      ))}

      <Card>
        <CardHeader title="Largest balances" description="Students with the most still to collect, across everything not yet paid." />
        <CardBody>
          {o.debtors.length === 0 ? (
            <p className="text-sm text-muted">No outstanding balances.</p>
          ) : (
            <Table caption="Largest outstanding balances">
              <THead>
                <TR>
                  <TH>Student</TH>
                  <TH className="text-right">Still to collect</TH>
                </TR>
              </THead>
              <TBody>
                {o.debtors.map((d) => (
                  <TR key={`${d.studentId}-${d.currency}`}>
                    <TD><Link href={`/finance/accounts/${d.studentId}`} className="text-primary hover:underline">{d.name}</Link></TD>
                    <TD className="text-right">{formatMoney(d.amount, d.currency)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
