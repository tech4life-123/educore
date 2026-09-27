import type { Metadata } from "next";
import Link from "next/link";
import { StudentReport } from "@/components/grades/student-report";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { fullName } from "@/lib/format";
import { getAcademicYear, getCurrentAcademicYear } from "@/services/academics";
import { requireSchoolMember } from "@/services/auth";
import { listGuardianLinks } from "@/services/classes";
import { getPeriodProgress, getPublishedPeriods, getStudentResults, listClassSubjectsForYear } from "@/services/grades";
import { setPeriodPublished } from "./actions";

export const metadata: Metadata = { title: "Grades" };

export default async function GradesPage({ searchParams }: PageProps<"/grades">) {
  const { school, profile } = await requireSchoolMember("/grades");
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const year = await getCurrentAcademicYear(school.id);

  const header = (description: string) => (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Grades</h1>
      <p className="mt-1 text-sm text-muted">{description}</p>
    </div>
  );

  if (!year) {
    return (
      <div className="space-y-6">
        {header("Assessments, marking-period grades and averages.")}
        <Card>
          <EmptyState
            icon="grades"
            title="No current academic year"
            description={profile.role === "school_admin" ? "Set up the academic year first." : "Your school hasn’t set up the academic year yet."}
            action={profile.role === "school_admin" ? <ButtonLink href="/academics">Academic setup</ButtonLink> : undefined}
          />
        </Card>
      </div>
    );
  }

  // ------------------------------------------------------------ Students
  if (profile.role === "student") {
    const results = await getStudentResults(school.id, profile.id, year.id, year.name);
    return (
      <div className="space-y-6">
        {header(`Your published grades for ${year.name}.`)}
        <StudentReport studentName={fullName(profile)} studentId={profile.id} results={results} />
      </div>
    );
  }

  // ------------------------------------------------------------ Parents
  if (profile.role === "parent") {
    const links = await listGuardianLinks(school.id, profile.id, "children");
    const children = links.map((l) => l.person).filter((p) => p !== null);
    if (children.length === 0) {
      return (
        <div className="space-y-6">
          {header("Your children’s published grades.")}
          <Card>
            <EmptyState icon="students" title="No children linked to your account" description="Ask the school office to link your account to your child." />
          </Card>
        </div>
      );
    }
    const child = children.find((c) => c.id === one(params.student)) ?? children[0];
    const results = await getStudentResults(school.id, child.id, year.id, year.name);
    return (
      <div className="space-y-6">
        {header(`Published grades for ${year.name}.`)}
        {children.length > 1 ? (
          <nav aria-label="Choose a child" className="flex flex-wrap gap-2">
            {children.map((c) => (
              <Link
                key={c.id}
                href={`/grades?student=${c.id}`}
                aria-current={c.id === child.id ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium",
                  c.id === child.id ? "border-brand bg-brand text-brand-foreground" : "border-border hover:bg-surface-muted",
                )}
              >
                {c.first_name} {c.last_name}
              </Link>
            ))}
          </nav>
        ) : null}
        <StudentReport studentName={fullName(child)} studentId={child.id} results={results} />
      </div>
    );
  }

  // ------------------------------------------------------------ Teachers
  if (profile.role === "teacher") {
    const mine = await listClassSubjectsForYear(school.id, year.id, profile.id);
    return (
      <div className="space-y-6">
        {header(`Your subjects in ${year.name}. Open one to add assessments and enter scores.`)}
        <Card aria-labelledby="mine-title">
          <CardHeader titleId="mine-title" title="My classes & subjects" />
          {mine.length === 0 ? (
            <EmptyState
              icon="classes"
              title="You aren’t assigned to any subject yet"
              description="An administrator assigns subject teachers on each class page."
            />
          ) : (
            <ul className="divide-y divide-border">
              {mine.map((cs) => (
                <li key={cs.id}>
                  <Link href={`/grades/${cs.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-muted">
                    <span>
                      <span className="font-medium text-foreground">{cs.subject?.name}</span>
                      <span className="ml-2 text-sm text-muted">Class {cs.class?.name}</span>
                    </span>
                    <span className="text-sm font-medium text-brand">Open gradebook →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    );
  }

  // ------------------------------------------------------------ Admins
  const detail = await getAcademicYear(school.id, year.id);
  const allPeriods = (detail?.academic_terms ?? []).flatMap((t) => t.grading_periods.map((p) => ({ ...p, termName: t.name })));
  const publishedMap = await getPublishedPeriods(school.id, year.id);
  const published = new Map(Object.entries(publishedMap));

  const period = allPeriods.find((p) => p.id === one(params.period)) ?? allPeriods.find((p) => !published.get(p.id)) ?? allPeriods[0];
  if (!period) {
    return (
      <div className="space-y-6">
        {header("Review and publish grades.")}
        <Card>
          <EmptyState icon="grades" title={`${year.name} has no grading periods`} action={<ButtonLink href={`/academics/years/${year.id}`}>Open the year</ButtonLink>} />
        </Card>
      </div>
    );
  }
  const rows = (await getPeriodProgress(school.id, year.id, period.id)).sort(
    (a, b) => a.gradeSequence - b.gradeSequence || a.className.localeCompare(b.className, "en", { numeric: true }) || a.subject.localeCompare(b.subject),
  );
  const isPublished = Boolean(published.get(period.id));
  const submitted = rows.filter((r) => r.submission).length;

  return (
    <div className="space-y-6">
      {header(`Follow grade entry, review submissions and publish each grading period of ${year.name}.`)}

      <nav aria-label="Grading periods" className="space-y-2">
        {(detail?.academic_terms ?? []).map((term) => (
          <div key={term.id} className="flex flex-wrap items-center gap-2">
            <span className="w-32 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">{term.name}</span>
            {term.grading_periods.map((p) => (
              <Link
                key={p.id}
                href={`/grades?period=${p.id}`}
                aria-current={p.id === period.id ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium",
                  p.id === period.id ? "border-brand bg-brand text-brand-foreground" : "border-border hover:bg-surface-muted",
                )}
              >
                {p.name}
                {published.get(p.id) ? <span aria-label="published">✓</span> : null}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <Card aria-labelledby="period-title">
        <CardHeader
          titleId="period-title"
          title={`${period.name} · ${period.termName}`}
          description={`${submitted} of ${rows.length} class subjects submitted`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {isPublished ? <Badge tone="success">Published</Badge> : <Badge tone="warning">Not published</Badge>}
              <ActionForm action={setPeriodPublished} compact>
                <input type="hidden" name="grading_period_id" value={period.id} />
                <input type="hidden" name="publish" value={isPublished ? "false" : "true"} />
                <SubmitButton size="sm" variant={isPublished ? "secondary" : "primary"} loadingText={isPublished ? "Unpublishing…" : "Publishing…"}>
                  {isPublished ? "Unpublish" : "Publish to students & parents"}
                </SubmitButton>
              </ActionForm>
            </div>
          }
        />
        {!isPublished && submitted < rows.length && rows.length > 0 ? (
          <CardBody className="border-b border-border">
            <Alert tone="info" title="Not everything is submitted">
              You can publish at any time; publishing locks this period for everyone. Subjects still being graded will show
              whatever has been entered so far.
            </Alert>
          </CardBody>
        ) : null}
        {rows.length === 0 ? (
          <EmptyState icon="classes" title="No class subjects yet" description="Create classes and assign subjects first." action={<ButtonLink href="/classes">Classes</ButtonLink>} />
        ) : (
          <Table caption={`Grade entry progress for ${period.name}`}>
            <THead>
              <TR>
                <TH>Class</TH>
                <TH>Subject</TH>
                <TH>Teacher</TH>
                <TH className="text-right">Assessments</TH>
                <TH className="text-right">Scores entered</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => {
                const expected = r.assessments * r.students;
                return (
                  <TR key={r.classSubjectId}>
                    <TD className="font-medium">{r.className}</TD>
                    <TD>
                      <Link href={`/grades/${r.classSubjectId}?period=${period.id}`} className="text-brand underline-offset-4 hover:underline">
                        {r.subject}
                      </Link>
                    </TD>
                    <TD>{r.teacher ? fullName(r.teacher) : <span className="text-subtle">Not assigned</span>}</TD>
                    <TD className="text-right tabular-nums">{r.assessments}</TD>
                    <TD className="text-right tabular-nums">
                      {expected ? `${r.scoresEntered} / ${expected}` : "—"}
                    </TD>
                    <TD>
                      {r.submission ? (
                        <Badge tone="success">Submitted</Badge>
                      ) : r.assessments ? (
                        <Badge tone="warning">In progress</Badge>
                      ) : (
                        <Badge>Not started</Badge>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <p className="text-sm text-muted">
        Category weights and the exam weight are set in{" "}
        <Link href="/academics/grading" className="font-medium text-brand underline-offset-4 hover:underline">
          Academic setup → Grading
        </Link>
        .
      </p>
    </div>
  );
}
