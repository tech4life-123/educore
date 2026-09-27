import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, TextField } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatDate } from "@/lib/format";
import { requireCapability } from "@/services/auth";
import { getAssessment, getGradebook } from "@/services/grades";
import { deleteAssessment, saveScores, updateAssessment } from "../../../actions";

export const metadata: Metadata = { title: "Enter scores" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AssessmentPage({ params, searchParams }: PageProps<"/grades/[classSubjectId]/assessments/[assessmentId]">) {
  const { school, profile } = await requireCapability("grades.enter", "/grades");
  const [{ classSubjectId, assessmentId }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(classSubjectId) || !UUID.test(assessmentId)) notFound();
  const [gb, assessment] = await Promise.all([getGradebook(school.id, classSubjectId), getAssessment(school.id, assessmentId)]);
  if (!gb || !assessment || assessment.class_subject_id !== classSubjectId) notFound();
  const isAdmin = profile.role === "school_admin";
  if (!isAdmin && gb.classSubject.teacherId !== profile.id) notFound();

  const period = gb.terms.flatMap((t) => t.grading_periods).find((p) => p.id === assessment.grading_period_id);
  const published = gb.periodPublished[assessment.grading_period_id];
  const submitted = gb.submissions.some((s) => s.grading_period_id === assessment.grading_period_id);
  const locked = published || (submitted && !isAdmin);
  const scores = new Map(gb.scores.filter((s) => s.assessment_id === assessment.id).map((s) => [s.student_id, s]));
  const isExam = period?.kind === "exam";
  const back = `/grades/${classSubjectId}?period=${assessment.grading_period_id}`;

  return (
    <div className="space-y-6">
      <div>
        <Link href={back} className="text-sm font-medium text-muted hover:text-foreground">
          ← {gb.classSubject.subject?.name} · Class {gb.classSubject.class?.name} · {period?.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{assessment.title}</h1>
        <p className="mt-1 text-sm text-muted">
          Out of {assessment.max_score}
          {assessment.assessed_on ? ` · ${formatDate(assessment.assessed_on)}` : ""} · {scores.size} of {gb.students.length} scored
        </p>
      </div>

      {query.created ? (
        <Alert tone="success" title="Assessment added">
          Enter the scores below and press “Save scores”. You can come back and change them until the period is submitted.
        </Alert>
      ) : null}
      {locked ? (
        <Alert tone="info" title={published ? "This period is published" : "Submitted for review"}>
          {published
            ? "Scores are locked. An administrator must unpublish the period before anything can change."
            : "Scores are locked until an administrator returns the grades to you or publishes them."}
        </Alert>
      ) : null}

      <Card aria-labelledby="scores-title">
        <CardHeader
          titleId="scores-title"
          title="Scores"
          description={`Enter a number from 0 to ${assessment.max_score}. Leave blank if not yet marked; tick “Excused” if the student is excused.`}
        />
        {gb.students.length === 0 ? (
          <EmptyState title="No students in this class" />
        ) : (
          <ActionForm action={saveScores} aria-label="Enter scores">
            <input type="hidden" name="assessment_id" value={assessment.id} />
            <input type="hidden" name="class_subject_id" value={classSubjectId} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] border-collapse text-sm">
                <caption className="sr-only">Scores for {assessment.title}</caption>
                <thead className="bg-surface-muted text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left font-semibold">#</th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold">Student</th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold">Score / {assessment.max_score}</th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold">Excused</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {gb.students.map((student, i) => {
                    const s = scores.get(student.id);
                    const name = `${student.last_name}, ${student.first_name}`;
                    return (
                      <tr key={student.id}>
                        <td className="px-4 py-2 text-subtle tabular-nums">{i + 1}</td>
                        <th scope="row" className="px-4 py-2 text-left font-medium text-foreground">
                          <label htmlFor={`score-${student.id}`}>{name}</label>
                          <input type="hidden" name={`name:${student.id}`} value={name} />
                        </th>
                        <td className="px-4 py-2">
                          <Input
                            id={`score-${student.id}`}
                            name={`score:${student.id}`}
                            inputMode="decimal"
                            autoComplete="off"
                            defaultValue={s && !s.is_excused && s.score !== null ? String(s.score) : ""}
                            disabled={locked}
                            className="h-10 w-24 text-right tabular-nums"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            name={`excused:${student.id}`}
                            aria-label={`${name} is excused`}
                            defaultChecked={s?.is_excused ?? false}
                            disabled={locked}
                            className="h-5 w-5 accent-[var(--brand)]"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!locked ? (
              <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4">
                <SubmitButton loadingText="Saving…">Save scores</SubmitButton>
                <Link href={back} className="text-sm font-medium text-muted hover:text-foreground">
                  Back to the gradebook
                </Link>
              </div>
            ) : null}
          </ActionForm>
        )}
      </Card>

      {!locked ? (
        <Card aria-labelledby="details-title">
          <CardHeader titleId="details-title" title="Assessment details" />
          <CardBody className="space-y-6">
            <ActionForm action={updateAssessment} aria-label="Edit assessment">
              <input type="hidden" name="id" value={assessment.id} />
              <input type="hidden" name="class_subject_id" value={classSubjectId} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <TextField id="a-title" name="title" label="Title" required maxLength={80} defaultValue={assessment.title} />
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
                    defaultValue={assessment.category_id ?? ""}
                    options={gb.categories
                      .filter((c) => c.is_active || c.id === assessment.category_id)
                      .map((c) => ({ value: c.id, label: `${c.name} (${c.weight}%)` }))}
                  />
                )}
                <TextField id="a-max" name="max_score" label="Out of" required inputMode="decimal" defaultValue={String(assessment.max_score)} />
                <TextField id="a-date" name="assessed_on" type="date" label="Date" defaultValue={assessment.assessed_on ?? ""} />
              </div>
              <SubmitButton variant="secondary" loadingText="Saving…">
                Save details
              </SubmitButton>
            </ActionForm>
            <div className="border-t border-border pt-4">
              <ActionForm action={deleteAssessment} compact>
                <input type="hidden" name="id" value={assessment.id} />
                <input type="hidden" name="class_subject_id" value={classSubjectId} />
                <input type="hidden" name="grading_period_id" value={assessment.grading_period_id} />
                <p className="mb-2 text-sm text-muted">Deleting an assessment also deletes its scores.</p>
                <ConfirmButton question={`Delete “${assessment.title}” and its scores?`} confirmLabel="Yes, delete" pendingLabel="Deleting…">
                  Delete assessment
                </ConfirmButton>
              </ActionForm>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
