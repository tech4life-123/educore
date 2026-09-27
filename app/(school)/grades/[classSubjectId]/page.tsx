import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TextField } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import { formatDate, fullName } from "@/lib/format";
import { formatGrade, isPassing, studentPeriodGrade, studentTermSummary } from "@/lib/grades/compute";
import { requireCapability } from "@/services/auth";
import { getGradebook, type Gradebook } from "@/services/grades";
import { createAssessment, submitGrades, withdrawSubmission } from "../actions";

export const metadata: Metadata = { title: "Gradebook" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function GradebookPage({ params, searchParams }: PageProps<"/grades/[classSubjectId]">) {
  const { school, profile } = await requireCapability("grades.enter", "/grades");
  const [{ classSubjectId }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(classSubjectId)) notFound();
  const gb = await getGradebook(school.id, classSubjectId);
  if (!gb) notFound();
  const isAdmin = profile.role === "school_admin";
  if (!isAdmin && gb.classSubject.teacherId !== profile.id) notFound();

  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const periods = gb.terms.flatMap((t) => t.grading_periods.map((p) => ({ ...p, termId: t.id })));
  const view = one(query.view);
  const summaryTerm = view.startsWith("term:") ? gb.terms.find((t) => `term:${t.id}` === view) : undefined;
  const period =
    summaryTerm ? undefined : (periods.find((p) => p.id === one(query.period)) ?? periods.find((p) => !gb.periodPublished[p.id]) ?? periods[0]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/grades" className="text-sm font-medium text-muted hover:text-foreground">
          ← Grades
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {gb.classSubject.subject?.name} · Class {gb.classSubject.class?.name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Teacher: {gb.classSubject.teacher ? fullName(gb.classSubject.teacher) : "not assigned"} · {gb.students.length} student
          {gb.students.length === 1 ? "" : "s"} · Passing score {gb.settings.passingScore}
        </p>
      </div>

      <nav aria-label="Grading periods" className="space-y-2">
        {gb.terms.map((term) => (
          <div key={term.id} className="flex flex-wrap items-center gap-2">
            <span className="w-32 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">{term.name}</span>
            {term.grading_periods.map((p) => (
              <Pill key={p.id} href={`/grades/${classSubjectId}?period=${p.id}`} active={p.id === period?.id} done={gb.periodPublished[p.id]}>
                {p.name}
              </Pill>
            ))}
            <Pill href={`/grades/${classSubjectId}?view=term:${term.id}`} active={summaryTerm?.id === term.id}>
              Summary
            </Pill>
          </div>
        ))}
      </nav>

      {gb.students.length === 0 ? (
        <Alert tone="warning" title="No students in this class yet">
          An administrator enrols students on the class page.
        </Alert>
      ) : null}

      {summaryTerm ? <TermSummary gb={gb} termId={summaryTerm.id} /> : null}
      {period ? <PeriodView gb={gb} period={period} isAdmin={isAdmin} deleted={Boolean(query.deleted)} /> : null}
      {!period && !summaryTerm ? (
        <Card>
          <EmptyState title="This academic year has no grading periods" />
        </Card>
      ) : null}
    </div>
  );
}

function Pill({ href, active, done, children }: { href: string; active: boolean; done?: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium",
        active ? "border-brand bg-brand text-brand-foreground" : "border-border hover:bg-surface-muted",
      )}
    >
      {children}
      {done ? <span aria-label="published">✓</span> : null}
    </Link>
  );
}

function PeriodView({
  gb,
  period,
  isAdmin,
  deleted,
}: {
  gb: Gradebook;
  period: Gradebook["terms"][number]["grading_periods"][number];
  isAdmin: boolean;
  deleted: boolean;
}) {
  const csId = gb.classSubject.id;
  const published = gb.periodPublished[period.id];
  const submission = gb.submissions.find((s) => s.grading_period_id === period.id) ?? null;
  const lockedForMe = published || (submission !== null && !isAdmin);
  const assessments = gb.assessments.filter((a) => a.grading_period_id === period.id);
  const categoryName = new Map(gb.categories.map((c) => [c.id, c.name]));
  const scoreOf = new Map(gb.scores.map((s) => [`${s.assessment_id}:${s.student_id}`, s]));
  const isExam = period.kind === "exam";

  return (
    <>
      {deleted ? <Alert tone="success" title="Assessment deleted" /> : null}

      <Card aria-labelledby="period-title">
        <CardHeader
          titleId="period-title"
          title={period.name}
          description={
            published
              ? "Published — students and parents can see these grades. Locked."
              : submission
                ? `Submitted${submission.submitter ? ` by ${fullName(submission.submitter)}` : ""} on ${formatDate(submission.submitted_at)}. ${isAdmin ? "You can still correct scores, or return it to the teacher." : "Locked until an administrator returns or publishes it."}`
                : isExam
                  ? "Exam grade = points earned ÷ points possible."
                  : "Period grade = category averages, weighted by the school’s category weights."
          }
          action={
            published ? (
              <Badge tone="success">Published</Badge>
            ) : submission ? (
              <ActionForm action={withdrawSubmission} compact>
                <input type="hidden" name="class_subject_id" value={csId} />
                <input type="hidden" name="grading_period_id" value={period.id} />
                <SubmitButton size="sm" variant="secondary" loadingText="Working…">
                  {isAdmin ? "Return to teacher" : "Withdraw submission"}
                </SubmitButton>
              </ActionForm>
            ) : assessments.length > 0 ? (
              <ActionForm action={submitGrades} compact>
                <input type="hidden" name="class_subject_id" value={csId} />
                <input type="hidden" name="grading_period_id" value={period.id} />
                <SubmitButton size="sm" loadingText="Submitting…">
                  Submit for review
                </SubmitButton>
              </ActionForm>
            ) : null
          }
        />

        {assessments.length === 0 ? (
          <EmptyState
            icon="assessments"
            title="No assessments in this period yet"
            description={lockedForMe ? undefined : "Add the first one below — a quiz, test, assignment or the exam."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-sm">
              <caption className="sr-only">
                Scores for {period.name}
              </caption>
              <thead className="bg-surface-muted text-xs text-muted">
                <tr>
                  <th scope="col" className="sticky left-0 z-10 bg-surface-muted px-4 py-3 text-left font-semibold uppercase tracking-wide">
                    Student
                  </th>
                  {assessments.map((a) => (
                    <th key={a.id} scope="col" className="min-w-24 px-3 py-2 text-center align-bottom font-medium">
                      <Link href={`/grades/${csId}/assessments/${a.id}`} className="block text-brand underline-offset-4 hover:underline">
                        {a.title}
                      </Link>
                      <span className="block text-[11px] font-normal">
                        {a.category_id ? categoryName.get(a.category_id) : "Exam"} · /{a.max_score}
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-3 text-center font-semibold uppercase tracking-wide">
                    Grade
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {gb.students.map((student) => {
                  const grade = studentPeriodGrade(period, student.id, gb.assessments, gb.scores, gb.categories);
                  const pass = isPassing(grade, gb.settings.passingScore);
                  return (
                    <tr key={student.id}>
                      <th scope="row" className="sticky left-0 bg-surface px-4 py-2 text-left font-medium text-foreground">
                        {student.last_name}, {student.first_name}
                      </th>
                      {assessments.map((a) => {
                        const s = scoreOf.get(`${a.id}:${student.id}`);
                        return (
                          <td key={a.id} className="px-3 py-2 text-center tabular-nums">
                            {s ? s.is_excused ? <span className="text-muted">EX</span> : s.score : <span className="text-subtle">–</span>}
                          </td>
                        );
                      })}
                      <td className={cn("px-3 py-2 text-center font-semibold tabular-nums", pass === false && "text-danger")}>
                        {formatGrade(grade)}
                        {pass === false ? <span className="sr-only"> (below passing)</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {assessments.length > 0 ? (
          <CardBody className="border-t border-border text-xs text-muted">
            Click an assessment title to enter or change scores. “–” = not scored yet (left out of the grade); “EX” = excused.
          </CardBody>
        ) : null}
      </Card>

      {!lockedForMe ? (
        <Card aria-labelledby="new-assessment-title">
          <CardHeader titleId="new-assessment-title" title={`Add an assessment to ${period.name}`} />
          <CardBody>
            <ActionForm action={createAssessment} aria-label="Add an assessment">
              <input type="hidden" name="class_subject_id" value={gb.classSubject.id} />
              <input type="hidden" name="grading_period_id" value={period.id} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <TextField
                  id="a-title"
                  name="title"
                  label="Title"
                  required
                  maxLength={80}
                  placeholder={isExam ? "Semester exam" : "e.g. Quiz 1"}
                  defaultValue={isExam && assessments.length === 0 ? period.name : undefined}
                />
                {isExam ? (
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-foreground">Category</p>
                    <p className="flex h-11 items-center text-sm text-muted">Exam</p>
                  </div>
                ) : (
                  <SelectField
                    id="a-category"
                    name="category_id"
                    label="Category"
                    required
                    placeholder="Choose…"
                    options={gb.categories.filter((c) => c.is_active).map((c) => ({ value: c.id, label: `${c.name} (${c.weight}%)` }))}
                  />
                )}
                <TextField id="a-max" name="max_score" label="Out of" required inputMode="decimal" defaultValue={isExam ? "100" : "20"} />
                <TextField id="a-date" name="assessed_on" type="date" label="Date" />
              </div>
              <SubmitButton loadingText="Adding…">Add and enter scores</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}

function TermSummary({ gb, termId }: { gb: Gradebook; termId: string }) {
  const term = gb.terms.find((t) => t.id === termId)!;
  const { passingScore, examWeight } = gb.settings;
  return (
    <Card aria-labelledby="summary-title">
      <CardHeader
        titleId="summary-title"
        title={`${term.name} summary`}
        description={`Semester average = average of the marking periods × ${100 - examWeight}% + exam × ${examWeight}%.`}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-sm">
          <caption className="sr-only">{term.name} summary</caption>
          <thead className="bg-surface-muted text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-semibold">Student</th>
              {term.grading_periods.map((p) => (
                <th key={p.id} scope="col" className="px-3 py-3 text-center font-semibold">
                  {p.kind === "exam" ? "Exam" : p.name.replace(/ Period$/, "")}
                </th>
              ))}
              <th scope="col" className="px-3 py-3 text-center font-semibold">Sem. avg</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {gb.students.map((student) => {
              const summary = studentTermSummary(term, student.id, gb.assessments, gb.scores, gb.categories, examWeight);
              return (
                <tr key={student.id}>
                  <th scope="row" className="px-4 py-2 text-left font-medium text-foreground">
                    {student.last_name}, {student.first_name}
                  </th>
                  {summary.periods.map((p) => (
                    <GradeCell key={p.periodId} grade={p.grade} passing={passingScore} />
                  ))}
                  <GradeCell grade={summary.average} passing={passingScore} strong />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function GradeCell({ grade, passing, strong = false }: { grade: number | null; passing: number; strong?: boolean }) {
  const pass = isPassing(grade, passing);
  return (
    <td className={cn("px-3 py-2 text-center tabular-nums", strong && "font-semibold", pass === false && "text-danger")}>
      {formatGrade(grade)}
      {pass === false ? <span className="sr-only"> (below passing)</span> : null}
    </td>
  );
}
