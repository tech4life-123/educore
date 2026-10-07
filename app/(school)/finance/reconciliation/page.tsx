import type { Metadata } from "next";
import Link from "next/link";
import { LogTransactionForm, AssignTransactionForm } from "@/components/finance/transaction-forms";
import { TransactionActions } from "@/components/finance/transaction-actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { todayIn } from "@/lib/attendance";
import { cn } from "@/lib/cn";
import { formatMoney, METHOD_LABEL, type PaymentMethod } from "@/lib/finance";
import { formatDate } from "@/lib/format";
import { requireCapability } from "@/services/auth";
import { getFinanceSettings, getStudentRef, listInvoices, listTransactions, searchFinanceStudents } from "@/services/finance";
import { getSchoolProfile } from "@/services/school";

export const metadata: Metadata = { title: "Reconciliation" };

const VIEWS = ["unmatched", "matched", "rejected"] as const;
const VIEW_LABEL = { unmatched: "To match", matched: "Matched", rejected: "Rejected" } as const;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ReconciliationPage({ searchParams }: PageProps<"/finance/reconciliation">) {
  const { school } = await requireCapability("finance.manage", "/finance/reconciliation");
  const sp = await searchParams;
  const view = (VIEWS as readonly string[]).includes(one(sp.view)) ? (one(sp.view) as (typeof VIEWS)[number]) : "unmatched";
  const assignId = one(sp.assign);
  const q = one(sp.q).slice(0, 60);
  const studentId = one(sp.student);

  const [settings, profile, rows] = await Promise.all([getFinanceSettings(), getSchoolProfile(school.id), listTransactions(view)]);
  const today = todayIn(profile?.timezone ?? "Africa/Monrovia");
  const assigning = assignId ? (await listTransactions("unmatched")).find((t) => t.id === assignId) : undefined;

  let assignPanel = null;
  if (assigning) {
    const [results, picked] = await Promise.all([searchFinanceStudents(q, 100), studentId ? getStudentRef(studentId) : Promise.resolve(null)]);
    const options = results.map((s) => ({ value: s.studentId, label: `${s.name}${s.admissionNumber ? ` · ${s.admissionNumber}` : ""}` }));
    if (picked && !options.some((o) => o.value === picked.studentId)) {
      options.unshift({ value: picked.studentId, label: `${picked.name}${picked.admissionNumber ? ` · ${picked.admissionNumber}` : ""}` });
    }
    const invoices = picked
      ? (await listInvoices({ studentId: picked.studentId }))
          .filter((i) => i.status === "issued" && i.balanceDue > 0 && i.currency === assigning.currency)
          .map((i) => ({ value: i.invoiceId, label: `${i.invoiceNumber ?? "Invoice"} — owes ${formatMoney(i.balanceDue, i.currency)}` }))
      : [];
    assignPanel = (
      <Card>
        <CardHeader
          title={`Assign ${formatMoney(assigning.amount, assigning.currency)} (${assigning.reference}) to a student`}
          action={<Link href="/finance/reconciliation" className="text-sm underline">Cancel</Link>}
        />
        <CardBody className="space-y-5">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="assign" value={assigning.id} />
            <div className="space-y-1.5">
              <label htmlFor="q" className="block text-sm font-medium text-foreground">Search by name or admission number</label>
              <Input id="q" name="q" defaultValue={q} maxLength={60} className="w-64" />
            </div>
            {picked ? <input type="hidden" name="student" value={picked.studentId} /> : null}
            <Button type="submit" variant="secondary">Search</Button>
          </form>
          <AssignTransactionForm
            key={`${assigning.id}-${picked?.studentId ?? ""}-${q}`}
            transactionId={assigning.id}
            students={options}
            invoices={invoices}
            studentId={picked?.studentId ?? ""}
          />
          {options.length > 0 ? (
            <ul aria-label="Pick a student to load their open invoices" className="flex flex-wrap gap-2 text-sm">
              {options.slice(0, 8).map((o) => (
                <li key={o.value}>
                  <Link href={`/finance/reconciliation?assign=${assigning.id}&student=${o.value}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className="rounded-full border border-border px-3 py-1 hover:bg-surface-muted">
                    {o.label}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {sp.assigned ? <Alert tone="success" title="Assigned">A payment was created from the transaction and posted to the student’s account.</Alert> : null}
      <p className="text-sm text-muted">
        Log what arrived in the school’s bank or mobile-money account, then match each line to a payment someone recorded, or assign it to a student.
        EduCore never matches money automatically: a person decides every line.
      </p>
      {assignPanel}
      <Card>
        <CardHeader title="Log a statement line" />
        <CardBody>
          <LogTransactionForm defaultCurrency={settings?.default_currency ?? "USD"} today={today} />
        </CardBody>
      </Card>

      <nav aria-label="Transaction views" className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={v === "unmatched" ? "/finance/reconciliation" : `/finance/reconciliation?view=${v}`}
            aria-current={v === view ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1 text-sm", v === view ? "border-brand bg-brand-soft font-medium text-foreground" : "border-border text-muted hover:bg-surface-muted")}
          >
            {VIEW_LABEL[v]}
          </Link>
        ))}
      </nav>

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon="finance" title="Nothing here" description={view === "unmatched" ? "Every logged transaction has been dealt with." : "No transactions in this list yet."} />
        ) : (
          <Table caption="Statement transactions">
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Source / reference</TH>
                <TH>Sender</TH>
                <TH className="text-right">Amount</TH>
                <TH>{view === "unmatched" ? "Action" : "Status"}</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((t) => (
                <TR key={t.id}>
                  <TD className="text-sm text-muted">{formatDate(t.transaction_date)}</TD>
                  <TD>
                    <div>{METHOD_LABEL[t.method as PaymentMethod]}</div>
                    <div className="font-mono text-xs text-muted">{t.reference}</div>
                  </TD>
                  <TD className="text-sm">
                    {t.payer_name || "—"}
                    {t.payer_phone ? <div className="text-xs text-muted">{t.payer_phone}</div> : null}
                  </TD>
                  <TD className="text-right">{formatMoney(t.amount, t.currency)}</TD>
                  <TD>
                    {view === "unmatched" ? (
                      <TransactionActions
                        transactionId={t.id}
                        reference={t.reference}
                        suggestions={t.suggestions.map((p) => ({
                          paymentId: p.id,
                          label: `${p.studentName} · ${formatMoney(p.amount, p.currency)} · ${p.reference}`,
                        }))}
                      />
                    ) : (
                      <>
                        <Badge tone={view === "matched" ? "success" : "neutral"}>{VIEW_LABEL[view]}</Badge>
                        {t.notes ? <div className="mt-1 max-w-xs text-xs text-subtle">{t.notes}</div> : null}
                      </>
                    )}
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
