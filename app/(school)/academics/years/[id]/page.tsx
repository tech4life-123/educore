import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, TextField } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { dateRange } from "@/lib/format";
import { getAcademicYear, type AcademicTerm, type GradingPeriod } from "@/services/academics";
import { requireCapability } from "@/services/auth";
import { deleteAcademicYear, setCurrentAcademicYear, updateAcademicYear, updatePeriod } from "../../actions";

export const metadata: Metadata = { title: "Academic year" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AcademicYearPage({ params, searchParams }: PageProps<"/academics/years/[id]">) {
  const { school } = await requireCapability("school.manage", "/academics");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const year = await getAcademicYear(school.id, id);
  if (!year) notFound();

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/academics" className="hover:text-foreground">
          Academic years
        </Link>{" "}
        / <span className="text-foreground">{year.name}</span>
      </nav>

      {query.created ? (
        <Alert tone="success" title={`${year.name} created`}>
          Check the dates of each semester and marking period below and adjust them to your school calendar.
        </Alert>
      ) : null}

      <Card aria-labelledby="year-title">
        <CardHeader
          titleId="year-title"
          title={year.name}
          description={dateRange(year.starts_on, year.ends_on)}
          action={
            year.is_current ? (
              <Badge tone="success">Current year</Badge>
            ) : (
              <ActionForm action={setCurrentAcademicYear} compact>
                <input type="hidden" name="id" value={year.id} />
                <SubmitButton size="sm" variant="secondary" loadingText="Updating…">
                  Make current
                </SubmitButton>
              </ActionForm>
            )
          }
        />
        <CardBody className="space-y-4">
          <ActionForm action={updateAcademicYear} aria-label="Edit academic year">
            <input type="hidden" name="id" value={year.id} />
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField id="y-name" name="name" label="Name" required maxLength={40} defaultValue={year.name} />
              <TextField id="y-start" name="starts_on" type="date" label="First day" required defaultValue={year.starts_on} />
              <TextField id="y-end" name="ends_on" type="date" label="Last day" required defaultValue={year.ends_on} />
            </div>
            <SubmitButton variant="secondary" loadingText="Saving…">
              Save year
            </SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>

      {year.academic_terms.length === 0 ? (
        <Card>
          <EmptyState title="No semesters in this year" description="This year was created without a term structure." />
        </Card>
      ) : (
        year.academic_terms.map((term) => <TermCard key={term.id} term={term} yearId={year.id} />)
      )}

      <Card aria-labelledby="danger-title" className="border-danger/30">
        <CardHeader
          titleId="danger-title"
          title="Delete this academic year"
          description="Only possible while no classes have been created in it. Its semesters and periods are deleted with it."
        />
        <CardBody>
          <ActionForm action={deleteAcademicYear} compact>
            <input type="hidden" name="id" value={year.id} />
            <ConfirmButton question={`Delete ${year.name}?`} confirmLabel="Yes, delete" pendingLabel="Deleting…">
              Delete academic year
            </ConfirmButton>
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}

function TermCard({ term, yearId }: { term: AcademicTerm; yearId: string }) {
  return (
    <Card aria-labelledby={`term-${term.id}`}>
      <CardHeader titleId={`term-${term.id}`} title={term.name} description={dateRange(term.starts_on, term.ends_on)} />
      <CardBody className="space-y-2">
        <PeriodRow table="term" yearId={yearId} item={term} label="Semester" />
        <div className="divide-y divide-border rounded-lg border border-border">
          {term.grading_periods.map((period) => (
            <div key={period.id} className="px-3 py-3">
              <PeriodRow table="period" yearId={yearId} item={period} label={period.kind === "exam" ? "Exam" : "Marking period"} />
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function PeriodRow({
  table,
  yearId,
  item,
  label,
}: {
  table: "term" | "period";
  yearId: string;
  item: Pick<AcademicTerm, "id" | "name" | "starts_on" | "ends_on"> | GradingPeriod;
  label: string;
}) {
  const kind = "kind" in item ? item.kind : null;
  return (
    <ActionForm action={updatePeriod} compact aria-label={`Edit ${item.name}`}>
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="year_id" value={yearId} />
      <input type="hidden" name="table" value={table} />
      <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="space-y-1">
          <label htmlFor={`n-${item.id}`} className="flex items-center gap-2 text-xs font-medium text-muted">
            {label}
            {kind === "exam" ? <Badge tone="warning">Exam</Badge> : null}
          </label>
          <Input id={`n-${item.id}`} name="name" defaultValue={item.name} maxLength={40} required />
        </div>
        <div className="space-y-1">
          <label htmlFor={`s-${item.id}`} className="text-xs font-medium text-muted">
            Starts
          </label>
          <Input id={`s-${item.id}`} name="starts_on" type="date" defaultValue={item.starts_on ?? ""} />
        </div>
        <div className="space-y-1">
          <label htmlFor={`e-${item.id}`} className="text-xs font-medium text-muted">
            Ends
          </label>
          <Input id={`e-${item.id}`} name="ends_on" type="date" defaultValue={item.ends_on ?? ""} />
        </div>
        <SubmitButton variant="secondary" loadingText="Saving…" className="h-11">
          Save
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
