import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { RateCell } from "@/components/platform/statistics-tables";
import { MonthChart } from "@/components/reports/month-chart";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PrintButton } from "@/components/ui/print-button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatGrade } from "@/lib/grades/compute";
import { percent, whole } from "@/lib/platform-stats";
import { MIN_DAYS_FOR_WATCH, type Group } from "@/lib/reports";
import { getAcademicYear, getCurrentAcademicYear } from "@/services/academics";
import { requireCapability } from "@/services/auth";
import { getSchoolReport } from "@/services/reports";

export const metadata: Metadata = { title: "Reports" };

const WATCH_LIMIT = 100;

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const { school } = await requireCapability("reports.view", "/reports");
  const params = await searchParams;
  const termParam = typeof params.term === "string" ? params.term : null;

  const current = await getCurrentAcademicYear(school.id);
  const year = current ? await getAcademicYear(school.id, current.id) : null;
  if (!year) {
    return (
      <div className="space-y-6">
        <Header />
        <Card>
          <EmptyState icon="reports" title="No current academic year" description="Set a current academic year under Academic setup to see reports." />
        </Card>
      </div>
    );
  }

  const data = await getSchoolReport(school.id, year, termParam);
  const { report: r, term } = data;
  const ratio = data.teachers ? (r.overall.students / data.teachers).toFixed(1) : null;
  const watch = r.watch.slice(0, WATCH_LIMIT);
  const exportHref = `/reports/export${term ? `?term=${term.id}` : ""}`;

  return (
    <div className="space-y-6">
      <Header
        description={`${school.name} · ${year.name}${term ? ` · results from ${term.name}` : ""}`}
        actions={
          <>
            <a href={exportHref} className={buttonClasses("secondary")}>
              Download CSV
            </a>
            <PrintButton />
          </>
        }
      />

      {data.terms.length > 1 ? (
        <nav aria-label="Semester" className="flex flex-wrap gap-2 print:hidden">
          {data.terms.map((t) => (
            <Link
              key={t.id}
              href={`/reports?term=${t.id}`}
              aria-current={t.id === term?.id ? "page" : undefined}
              className={cn(
                "inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium",
                t.id === term?.id ? "border-brand bg-brand text-brand-foreground" : "border-border hover:bg-surface-muted",
              )}
            >
              {t.name}
              {t.hasCards ? "" : " (no cards yet)"}
            </Link>
          ))}
        </nav>
      ) : null}

      {r.overall.students === 0 ? (
        <Card>
          <EmptyState icon="students" title="No students this year" description="Reports fill in as students are enrolled, registers are taken and report cards are issued." />
        </Card>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Tile label="Students" value={whole(r.overall.students)} note={`${whole(r.female.students)} girls · ${whole(r.male.students)} boys`} />
            <Tile label="Teachers" value={whole(data.teachers)} note={ratio ? `${ratio} students per teacher` : "No active teachers"} />
            <Tile label="Attendance" value={percent(r.overall.attendanceRate)} note={`this year · target ${data.attendanceThreshold}%`} />
            <Tile label="Pass rate" value={percent(r.overall.passRate)} note={`${whole(r.overall.passed)} of ${whole(r.overall.graded)} passed`} />
            <Tile label="Average" value={formatGrade(r.overall.mean)} note={`passing score ${data.passingScore}`} />
            <Tile label="Need attention" value={whole(r.watch.length)} note="failing or often absent" tone={r.watch.length ? "warn" : undefined} />
          </dl>

          {data.cardsIssued === 0 ? (
            <Card>
              <CardBody className="text-sm text-muted">
                No report cards have been issued for {term?.name ?? "this semester"} yet, so results are blank. Issue them on the{" "}
                <Link href="/report-cards" className="font-medium text-brand underline-offset-4 hover:underline">
                  Report cards
                </Link>{" "}
                page; attendance figures below are already live.
              </CardBody>
            </Card>
          ) : null}

          <Card aria-labelledby="months-title" className="break-inside-avoid">
            <CardHeader titleId="months-title" title="Attendance by month" description={`Whole school. The line marks the ${data.attendanceThreshold}% target.`} />
            {r.months.length === 0 ? (
              <EmptyState icon="attendance" title="No registers taken yet this year" />
            ) : (
              <CardBody>
                <MonthChart months={r.months} target={data.attendanceThreshold} />
              </CardBody>
            )}
          </Card>

          <Card aria-labelledby="classes-title">
            <CardHeader titleId="classes-title" title="Classes" description="Attendance is for the year so far; results are from the semester’s issued report cards." />
            {r.classes.length === 0 ? (
              <EmptyState icon="classes" title="No classes this year" />
            ) : (
              <Table caption="Results by class">
                <THead>
                  <TR>
                    <TH>Class</TH>
                    <TH className="text-right">Students</TH>
                    <TH className="text-right">Attendance</TH>
                    <TH className="text-right">Average</TH>
                    <TH className="text-right">Pass rate</TH>
                    <TH>Top student</TH>
                  </TR>
                </THead>
                <TBody>
                  {r.classes.map((c) => (
                    <TR key={c.id}>
                      <TD className="font-medium">
                        <Link href={`/classes/${c.id}`} className="underline-offset-4 hover:underline">
                          {c.name}
                        </Link>
                      </TD>
                      <TD className="text-right tabular-nums">{whole(c.students)}</TD>
                      <TD className="text-right">
                        <RateCell value={c.attendanceRate} />
                      </TD>
                      <TD className="text-right tabular-nums">{formatGrade(c.mean)}</TD>
                      <TD className="text-right">
                        <RateCell value={c.passRate} />
                      </TD>
                      <TD className="text-sm">{c.top ? `${c.top.name} (${formatGrade(c.top.average)})` : "—"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card aria-labelledby="subjects-title">
              <CardHeader titleId="subjects-title" title="Subjects" description="Weakest pass rate first." />
              {r.subjects.length === 0 ? (
                <EmptyState icon="subjects" title="No subject results yet" />
              ) : (
                <Table caption="Results by subject">
                  <THead>
                    <TR>
                      <TH>Subject</TH>
                      <TH className="text-right">Average</TH>
                      <TH className="text-right">Range</TH>
                      <TH className="text-right">Pass rate</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {r.subjects.map((s) => (
                      <TR key={s.code || s.name}>
                        <TD>
                          <span className="font-medium">{s.name}</span>
                          <span className="block text-xs text-muted">{whole(s.graded)} students</span>
                        </TD>
                        <TD className="text-right tabular-nums">{formatGrade(s.mean)}</TD>
                        <TD className="text-right tabular-nums text-sm text-muted">
                          {formatGrade(s.lowest)}–{formatGrade(s.highest)}
                        </TD>
                        <TD className="text-right">
                          <RateCell value={s.passRate} />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </Card>

            <Card aria-labelledby="gender-title">
              <CardHeader titleId="gender-title" title="Girls and boys" description="Students whose gender is recorded in their student record." />
              <Table caption="Results by gender">
                <THead>
                  <TR>
                    <TH>Group</TH>
                    <TH className="text-right">Students</TH>
                    <TH className="text-right">Attendance</TH>
                    <TH className="text-right">Average</TH>
                    <TH className="text-right">Pass rate</TH>
                  </TR>
                </THead>
                <TBody>
                  <GroupRow label="Girls" g={r.female} />
                  <GroupRow label="Boys" g={r.male} />
                  <GroupRow label="All students" g={r.overall} strong />
                </TBody>
              </Table>
              {r.overall.students - r.female.students - r.male.students > 0 ? (
                <CardBody className="border-t border-border text-xs text-muted">
                  {whole(r.overall.students - r.female.students - r.male.students)} students have no gender recorded; add it on their student record.
                </CardBody>
              ) : null}
            </Card>
          </div>

          <Card aria-labelledby="watch-title">
            <CardHeader
              titleId="watch-title"
              title="Students who need attention"
              description={`Failing this semester (average below ${data.passingScore}) or attendance below ${data.attendanceThreshold}% after at least ${MIN_DAYS_FOR_WATCH} school days. Both first.`}
            />
            {r.watch.length === 0 ? (
              <EmptyState icon="check" title="Nobody flagged" description="No student is failing or below the attendance target right now." />
            ) : (
              <>
                <Table caption="Students who need attention">
                  <THead>
                    <TR>
                      <TH>Student</TH>
                      <TH>Class</TH>
                      <TH className="text-right">Average</TH>
                      <TH className="text-right">Attendance</TH>
                      <TH className="text-right">Absences</TH>
                      <TH>Why</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {watch.map((w) => (
                      <TR key={w.student.id}>
                        <TD className="font-medium">
                          <Link href={`/students/${w.student.id}`} className="underline-offset-4 hover:underline">
                            {w.student.name}
                          </Link>
                        </TD>
                        <TD className="text-sm">{w.student.className ?? "—"}</TD>
                        <TD className="text-right tabular-nums">
                          {w.cardId ? (
                            <Link href={`/report-cards/${w.cardId}`} className="underline-offset-4 hover:underline">
                              {formatGrade(w.average)}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TD>
                        <TD className="text-right tabular-nums">{percent(w.attendance.rate)}</TD>
                        <TD className="text-right tabular-nums">{whole(w.attendance.absent)}</TD>
                        <TD>
                          <span className="flex flex-wrap gap-1">
                            {w.failing ? <Badge tone="danger">Failing</Badge> : null}
                            {w.lowAttendance ? <Badge tone="warning">Low attendance</Badge> : null}
                          </span>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                {r.watch.length > WATCH_LIMIT ? (
                  <CardBody className="border-t border-border text-sm text-muted">
                    Showing {WATCH_LIMIT} of {whole(r.watch.length)}. Download the CSV for everyone.
                  </CardBody>
                ) : null}
              </>
            )}
          </Card>

          <p className="text-xs text-muted">
            Attendance = (present + late) ÷ (present + late + absent); excused days don’t count. A student’s result is their
            report card average; a subject’s is its semester average, or its latest published period while the semester is
            still running. Passing means the rounded result reaches the passing score, as on report cards.
          </p>
        </>
      )}
    </div>
  );
}

function Header({ description, actions }: { description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Reports</h1>
        <p className="mt-1 text-sm text-muted">{description ?? "How the school is doing this year."}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2 print:hidden">{actions}</div> : null}
    </div>
  );
}

function Tile({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "warn" }) {
  return (
    <div className={cn("rounded-xl border bg-surface px-4 py-3", tone === "warn" ? "border-warning" : "border-border")}>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</dd>
      <dd className="mt-0.5 text-xs text-muted">{note}</dd>
    </div>
  );
}

function GroupRow({ label, g, strong = false }: { label: string; g: Group; strong?: boolean }) {
  return (
    <TR className={cn(strong && "font-semibold")}>
      <TD>{label}</TD>
      <TD className="text-right tabular-nums">{whole(g.students)}</TD>
      <TD className="text-right tabular-nums">{percent(g.attendanceRate)}</TD>
      <TD className="text-right tabular-nums">{formatGrade(g.mean)}</TD>
      <TD className="text-right tabular-nums">{percent(g.passRate)}</TD>
    </TR>
  );
}
