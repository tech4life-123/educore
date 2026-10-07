import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney, INVOICE_DISPLAY_LABEL, INVOICE_DISPLAY_TONE, METHOD_LABEL, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE } from "@/lib/finance";
import { formatDate } from "@/lib/format";
import { requireCapability } from "@/services/auth";
import { getStudentAccount } from "@/services/finance";

export const metadata: Metadata = { title: "Student account" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StudentAccountPage({ params }: PageProps<"/finance/accounts/[studentId]">) {
  const { studentId } = await params;
  await requireCapability("finance.manage", `/finance/accounts/${studentId}`);
  if (!UUID.test(studentId)) notFound();
  const account = await getStudentAccount(studentId);
  if (!account) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{account.student.name}</h2>
          <p className="mt-1 text-sm text-muted">{account.student.admissionNumber ? `Admission no. ${account.student.admissionNumber}` : "No admission number"}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/finance/payments/new?student=${studentId}`} className={buttonClasses("primary")}>
            Record a payment
          </Link>
          <Link href={`/finance/invoices/new?student=${studentId}`} className={buttonClasses("secondary")}>
            New invoice
          </Link>
        </div>
      </div>

      <section aria-label="Balances" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {account.balances.length === 0 ? (
          <Card className="sm:col-span-2 lg:col-span-3">
            <CardBody className="text-sm text-muted">Nothing has been charged to this student yet.</CardBody>
          </Card>
        ) : (
          account.balances.map((b) => (
            <Card key={b.currency}>
              <CardBody>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Balance owed ({b.currency})</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{formatMoney(b.balance, b.currency)}</p>
                <p className="mt-1 text-xs text-subtle">
                  {formatMoney(b.totalPaid, b.currency)} paid of {formatMoney(b.totalCharges, b.currency)} charged
                </p>
              </CardBody>
            </Card>
          ))
        )}
      </section>

      <Card aria-labelledby="inv-title">
        <CardHeader titleId="inv-title" title="Invoices" />
        {account.invoices.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No invoices.</p>
        ) : (
          <Table caption="Invoices">
            <THead>
              <TR>
                <TH>Invoice</TH>
                <TH>Due</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Balance</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {account.invoices.map((i) => (
                <TR key={i.invoiceId}>
                  <TD>
                    <Link href={`/finance/invoices/${i.invoiceId}`} className="font-medium underline">
                      {i.invoiceNumber ?? "Draft"}
                    </Link>
                  </TD>
                  <TD className="text-sm text-muted">{formatDate(i.dueDate)}</TD>
                  <TD className="text-right">{formatMoney(i.totalAmount, i.currency)}</TD>
                  <TD className="text-right">{i.status === "issued" ? formatMoney(i.balanceDue, i.currency) : "—"}</TD>
                  <TD>
                    <Badge tone={INVOICE_DISPLAY_TONE[i.displayStatus] ?? "neutral"}>{INVOICE_DISPLAY_LABEL[i.displayStatus] ?? i.displayStatus}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card aria-labelledby="pay-title">
        <CardHeader titleId="pay-title" title="Payments" />
        {account.payments.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No payments.</p>
        ) : (
          <Table caption="Payments">
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Method / reference</TH>
                <TH className="text-right">Amount</TH>
                <TH>Status</TH>
                <TH>
                  <span className="sr-only">Receipt</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {account.payments.map((p) => (
                <TR key={p.id}>
                  <TD className="text-sm text-muted">{formatDate(p.paid_on)}</TD>
                  <TD>
                    {METHOD_LABEL[p.method]} <span className="font-mono text-xs text-muted">{p.reference}</span>
                  </TD>
                  <TD className="text-right">{formatMoney(p.amount, p.currency)}</TD>
                  <TD>
                    <Badge tone={PAYMENT_STATUS_TONE[p.status]}>{PAYMENT_STATUS_LABEL[p.status]}</Badge>
                  </TD>
                  <TD className="text-sm">
                    {p.receiptId ? (
                      <Link href={`/print/receipts/${p.receiptId}`} className="underline">
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

      <Card aria-labelledby="ledger-title">
        <CardHeader titleId="ledger-title" title="Ledger" description="Every charge, payment and reversal, newest first. Entries are never edited or deleted." />
        {account.entries.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No entries.</p>
        ) : (
          <Table caption="Ledger entries">
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Description</TH>
                <TH className="text-right">Debit (owed)</TH>
                <TH className="text-right">Credit (paid)</TH>
              </TR>
            </THead>
            <TBody>
              {account.entries.map((e) => (
                <TR key={e.id}>
                  <TD className="text-sm text-muted">{formatDate(e.entry_date)}</TD>
                  <TD>
                    {e.description} {e.entry_type === "reversal" ? <Badge tone="warning">Reversal</Badge> : null}
                  </TD>
                  <TD className="text-right">{e.direction === "debit" ? formatMoney(e.amount, e.currency) : ""}</TD>
                  <TD className="text-right">{e.direction === "credit" ? formatMoney(e.amount, e.currency) : ""}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
