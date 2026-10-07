import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatMoney, INVOICE_DISPLAY_LABEL, INVOICE_DISPLAY_TONE } from "@/lib/finance";
import { formatDate } from "@/lib/format";
import { requireCapability } from "@/services/auth";
import { listInvoices } from "@/services/finance";

export const metadata: Metadata = { title: "Invoices" };

const FILTERS = ["draft", "issued", "partially_paid", "overdue", "paid", "cancelled"] as const;

export default async function InvoicesPage({ searchParams }: PageProps<"/finance/invoices">) {
  await requireCapability("finance.manage", "/finance/invoices");
  const { status } = await searchParams;
  const filter = typeof status === "string" && (FILTERS as readonly string[]).includes(status) ? status : undefined;
  const invoices = await listInvoices({ displayStatus: filter });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter invoices" className="flex flex-wrap gap-2">
          {[undefined, ...FILTERS].map((f) => (
            <Link
              key={f ?? "all"}
              href={f ? `/finance/invoices?status=${f}` : "/finance/invoices"}
              aria-current={f === filter ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                f === filter ? "border-brand bg-brand-soft font-medium text-foreground" : "border-border text-muted hover:bg-surface-muted",
              )}
            >
              {f ? INVOICE_DISPLAY_LABEL[f] : "All"}
            </Link>
          ))}
        </nav>
        <Link href="/finance/invoices/new" className={buttonClasses("primary")}>
          New invoice
        </Link>
      </div>

      <Card>
        {invoices.length === 0 ? (
          <EmptyState icon="finance" title="No invoices here" description="Create a draft invoice, review it, then issue it to put the charges on the student’s account." />
        ) : (
          <Table caption="Invoices">
            <THead>
              <TR>
                <TH>Invoice</TH>
                <TH>Student</TH>
                <TH>Due</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Balance</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {invoices.map((i) => (
                <TR key={i.invoiceId}>
                  <TD>
                    <Link href={`/finance/invoices/${i.invoiceId}`} className="font-medium underline">
                      {i.invoiceNumber ?? "Draft"}
                    </Link>
                  </TD>
                  <TD>
                    <Link href={`/finance/accounts/${i.studentId}`} className="hover:underline">
                      {i.studentName}
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
    </div>
  );
}
