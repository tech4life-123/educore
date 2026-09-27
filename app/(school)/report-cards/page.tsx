import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatDate, fullName } from "@/lib/format";
import { formatGrade } from "@/lib/grades/compute";
import { ordinal } from "@/lib/grades/report-card";
import { getCurrentAcademicYear } from "@/services/academics";
import { requireSchoolMember } from "@/services/auth";
import { listGuardianLinks } from "@/services/classes";
import {
  getClassContext,
  getPromotionDecisions,
  getRemarks,
  listClassStudents,
  listIssuedCards,
  listReportCardClasses,
} from "@/services/report-cards";
import { issueReportCards, setPromotion } from "./actions";

export const metadata: Metadata = { title: "Report cards" };

// Issuing a whole class can take a moment.
export const maxDuration = 60;

export default async function ReportCardsPage({ searchParams }: PageProps<"/report-cards">) {
  const { school, profile } = await requireSchoolMember("/report-cards");
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

  const header = (description: string) => (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Report cards</h1>
      <p className="mt-1 text-sm text-muted">{description}</p>
    </div>
  );

  // -------------------------------------------------------- Students & parents
  if (profile.role === "student" || profile.role === "parent") {
    const people =
      profile.role === "student"
        ? [{ id: profile.id, name: fullName(profile) }]
        : (await listGuardianLinks(school.id, profile.id, "children"))
            .map((l) => l.person)
            .filter((p) => p !== null)
            .map((p) => ({ id: p.id, name: fullName(p) }));
    const cards = await listIssuedCards(school.id, { studentIds: people.map((p) => p.id) });
    const nameOf = new Map(people.map((p) => [p.id, p.name]));
    return (
      <div className="space-y-6">
        {header(profile.role === "student" ? "Your issued report cards." : "Your children’s issued report cards.")}
        <Card>
          {cards.length === 0 ? (
            <EmptyState icon="reportCards" title="No report cards yet" description="Report cards appear here when the school issues them." />
          ) : (
            <ul className="divide-y divide-border">
              {cards.map((c) => (
                <li key={c.id}>
                  <Link href={`/report-cards/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-surface-muted">
                    <span>
                      <span className="font-medium text-foreground">
                        {c.data.term.name} · {c.data.yearName}
                      </span>
                      {people.length > 1 ? <span className="ml-2 text-sm text-muted">{nameOf.get(c.studentId)}</span> : null}
                      <span className="block text-xs text-muted">Class {c.data.className} · issued {formatDate(c.issuedAt.slice(0, 10))}</span>
                    </span>
                    <span className="text-sm text-muted">
                      Average <strong className="text-foreground">{formatGrade(c.average)}</strong>
                      {c.rank ? ` · ${ordinal(c.rank)} of ${c.classSize}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    );
  }

  // -------------------------------------------------------- Staff
  const isAdmin = profile.role === "school_admin";
  const year = await getCurrentAcademicYear(school.id);
  if (!year) {
    return (
      <div className="space-y-6">
        {header("Issue and print report cards.")}
        <Card>
          <EmptyState icon="reportCards" title="No current academic year" />
        </Card>
      </div>
    );
  }
  const classes = await listReportCardClasses(school.id, year.id, isAdmin ? undefined : profile.id);
  if (classes.length === 0) {
    return (
      <div className="space-y-6">
        {header(isAdmin ? "Issue and print report cards." : "Report cards for the classes where you are homeroom teacher.")}
        <Card>
          <EmptyState
            icon="classes"
            title={isAdmin ? "No classes this year" : "You aren’t a homeroom teacher this year"}
            description={isAdmin ? undefined : "Homeroom teachers write remarks and print their class’s report cards."}
          />
        </Card>
      </div>
    );
  }

  const cls = classes.find((c) => c.id === one(params.class)) ?? classes[0];
  const ctx = await getClassContext(school.id, cls.id);
  if (!ctx || ctx.terms.length === 0) {
    return (
      <div className="space-y-6">
        {header("Issue and print report cards.")}
        <Card>
          <EmptyState title="This year has no semesters" />
        </Card>
      </div>
    );
  }
  const term =
    ctx.terms.find((t) => t.id === one(params.term)) ??
    [...ctx.terms].reverse().find((t) => t.periods.some((p) => p.published)) ??
    ctx.terms[0];

  const [students, cards, remarks] = await Promise.all([
    listClassStudents(school.id, cls.id, school.code),
    listIssuedCards(school.id, { classId: cls.id, termId: term.id }),
    getRemarks(school.id, term.id, { classId: cls.id }),
  ]);
  const isFinal = ctx.terms[ctx.terms.length - 1].id === term.id && ctx.terms.length > 1;
  const decisions = isFinal ? await getPromotionDecisions(school.id, ctx.year.id, students.map((s) => s.id)) : new Map();
  const cardOf = new Map(cards.map((c) => [c.studentId, c]));
  const publishedCount = term.periods.filter((p) => p.published).length;
  const issuedCount = students.filter((s) => cardOf.has(s.id)).length;
  const href = (c: string, t: string) => `/report-cards?class=${c}&term=${t}`;

  return (
    <div className="space-y-6">
      {header(
        isAdmin
          ? `Issue, review and print report cards for ${year.name}.`
          : "Write remarks and print report cards for your homeroom class.",
      )}

      <nav aria-label="Class" className="flex flex-wrap gap-2">
        {classes.map((c) => (
          <Pill key={c.id} href={href(c.id, term.id)} active={c.id === cls.id}>
            {c.name}
          </Pill>
        ))}
      </nav>
      <nav aria-label="Semester" className="flex flex-wrap gap-2">
        {ctx.terms.map((t) => (
          <Pill key={t.id} href={href(cls.id, t.id)} active={t.id === term.id}>
            {t.name}
          </Pill>
        ))}
      </nav>

      <Card aria-labelledby="rc-title">
        <CardHeader
          titleId="rc-title"
          title={`Class ${cls.name} · ${term.name}`}
          description={`${publishedCount} of ${term.periods.length} grading periods published · ${issuedCount} of ${students.length} cards issued`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/report-cards/remarks?class=${cls.id}&term=${term.id}`} className={buttonClasses("secondary", "sm")}>
                Write remarks
              </Link>
              {issuedCount > 0 ? (
                <a href={`/print/report-cards?class=${cls.id}&term=${term.id}`} target="_blank" rel="noopener" className={buttonClasses("secondary", "sm")}>
                  Print all
                </a>
              ) : null}
              {isAdmin ? (
                <ActionForm action={issueReportCards} compact>
                  <input type="hidden" name="class_id" value={cls.id} />
                  <input type="hidden" name="term_id" value={term.id} />
                  <SubmitButton size="sm" loadingText="Issuing…" disabled={publishedCount === 0}>
                    {issuedCount ? "Re-issue report cards" : "Issue report cards"}
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </div>
          }
        />
        {publishedCount === 0 ? (
          <CardBody className="border-b border-border">
            <Alert tone="info" title="Nothing published yet">
              Report cards show published grades only. {isAdmin ? "Publish at least one grading period on the Grades page first." : "The administrator publishes grades first."}
            </Alert>
          </CardBody>
        ) : isAdmin ? (
          <CardBody className="border-b border-border text-sm text-muted">
            Issuing takes a snapshot of the published grades, averages and class ranks. If grades change later, re-issue.
            Remarks and promotion decisions always show their latest version.
          </CardBody>
        ) : null}

        {students.length === 0 ? (
          <EmptyState icon="students" title="No students in this class" />
        ) : (
          <Table caption={`Report cards for class ${cls.name}`}>
            <THead>
              <TR>
                <TH>Student</TH>
                <TH className="text-right">Average</TH>
                <TH className="text-right">Rank</TH>
                <TH>Remark</TH>
                {isFinal ? <TH>Promotion</TH> : null}
                <TH>Card</TH>
              </TR>
            </THead>
            <TBody>
              {students.map((s) => {
                const card = cardOf.get(s.id);
                const auto = card?.data.promotion ?? null;
                const override = decisions.get(s.id)?.decision ?? null;
                return (
                  <TR key={s.id}>
                    <TD className="font-medium">{s.name}</TD>
                    <TD className="text-right tabular-nums">{card ? formatGrade(card.average) : "—"}</TD>
                    <TD className="text-right tabular-nums">{card?.rank ? `${ordinal(card.rank)} / ${card.classSize}` : "—"}</TD>
                    <TD>{remarks.has(s.id) ? <Badge tone="success">Written</Badge> : <Badge>None</Badge>}</TD>
                    {isFinal ? (
                      <TD>
                        {isAdmin ? (
                          <ActionForm action={setPromotion} compact aria-label={`Promotion for ${s.name}`}>
                            <input type="hidden" name="student_id" value={s.id} />
                            <input type="hidden" name="academic_year_id" value={ctx.year.id} />
                            <div className="flex items-center gap-2">
                              <select
                                name="decision"
                                defaultValue={override ?? "auto"}
                                aria-label={`Promotion for ${s.name}`}
                                className="h-9 rounded-lg border border-border bg-surface px-2 text-sm"
                              >
                                <option value="auto">
                                  Automatic{auto ? ` (${auto === "promoted" ? "promoted" : "not promoted"})` : ""}
                                </option>
                                <option value="promoted">Promoted</option>
                                <option value="not_promoted">Not promoted</option>
                              </select>
                              <SubmitButton size="sm" variant="secondary" loadingText="…">
                                Save
                              </SubmitButton>
                            </div>
                          </ActionForm>
                        ) : (
                          <span className="text-sm">{(override ?? auto) === "promoted" ? "Promoted" : (override ?? auto) === "not_promoted" ? "Not promoted" : "—"}</span>
                        )}
                      </TD>
                    ) : null}
                    <TD>
                      {card ? (
                        <Link href={`/report-cards/${card.id}`} className="text-sm font-medium text-brand underline-offset-4 hover:underline">
                          View
                        </Link>
                      ) : (
                        <span className="text-sm text-subtle">Not issued</span>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
      {!isAdmin ? null : (
        <p className="text-sm text-muted">
          Tip: set a homeroom teacher on each{" "}
          <Link href="/classes" className="font-medium text-brand underline-offset-4 hover:underline">
            class page
          </Link>{" "}
          so they can write their class’s remarks.
        </p>
      )}
    </div>
  );
}

function Pill({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium",
        active ? "border-brand bg-brand text-brand-foreground" : "border-border hover:bg-surface-muted",
      )}
    >
      {children}
    </Link>
  );
}
