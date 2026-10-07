import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { PaymentForm } from "@/components/finance/payment-form";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { todayIn } from "@/lib/attendance";
import { formatMoney } from "@/lib/finance";
import { requireCapability } from "@/services/auth";
import { getFinanceSettings, getStudentRef, listInvoices, searchFinanceStudents } from "@/services/finance";
import { getSchoolProfile } from "@/services/school";
import { recordPaymentAction } from "../../actions";

export const metadata: Metadata = { title: "Record a payment" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function NewPaymentPage({ searchParams }: PageProps<"/finance/payments/new">) {
  const { school } = await requireCapability("finance.manage", "/finance/payments/new");
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 60);
  const studentId = one(sp.student);
  const invoiceId = one(sp.invoice);

  const [settings, profile, picked, results] = await Promise.all([
    getFinanceSettings(),
    getSchoolProfile(school.id),
    studentId ? getStudentRef(studentId) : Promise.resolve(null),
    searchFinanceStudents(q, 100),
  ]);

  const options = results.map((s) => ({ value: s.studentId, label: `${s.name}${s.admissionNumber ? ` · ${s.admissionNumber}` : ""}` }));
  if (picked && !options.some((o) => o.value === picked.studentId)) {
    options.unshift({ value: picked.studentId, label: `${picked.name}${picked.admissionNumber ? ` · ${picked.admissionNumber}` : ""}` });
  }

  // Open invoices for the chosen student (issued, still owing).
  const open = picked ? (await listInvoices({ studentId: picked.studentId })).filter((i) => i.status === "issued" && i.balanceDue > 0) : [];
  const chosen = open.find((i) => i.invoiceId === invoiceId);
  const today = todayIn(profile?.timezone ?? "Africa/Monrovia");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="1. Find the student" />
        <CardBody>
          <form method="get" className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <label htmlFor="q" className="block text-sm font-medium text-foreground">
                Search by name or admission number
              </label>
              <Input id="q" name="q" defaultValue={q} placeholder="e.g. Kollie or ADM-001" />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
          {options.length > 0 ? (
            <form method="get" className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <input type="hidden" name="q" value={q} />
              <div className="space-y-1.5">
                <label htmlFor="student" className="block text-sm font-medium text-foreground">
                  Student
                </label>
                <select
                  id="student"
                  name="student"
                  defaultValue={studentId}
                  className="block h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-foreground sm:text-sm"
                >
                  <option value="">Choose…</option>
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit">Continue</Button>
            </form>
          ) : null}
        </CardBody>
      </Card>

      {picked ? (
        <Card>
          <CardHeader title={`2. Payment details — ${picked.name}`} description="It is saved as pending and confirmed in a separate step." />
          <CardBody>
            <PaymentForm
              key={`${picked.studentId}|${invoiceId}`}
              action={recordPaymentAction}
              idempotencyKey={randomUUID()}
              students={[{ value: picked.studentId, label: picked.name }]}
              invoices={open.map((i) => ({
                value: i.invoiceId,
                label: `${i.invoiceNumber} (${i.currency})`,
                currency: i.currency,
                balance: formatMoney(i.balanceDue, i.currency),
              }))}
              defaults={{
                studentId: picked.studentId,
                invoiceId: chosen?.invoiceId ?? "",
                currency: chosen?.currency ?? settings?.default_currency ?? "USD",
                paidOn: today,
              }}
            />
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
