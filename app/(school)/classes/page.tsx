import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TextField } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { hasCapability, type SchoolRole } from "@/lib/auth/roles";
import { fullName } from "@/lib/format";
import { listAcademicYears, listGradeLevels } from "@/services/academics";
import { requireCapability } from "@/services/auth";
import { listClasses, listTeachingStaff } from "@/services/classes";
import { createClass } from "./actions";

export const metadata: Metadata = { title: "Classes" };

export default async function ClassesPage({ searchParams }: PageProps<"/classes">) {
  const { school, profile } = await requireCapability("classes.view", "/classes");
  const role = profile.role as SchoolRole;
  const isAdmin = hasCapability(role, "school.manage");
  const params = await searchParams;
  const years = await listAcademicYears(school.id);
  const requested = typeof params.year === "string" ? params.year : undefined;
  const year = years.find((y) => y.id === requested) ?? years.find((y) => y.is_current) ?? years[0] ?? null;

  if (!year) {
    return (
      <div className="space-y-6">
        <Header isAdmin={isAdmin} />
        <Card>
          <EmptyState
            icon="classes"
            title="No academic year yet"
            description={
              isAdmin
                ? "Classes belong to an academic year. Create your first academic year, then come back to add classes."
                : "Your administrator hasn’t set up an academic year yet."
            }
            action={isAdmin ? <ButtonLink href="/academics">Set up academic years</ButtonLink> : undefined}
          />
        </Card>
      </div>
    );
  }

  const [classes, grades, staff] = await Promise.all([
    listClasses(school.id, year.id),
    isAdmin ? listGradeLevels(school.id) : Promise.resolve([]),
    isAdmin ? listTeachingStaff(school.id) : Promise.resolve([]),
  ]);
  const totalStudents = classes.reduce((n, c) => n + c.studentCount, 0);

  return (
    <div className="space-y-6">
      <Header isAdmin={isAdmin} />
      {params.deleted ? <Alert tone="success" title="Class deleted" /> : null}

      <Card aria-labelledby="classes-title">
        <CardHeader
          titleId="classes-title"
          title={`Classes in ${year.name}`}
          description={`${classes.length} class${classes.length === 1 ? "" : "es"} · ${totalStudents} student${totalStudents === 1 ? "" : "s"} enrolled`}
          action={
            years.length > 1 ? (
              <form method="get" className="flex items-center gap-2">
                <label htmlFor="year" className="text-sm text-muted">
                  Year
                </label>
                <select id="year" name="year" defaultValue={year.id} className="h-10 rounded-lg border border-border bg-surface px-3 text-sm">
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                      {y.is_current ? " (current)" : ""}
                    </option>
                  ))}
                </select>
                <button type="submit" className="h-10 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-muted">
                  Show
                </button>
              </form>
            ) : null
          }
        />
        {classes.length === 0 ? (
          <EmptyState
            icon="classes"
            title="No classes yet"
            description={isAdmin ? "Create your first class below." : "Your administrator hasn’t created classes for this year."}
          />
        ) : (
          <Table caption={`Classes in ${year.name}`}>
            <THead>
              <TR>
                <TH>Class</TH>
                <TH>Grade</TH>
                <TH>Homeroom teacher</TH>
                <TH className="text-right">Students</TH>
                <TH className="text-right">Subjects</TH>
              </TR>
            </THead>
            <TBody>
              {classes.map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium">
                    <Link href={`/classes/${c.id}`} className="text-brand underline-offset-4 hover:underline">
                      {c.name}
                    </Link>
                  </TD>
                  <TD>{c.grade?.name ?? "—"}</TD>
                  <TD>{c.homeroom ? fullName(c.homeroom) : <span className="text-subtle">Not assigned</span>}</TD>
                  <TD className="text-right tabular-nums">
                    {c.studentCount}
                    {c.capacity ? <span className="text-subtle"> / {c.capacity}</span> : null}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {c.subjectCount === 0 ? <Badge tone="warning">None</Badge> : c.subjectCount}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {isAdmin ? (
        <Card aria-labelledby="new-class-title">
          <CardHeader titleId="new-class-title" title="Create a class" description={`The class is created in ${year.name}.`} />
          <CardBody>
            <ActionForm action={createClass} aria-label="Create a class">
              <input type="hidden" name="academic_year_id" value={year.id} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SelectField
                  id="grade_level_id"
                  name="grade_level_id"
                  label="Grade level"
                  required
                  placeholder="Choose…"
                  options={grades.map((g) => ({ value: g.id, label: g.name }))}
                />
                <TextField id="class-name" name="name" label="Class name" required maxLength={40} placeholder="e.g. 10A" />
                <SelectField
                  id="homeroom_teacher_id"
                  name="homeroom_teacher_id"
                  label="Homeroom teacher"
                  placeholder="Not assigned yet"
                  options={staff.map((t) => ({ value: t.id, label: fullName(t) }))}
                />
                <TextField id="capacity" name="capacity" label="Capacity" inputMode="numeric" placeholder="Optional" />
              </div>
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" name="add_all_subjects" defaultChecked className="h-5 w-5 accent-[var(--brand)]" />
                <span className="font-medium text-foreground">Add all active subjects to this class</span>
              </label>
              <SubmitButton loadingText="Creating…">Create class</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function Header({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Classes</h1>
      <p className="mt-1 text-sm text-muted">
        {isAdmin ? "Create classes, assign teachers and subjects, and enrol students." : "Classes, their teachers and students."}
      </p>
    </div>
  );
}
