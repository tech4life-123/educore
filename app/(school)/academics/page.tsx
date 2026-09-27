import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TextField } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { dateRange } from "@/lib/format";
import { listAcademicYears } from "@/services/academics";
import { requireCapability } from "@/services/auth";
import { createAcademicYear, setCurrentAcademicYear } from "./actions";

export const metadata: Metadata = { title: "Academic years" };

/** Suggest the next Liberian academic year (September to July). */
function suggestion(existing: string[]) {
  const now = new Date();
  let start = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  while (existing.includes(`${start}/${start + 1}`)) start += 1;
  return { name: `${start}/${start + 1}`, starts_on: `${start}-09-01`, ends_on: `${start + 1}-07-15` };
}

export default async function AcademicYearsPage({ searchParams }: PageProps<"/academics">) {
  const { school } = await requireCapability("school.manage", "/academics");
  const [years, params] = await Promise.all([listAcademicYears(school.id), searchParams]);
  const next = suggestion(years.map((y) => y.name));

  return (
    <div className="space-y-6">
      {params.deleted ? <Alert tone="success" title="Academic year deleted" /> : null}

      <Card aria-labelledby="years-title">
        <CardHeader
          titleId="years-title"
          title="Academic years"
          description="The current year is used everywhere by default — classes, enrolment and, later, attendance and grades."
        />
        {years.length === 0 ? (
          <EmptyState
            icon="attendance"
            title="No academic years yet"
            description="Create your first academic year below. The Liberian template adds two semesters, each with three marking periods and an exam."
          />
        ) : (
          <Table caption="Academic years">
            <THead>
              <TR>
                <TH>Year</TH>
                <TH>Dates</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {years.map((year) => (
                <TR key={year.id}>
                  <TD className="font-medium">
                    <Link href={`/academics/years/${year.id}`} className="text-brand underline-offset-4 hover:underline">
                      {year.name}
                    </Link>
                  </TD>
                  <TD className="text-muted">{dateRange(year.starts_on, year.ends_on)}</TD>
                  <TD>{year.is_current ? <Badge tone="success">Current</Badge> : <Badge>Not current</Badge>}</TD>
                  <TD className="text-right">
                    {year.is_current ? null : (
                      <ActionForm action={setCurrentAcademicYear} compact className="inline-block">
                        <input type="hidden" name="id" value={year.id} />
                        <SubmitButton variant="secondary" size="sm" loadingText="Updating…">
                          Make current
                        </SubmitButton>
                      </ActionForm>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card aria-labelledby="new-year-title">
        <CardHeader titleId="new-year-title" title="Create an academic year" />
        <CardBody>
          <ActionForm action={createAcademicYear} aria-label="Create an academic year">
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField id="year-name" name="name" label="Name" required defaultValue={next.name} maxLength={40} hint="For example 2026/2027." />
              <TextField id="year-start" name="starts_on" type="date" label="First day" required defaultValue={next.starts_on} />
              <TextField id="year-end" name="ends_on" type="date" label="Last day" required defaultValue={next.ends_on} />
            </div>
            <input type="hidden" name="template" value="liberia" />
            <p className="text-sm text-muted">
              The year is created with the Liberian structure: <strong className="text-foreground">two semesters</strong>, each
              with <strong className="text-foreground">three marking periods and a semester exam</strong>. Dates are spread
              evenly — you can rename and re-date every period afterwards.
            </p>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="make_current" defaultChecked={years.length === 0 || !years.some((y) => y.is_current)} className="h-5 w-5 accent-[var(--brand)]" />
              <span className="font-medium text-foreground">Make this the current academic year</span>
            </label>
            <SubmitButton loadingText="Creating…">Create academic year</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}
