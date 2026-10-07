import type { Metadata } from "next";
import Link from "next/link";
import { InvoiceForm, type InvoiceLineDefault } from "@/components/finance/invoice-form";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { todayIn } from "@/lib/attendance";
import { requireCapability } from "@/services/auth";
import { getAcademicYear, getCurrentAcademicYear, listAcademicYears } from "@/services/academics";
import { getFinanceSettings, getStudentRef, listFeeStructures, searchFinanceStudents } from "@/services/finance";
import { getSchoolProfile } from "@/services/school";
import { createInvoiceAction } from "../../actions";

export const metadata: Metadata = { title: "New invoice" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function NewInvoicePage({ searchParams }: PageProps<"/finance/invoices/new">) {
  const { school } = await requireCapability("finance.manage", "/finance/invoices/new");
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 60);
  const studentId = one(sp.student);
  const structureId = one(sp.structure);
  const yearParam = one(sp.year);

  const [settings, structures, years, current, students, picked, profile] = await Promise.all([
    getFinanceSettings(),
    listFeeStructures(),
    listAcademicYears(school.id),
    getCurrentAcademicYear(school.id),
    searchFinanceStudents(q, 100),
    studentId ? getStudentRef(studentId) : Promise.resolve(null),
    getSchoolProfile(school.id),
  ]);

  const structure = structures.find((s) => s.id === structureId && s.isActive) ?? null;
  const yearId =
    (years.some((y) => y.id === yearParam) ? yearParam : "") ||
    (structure ? years.find((y) => y.name === structure.academicYear)?.id : undefined) ||
    current?.id ||
    "";
  const yearDetail = yearId ? await getAcademicYear(school.id, yearId) : null;
  const structureTermId = structure?.term ? (yearDetail?.academic_terms.find((t) => t.name === structure.term)?.id ?? "") : "";

  const options = students.map((s) => ({ value: s.studentId, label: `${s.name}${s.admissionNumber ? ` · ${s.admissionNumber}` : ""}` }));
  if (picked && !options.some((o) => o.value === picked.studentId)) {
    options.unshift({ value: picked.studentId, label: `${picked.name}${picked.admissionNumber ? ` · ${picked.admissionNumber}` : ""}` });
  }

  const lines: InvoiceLineDefault[] = (structure?.items ?? [])
    .filter((i) => i.is_active)
    .map((i) => ({ feeItemId: i.id, feeType: i.fee_type, description: i.description ?? "", amount: Number(i.amount).toFixed(2) }));

  const today = todayIn(profile?.timezone ?? "Africa/Monrovia");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Find the student and (optionally) start from a fee structure" description="Applying these refills the form below." />
        <CardBody>
          <form method="get" className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <label htmlFor="q" className="block text-sm font-medium text-foreground">
                Search students
              </label>
              <Input id="q" name="q" defaultValue={q} placeholder="Name or admission number" />
              <input type="hidden" name="student" value={studentId} />
            </div>
            <SelectField id="year" name="year" label="Academic year" options={years.map((y) => ({ value: y.id, label: y.name }))} defaultValue={yearId} />
            <SelectField
              id="structure"
              name="structure"
              label="Fee structure"
              placeholder="None — enter lines by hand"
              options={structures.filter((s) => s.isActive).map((s) => ({ value: s.id, label: `${s.name} (${s.currency})` }))}
              defaultValue={structureId}
            />
            <Button type="submit" variant="secondary">
              Apply
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Invoice details" description="It is saved as a draft. Nothing is charged until you issue it." />
        <CardBody>
          <InvoiceForm
            key={`${q}|${studentId}|${structureId}|${yearId}`}
            action={createInvoiceAction}
            students={options}
            years={years.map((y) => ({ value: y.id, label: y.name }))}
            terms={(yearDetail?.academic_terms ?? []).map((t) => ({ value: t.id, label: t.name }))}
            defaults={{
              studentId,
              yearId,
              termId: structureTermId,
              currency: structure?.currency ?? settings?.default_currency ?? "USD",
              dueDate: "",
            }}
            lines={lines}
          />
          <p className="mt-4 text-xs text-subtle">
            Today is {today}. Terms shown belong to the year chosen above. <Link href="/finance/fees" className="underline">Manage fee structures</Link>.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
