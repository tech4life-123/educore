import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckboxPicker } from "@/components/classes/checkbox-picker";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { TextField } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { displayLoginId } from "@/lib/auth/login-id";
import { hasCapability, type SchoolRole } from "@/lib/auth/roles";
import { fullName } from "@/lib/format";
import { listGradeLevels, listSubjects } from "@/services/academics";
import { requireCapability } from "@/services/auth";
import { getClass, listTeachingStaff, listUnenrolledStudents } from "@/services/classes";
import {
  addClassSubjects,
  deleteClass,
  enrollStudents,
  removeClassSubject,
  removeEnrollment,
  setSubjectTeacher,
  updateClass,
} from "../actions";

export const metadata: Metadata = { title: "Class" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ClassPage({ params, searchParams }: PageProps<"/classes/[id]">) {
  const { school, profile } = await requireCapability("classes.view", "/classes");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const cls = await getClass(school.id, id);
  if (!cls) notFound();

  const isAdmin = hasCapability(profile.role as SchoolRole, "school.manage");
  const yearId = cls.academic_year?.id ?? "";
  const [grades, staff, subjects, unenrolled] = isAdmin
    ? await Promise.all([
        listGradeLevels(school.id),
        listTeachingStaff(school.id),
        listSubjects(school.id, { activeOnly: true }),
        listUnenrolledStudents(school.id, yearId),
      ])
    : [[], [], [], []];

  const staffOptions = staff.map((t) => ({ value: t.id, label: fullName(t) }));
  const assigned = new Set(cls.subjects.map((s) => s.subject?.id));
  const addableSubjects = subjects.filter((s) => !assigned.has(s.id));
  const activeStudents = cls.students.filter((s) => s.status === "active");
  const seatsLeft = cls.capacity === null ? null : Math.max(cls.capacity - activeStudents.length, 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/classes" className="text-sm font-medium text-muted hover:text-foreground">
          ← Classes
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Class {cls.name}</h1>
          {cls.grade ? <Badge tone="brand">{cls.grade.name}</Badge> : null}
          {cls.academic_year ? (
            <Badge tone={cls.academic_year.is_current ? "success" : "neutral"}>{cls.academic_year.name}</Badge>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted">
          Homeroom teacher: {cls.homeroom ? fullName(cls.homeroom) : "not assigned"} · {activeStudents.length} student
          {activeStudents.length === 1 ? "" : "s"}
          {cls.capacity ? ` of ${cls.capacity}` : ""} · {cls.subjects.length} subject{cls.subjects.length === 1 ? "" : "s"}
        </p>
      </div>

      {query.created ? (
        <Alert tone="success" title={`Class ${cls.name} created`}>
          Next, check the subject teachers and enrol students below.
        </Alert>
      ) : null}

      {/* ----------------------------------------------------------- Subjects */}
      <Card aria-labelledby="subjects-title">
        <CardHeader
          titleId="subjects-title"
          title="Subjects & teachers"
          description={isAdmin ? "Assign who teaches each subject in this class." : undefined}
        />
        {cls.subjects.length === 0 ? (
          <EmptyState icon="subjects" title="No subjects assigned" description={isAdmin ? "Add subjects below." : undefined} />
        ) : (
          <Table caption={`Subjects taught in class ${cls.name}`}>
            <THead>
              <TR>
                <TH>Subject</TH>
                <TH>Teacher</TH>
                {isAdmin ? <TH className="text-right">Remove</TH> : null}
              </TR>
            </THead>
            <TBody>
              {cls.subjects.map((row) => (
                <TR key={row.id}>
                  <TD>
                    <span className="font-medium">{row.subject?.name}</span>{" "}
                    <span className="font-mono text-xs text-muted">{row.subject?.code}</span>
                    {row.subject && !row.subject.is_active ? <Badge className="ml-2">Inactive</Badge> : null}
                  </TD>
                  <TD>
                    {isAdmin ? (
                      <ActionForm action={setSubjectTeacher} compact aria-label={`Teacher for ${row.subject?.name}`}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="class_id" value={cls.id} />
                        <div className="flex items-center gap-2">
                          <label htmlFor={`t-${row.id}`} className="sr-only">
                            Teacher for {row.subject?.name}
                          </label>
                          <select
                            id={`t-${row.id}`}
                            name="teacher_id"
                            defaultValue={row.teacher?.id ?? ""}
                            className="h-10 w-full min-w-40 rounded-lg border border-border bg-surface px-3 text-sm"
                          >
                            <option value="">Not assigned</option>
                            {staffOptions.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          <SubmitButton size="sm" variant="secondary" loadingText="Saving…">
                            Save
                          </SubmitButton>
                        </div>
                      </ActionForm>
                    ) : row.teacher ? (
                      fullName(row.teacher)
                    ) : (
                      <span className="text-subtle">Not assigned</span>
                    )}
                  </TD>
                  {isAdmin ? (
                    <TD className="text-right">
                      <ActionForm action={removeClassSubject} compact>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="class_id" value={cls.id} />
                        <ConfirmButton question="Remove?">Remove</ConfirmButton>
                      </ActionForm>
                    </TD>
                  ) : null}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {isAdmin && addableSubjects.length > 0 ? (
          <CardBody className="border-t border-border">
            <ActionForm action={addClassSubjects} aria-label="Add subjects to this class">
              <input type="hidden" name="class_id" value={cls.id} />
              <p className="text-sm font-semibold text-foreground">Add subjects</p>
              <CheckboxPicker
                key={addableSubjects.map((s) => s.id).join()}
                name="subject_id"
                searchLabel="Search subjects"
                options={addableSubjects.map((s) => ({ value: s.id, label: s.name, detail: s.code }))}
              />
              <SubmitButton loadingText="Adding…">Add selected subjects</SubmitButton>
            </ActionForm>
          </CardBody>
        ) : null}
        {isAdmin && subjects.length === 0 ? (
          <CardBody className="border-t border-border">
            <p className="text-sm text-muted">
              Your school has no active subjects yet.{" "}
              <Link href="/academics/subjects" className="font-medium text-brand underline-offset-4 hover:underline">
                Add subjects
              </Link>
            </p>
          </CardBody>
        ) : null}
      </Card>

      {/* ----------------------------------------------------------- Students */}
      <Card aria-labelledby="students-title">
        <CardHeader
          titleId="students-title"
          title="Students"
          description={seatsLeft !== null ? `${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left` : undefined}
        />
        {cls.students.length === 0 ? (
          <EmptyState icon="students" title="No students enrolled" description={isAdmin ? "Enrol students below." : undefined} />
        ) : (
          <Table caption={`Students in class ${cls.name}`}>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Signs in with</TH>
                <TH>Status</TH>
                {isAdmin ? <TH className="text-right">Remove</TH> : null}
              </TR>
            </THead>
            <TBody>
              {cls.students.map((row) => (
                <TR key={row.enrollmentId}>
                  <TD className="font-medium">
                    {row.student ? (
                      isAdmin ? (
                        <Link href={`/users/${row.student.id}`} className="text-brand underline-offset-4 hover:underline">
                          {fullName(row.student)}
                        </Link>
                      ) : (
                        fullName(row.student)
                      )
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="font-mono text-xs text-muted">{row.student ? displayLoginId(row.student, school.code) : "—"}</TD>
                  <TD>
                    <Badge tone={row.status === "active" ? "success" : "neutral"}>
                      {row.status[0].toUpperCase() + row.status.slice(1)}
                    </Badge>
                  </TD>
                  {isAdmin ? (
                    <TD className="text-right">
                      <ActionForm action={removeEnrollment} compact>
                        <input type="hidden" name="id" value={row.enrollmentId} />
                        <input type="hidden" name="class_id" value={cls.id} />
                        <ConfirmButton question="Remove from class?">Remove</ConfirmButton>
                      </ActionForm>
                    </TD>
                  ) : null}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {isAdmin ? (
          <CardBody className="border-t border-border">
            <ActionForm action={enrollStudents} aria-label="Enrol students">
              <input type="hidden" name="class_id" value={cls.id} />
              <p className="text-sm font-semibold text-foreground">Enrol students</p>
              <p className="text-sm text-muted">
                Only active students who aren’t in any class for {cls.academic_year?.name ?? "this year"} are listed.
              </p>
              <CheckboxPicker
                key={unenrolled.map((s) => s.id).join()}
                name="student_id"
                searchLabel="Search by name or username"
                emptyText="Every active student already has a class this year."
                options={unenrolled.map((s) => ({ value: s.id, label: `${s.last_name}, ${s.first_name}`, detail: s.username ?? s.email ?? "" }))}
              />
              {unenrolled.length > 0 ? <SubmitButton loadingText="Enrolling…">Enrol selected students</SubmitButton> : null}
              {unenrolled.length === 0 ? (
                <ButtonLink href="/users/new" variant="secondary" size="sm">
                  Add a student account
                </ButtonLink>
              ) : null}
            </ActionForm>
          </CardBody>
        ) : null}
      </Card>

      {/* ----------------------------------------------------------- Details */}
      {isAdmin ? (
        <Card aria-labelledby="details-title">
          <CardHeader titleId="details-title" title="Class details" />
          <CardBody className="space-y-6">
            <ActionForm action={updateClass} aria-label="Edit class details">
              <input type="hidden" name="class_id" value={cls.id} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SelectField
                  id="grade_level_id"
                  name="grade_level_id"
                  label="Grade level"
                  required
                  defaultValue={cls.grade?.id}
                  options={grades.map((g) => ({ value: g.id, label: g.name }))}
                />
                <TextField id="class-name" name="name" label="Class name" required maxLength={40} defaultValue={cls.name} />
                <SelectField
                  id="homeroom_teacher_id"
                  name="homeroom_teacher_id"
                  label="Homeroom teacher"
                  placeholder="Not assigned"
                  defaultValue={cls.homeroom?.id ?? ""}
                  options={staffOptions}
                />
                <TextField
                  id="capacity"
                  name="capacity"
                  label="Capacity"
                  inputMode="numeric"
                  placeholder="No limit"
                  defaultValue={cls.capacity?.toString() ?? ""}
                />
              </div>
              <SubmitButton variant="secondary" loadingText="Saving…">
                Save class details
              </SubmitButton>
            </ActionForm>
            <div className="border-t border-border pt-4">
              <ActionForm action={deleteClass} compact>
                <input type="hidden" name="class_id" value={cls.id} />
                <p className="mb-2 text-sm text-muted">A class can be deleted only when no students are enrolled in it.</p>
                <ConfirmButton question={`Delete class ${cls.name}?`} confirmLabel="Yes, delete" pendingLabel="Deleting…">
                  Delete class
                </ConfirmButton>
              </ActionForm>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
