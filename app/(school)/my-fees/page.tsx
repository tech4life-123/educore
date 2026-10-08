import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatMoney, INVOICE_DISPLAY_LABEL, INVOICE_DISPLAY_TONE, METHOD_LABEL, PAYMENT_STATUS_LABEL, PAYMENT_STATUS_TONE } from "@/lib/finance";
import { formatDate, fullName } from "@/lib/format";
import { requireSchoolMember } from "@/services/auth";
import { listGuardianLinks } from "@/services/classes";
import { Alert } from "@/components/ui/alert";
import { feeReminderItems } from "@/lib/fee-reminders";
import { getFamilyAccounts, getFeeReminders, type FamilyBalance } from "@/services/my-fees";

export const metadata: Metadata = { title: "My fees" };

export default async function MyFeesPage({ searchParams }: PageProps<"/my-fees">) {
  const { school, profile } = await requireSchoolMember("/my-fees");

  // Only students and parents have a "My fees" view; staff manage fees elsewhere.
  if (profile.role === "school_admin" || profile.role === "finance_officer") redirect("/finance");
  if (profile.role !== "student" && profile.role !== "parent") redirect("/dashboard");

  const isParent = profile.role === "parent";
  const people = isParent
    ? (await listGuardianLinks(school.id, profile.id, "children"))
        .map((l) => l.person)
        .filter((p) => p !== null)
        .map((p) => ({ id: p.id, name: fullName(p) }))
    : [{ id: profile.id, name: fullName(profile) }];

  const header = (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">My fees</h1>
      <p className="mt-1 text-sm text-muted">
        {isParent ? "What your children owe, what has been paid, and your receipts." : "What you owe, what has been paid, and your receipts."}
      </p>
    </div>
  );

  if (people.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <EmptyState
            icon="students"
            title="No children linked to your account"
            description="The school links each parent or guardian to their children. Ask the school office to link your account."
          />
        </Card>
      </div>
    );
  }

  // The chosen child must be one of the viewer's own children; anything else falls back to the first.
  const params = await searchParams;
  const requested = Array.isArray(params.child) ? params.child[0] : params.child;
  const selected = people.find((p) => p.id === requested) ?? people[0];
  const [[account], reminders] = await Promise.all([getFamilyAccounts([selected]), getFeeReminders([selected.id])]);
  const reminderItems = feeReminderItems(reminders, people, false);
  const anyOverdue = reminders.some((r) => r.kind === "overdue");

  return (
    <div className="space-y-6">
      {header}

      {people.length > 1 ? (
        <nav aria-label="Child" className="flex flex-wrap gap-2">
          {people.map((p) => (
            <Pill key={p.id} href={`/my-fees?child=${p.id}`} active={p.id === selected.id}>
              {p.name}
            </Pill>
          ))}
        </nav>
      ) : null}

      {isParent ? <h2 className="text-lg font-semibold text-foreground">{selected.name}</h2> : null}

      {reminderItems.length > 0 ? (
        <Alert tone={anyOverdue ? "danger" : "warning"} title={anyOverdue ? "Payment overdue" : "Payment due soon"}>
          <ul className="mt-1 space-y-1">
            {reminderItems.map((r) => (
              <li key={r.id}>
                <span className="font-medium">{r.title}</span> <span className="opacity-80">· {r.meta}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs opacity-80">Please pay at the school’s finance office. If you have already paid, the school will update this once it records the payment.</p>
        </Alert>
      ) : null}

      <section aria-label="Balances" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {account.balances.length === 0 ? (
          <Card className="sm:col-span-2 lg:col-span-3">
            <CardBody className="text-sm text-muted">Nothing has been charged yet.</CardBody>
          </Card>
        ) : (
          account.balances.map((b) => <BalanceCard key={b.currency} balance={b} />)
        )}
      </section>

      <Card aria-labelledby="inv-title">
        <CardHeader titleId="inv-title" title="Invoices" description="Select an invoice to see what it includes." />
        {account.invoices.length === 0 ? (
          <EmptyState icon="finance" title="No invoices yet" description="Invoices appear here when the school issues them." />
        ) : (
          <ul className="divide-y divide-border">
            {account.invoices.map((i) => {
              const status = INVOICE_DISPLAY_LABEL[i.displayStatus] ?? i.displayStatus;
              return (
                <li key={i.invoiceId}>
                  <details className="group">
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-surface-muted">
                      <span>
                        <span className="font-medium text-foreground">{i.invoiceNumber ?? "Invoice"}</span>
                        <span className="block text-xs text-muted">
                          {i.issueDate ? `Issued ${formatDate(i.issueDate)} · ` : ""}Due {formatDate(i.dueDate)}
                        </span>
                      </span>
                      <span className="flex items-center gap-3 text-sm">
                        <span className="text-right">
                          <span className="block tabular-nums text-foreground">{formatMoney(i.totalAmount, i.currency)}</span>
                          {i.balanceDue > 0 ? (
                            <span className="block text-xs text-muted">{formatMoney(i.balanceDue, i.currency)} still owed</span>
                          ) : null}
                          {i.adjustmentsTotal > 0 ? (
                            <span className="block text-xs text-muted">includes {formatMoney(i.adjustmentsTotal, i.currency)} discount</span>
                          ) : null}
                        </span>
                        <Badge tone={INVOICE_DISPLAY_TONE[i.displayStatus] ?? "neutral"}>{status}</Badge>
                      </span>
                    </summary>
                    <div className="border-t border-border bg-surface-muted/40 px-5 py-3">
                      <Table caption={`Items on invoice ${i.invoiceNumber ?? ""}`.trim()}>
                        <THead>
                          <TR>
                            <TH>Item</TH>
                            <TH className="text-right">Amount</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {i.items.map((it) => (
                            <TR key={it.id}>
                              <TD>{it.description}</TD>
                              <TD className="text-right tabular-nums">{formatMoney(it.amount, i.currency)}</TD>
                            </TR>
                          ))}
                          <TR>
                            <TD className="font-medium">Total</TD>
                            <TD className="text-right font-medium tabular-nums">{formatMoney(i.totalAmount, i.currency)}</TD>
                          </TR>
                          {i.adjustmentsTotal > 0 ? (
                            <TR>
                              <TD className="text-muted">Discounts &amp; waivers</TD>
                              <TD className="text-right tabular-nums text-muted">− {formatMoney(i.adjustmentsTotal, i.currency)}</TD>
                            </TR>
                          ) : null}
                          <TR>
                            <TD className="text-muted">Paid so far</TD>
                            <TD className="text-right tabular-nums text-muted">{formatMoney(i.amountPaid, i.currency)}</TD>
                          </TR>
                        </TBody>
                      </Table>
                      {i.installments.length > 0 ? (
                        <div className="mt-4">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted">Payment plan</p>
                          <ul className="mt-2 divide-y divide-border rounded-md border border-border text-sm">
                            {i.installments.map((n) => (
                              <li key={n.seq} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                                <span>
                                  <span className="font-medium text-foreground">Instalment {n.seq}</span>
                                  <span className="ml-2 text-xs text-muted">due {formatDate(n.dueDate)}</span>
                                </span>
                                <span className="flex items-center gap-3">
                                  <span className="tabular-nums">{formatMoney(n.amount, i.currency)}</span>
                                  <Badge tone={n.status === "paid" ? "success" : n.status === "overdue" ? "danger" : n.status === "partial" ? "warning" : "brand"}>
                                    {n.status === "paid" ? "Paid" : n.status === "overdue" ? "Overdue" : n.status === "partial" ? "Part paid" : "Upcoming"}
                                  </Badge>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card aria-labelledby="pay-title">
        <CardHeader
          titleId="pay-title"
          title="Payment history"
          description="Payments appear here once the school has confirmed them. Open a receipt to view or print it."
        />
        {account.payments.length === 0 ? (
          <EmptyState icon="finance" title="No payments yet" />
        ) : (
          <Table caption="Payment history">
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Method / reference</TH>
                <TH>Invoice</TH>
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
                  <TD className="text-sm text-muted">{formatDate(p.paidOn)}</TD>
                  <TD>
                    {METHOD_LABEL[p.method]} {p.reference ? <span className="font-mono text-xs text-muted">{p.reference}</span> : null}
                  </TD>
                  <TD className="text-sm text-muted">{p.invoiceNumber ?? "—"}</TD>
                  <TD className="text-right tabular-nums">{formatMoney(p.amount, p.currency)}</TD>
                  <TD>
                    <Badge tone={PAYMENT_STATUS_TONE[p.status]}>{PAYMENT_STATUS_LABEL[p.status]}</Badge>
                  </TD>
                  <TD className="text-sm">
                    {p.receiptId ? (
                      <a
                        href={`/print/receipts/${p.receiptId}`}
                        target="_blank"
                        rel="noopener"
                        className="font-medium text-brand underline-offset-4 hover:underline"
                        aria-label={`Open receipt ${p.receiptNumber ?? ""}`.trim()}
                      >
                        Receipt
                      </a>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <p className="text-sm text-muted">These figures come from the school’s own records. If something looks wrong, please contact the school’s finance office.</p>
    </div>
  );
}

function BalanceCard({ balance: b }: { balance: FamilyBalance }) {
  const owing = b.balance > 0;
  const credit = b.balance < 0;
  return (
    <Card>
      <CardBody>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{owing ? "Balance owed" : credit ? "Credit with the school" : "Balance"} ({b.currency})</p>
        <p className="mt-1 text-2xl font-semibold text-foreground tabular-nums">{owing ? formatMoney(b.balance, b.currency) : credit ? formatMoney(Math.abs(b.balance), b.currency) : "Nothing owed"}</p>
        <p className="mt-1 text-xs text-subtle">
          {formatMoney(b.totalPaid, b.currency)} paid of {formatMoney(b.totalCharges, b.currency)} charged
          {b.totalAdjustments > 0 || b.totalRefunded > 0 ? (
            <span className="block">
              {b.totalAdjustments > 0 ? `${formatMoney(b.totalAdjustments, b.currency)} discounts & waivers` : ""}
              {b.totalAdjustments > 0 && b.totalRefunded > 0 ? " · " : ""}
              {b.totalRefunded > 0 ? `${formatMoney(b.totalRefunded, b.currency)} refunded` : ""}
            </span>
          ) : null}
        </p>
      </CardBody>
    </Card>
  );
}

function Pill({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium",
        active ? "border-brand bg-brand text-brand-foreground" : "border-border hover:bg-surface-muted",
      )}
    >
      {children}
    </Link>
  );
}
