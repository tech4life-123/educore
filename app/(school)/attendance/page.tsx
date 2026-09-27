import type { Metadata } from "next";
import Link from "next/link";
import { RateBadge, SummaryTiles } from "@/components/attendance/summary";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { addDays, isIsoDate, todayIn, weekdayName } from "@/lib/attendance";
import { cn } from "@/lib/cn";
import { formatDate, fullName } from "@/lib/format";
import { getCurrentAcademicYear } from "@/services/academics";
import { getDayOverview, getRegister, getStudentAttendance } from "@/services/attendance";
import { requireSchoolMember } from "@/services/auth";
import { listGuardianLinks } from "@/services/classes";
import { listClassStudents, listReportCardClasses } from "@/services/report-cards";
import { getSchoolProfile, getSchoolSettings } from "@/services/school";

export const metadata: Metadata = { title: "Attendance" };

const STATUS_LABEL = { present: "Present", absent: "Absent", late: "Late", excused: "Excused" } as const;

export default async function AttendancePage({ searchParams }: PageProps<"/attendance">) {
  const { school, profile } = await requireSchoolMember("/attendance");
  const params = await searchParams;
  const [year, schoolProfile, settings] = await Promise.all([
    getCurrentAcademicYear(school.id),
    getSchoolProfile(school.id),
    getSchoolSettings(school.id),
  ]);
  const threshold = Number(settings?.attendance_threshold ?? 75);
  const today = todayIn(schoolProfile?.timezone ?? "Africa/Monrovia");

  const header = (description: string) => (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Attendance</h1>
      <p className="mt-1 text-sm text-muted">{description}</p>
    </div>
  );

  if (!year) {
    return (
      <div className="space-y-6">
        {header("Daily class registers.")}
        <Card>
          <EmptyState icon="attendance" title="No current academic year" />
        </Card>
      </div>
    );
  }
  const to = today < year.ends_on ? today : year.ends_on;

  // ------------------------------------------------ Students & parents
  if (profile.role === "student" || profile.role === "parent") {
    const people =
      profile.role === "student"
        ? [{ id: profile.id, name: fullName(profile) }]
        : (await listGuardianLinks(school.id, profile.id, "children"))
            .map((l) => l.person)
            .filter((p) => p !== null)
            .map((p) => ({ id: p.id, name: fullName(p) }));
    const records = await Promise.all(people.map((p) => getStudentAttendance(school.id, p.id, year.starts_on, to)));
    return (
      <div className="space-y-6">
        {header(`Attendance for ${year.name} so far. The school expects at least ${threshold}%.`)}
        {people.length === 0 ? (
          <Card>
            <EmptyState icon="students" title="No children linked to your account" description="Ask the school office to link your account to your child." />
          </Card>
        ) : null}
        {people.map((p, i) => (
          <Card key={p.id} aria-labelledby={`att-${p.id}`}>
            <CardHeader titleId={`att-${p.id}`} title={p.name} action={<RateBadge summary={records[i].summary} threshold={threshold} />} />
            <SummaryTiles summary={records[i].summary} />
            {records[i].notable.length ? (
              <ul className="divide-y divide-border border-t border-border">
                {records[i].notable.slice(0, 30).map((r) => (
                  <li key={r.date} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                    <span>
                      {weekdayName(r.date)}, {formatDate(r.date)}
                      {r.note ? <span className="ml-2 text-muted">— {r.note}</span> : null}
                    </span>
                    <Badge tone={r.status === "absent" ? "danger" : r.status === "late" ? "warning" : "neutral"}>{STATUS_LABEL[r.status]}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-t border-border px-5 py-3 text-sm text-muted">No absences or late arrivals recorded.</p>
            )}
          </Card>
        ))}
      </div>
    );
  }

  const date = isIsoDate(params.date) && params.date <= today ? params.date : today;
  const isAdmin = profile.role === "school_admin";

  // ------------------------------------------------ Teachers
  if (!isAdmin) {
    const classes = await listReportCardClasses(school.id, year.id, profile.id);
    return (
      <div className="space-y-6">
        {header("Take the daily register for your homeroom class.")}
        {classes.length === 0 ? (
          <Card>
            <EmptyState
              icon="attendance"
              title="You aren’t a homeroom teacher this year"
              description="The homeroom teacher takes each class’s register. You can still see attendance for the classes you teach from the class page."
            />
          </Card>
        ) : (
          await Promise.all(
            classes.map(async (c) => {
              const [register, students] = await Promise.all([getRegister(school.id, c.id, today), listClassStudents(school.id, c.id, school.code)]);
              return (
                <Card key={c.id} aria-labelledby={`c-${c.id}`}>
                  <CardHeader
                    titleId={`c-${c.id}`}
                    title={`Class ${c.name}`}
                    description={`${students.length} students · today (${formatDate(today)}): ${register ? "register taken" : "not taken yet"}`}
                    action={
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/attendance/summary?class=${c.id}`} className={buttonClasses("secondary", "sm")}>
                          Summary
                        </Link>
                        <Link href={`/attendance/register?class=${c.id}&date=${today}`} className={buttonClasses(register ? "secondary" : "primary", "sm")}>
                          {register ? "Edit today’s register" : "Take today’s register"}
                        </Link>
                      </div>
                    }
                  />
                </Card>
              );
            }),
          )
        )}
      </div>
    );
  }

  // ------------------------------------------------ Admins
  const rows = await getDayOverview(school.id, year.id, date);
  const taken = rows.filter((r) => r.summary).length;
  const totals = rows.reduce(
    (t, r) => ({
      present: t.present + (r.summary?.present ?? 0),
      absent: t.absent + (r.summary?.absent ?? 0),
      late: t.late + (r.summary?.late ?? 0),
      excused: t.excused + (r.summary?.excused ?? 0),
    }),
    { present: 0, absent: 0, late: 0, excused: 0 },
  );
  const counted = totals.present + totals.late + totals.absent;

  return (
    <div className="space-y-6">
      {header("Registers across the school. Homeroom teachers take them daily; you can take or correct any register.")}
      <form method="get" className="flex flex-wrap items-center gap-2">
        <Link href={`/attendance?date=${addDays(date, -1)}`} className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-muted">
          ← Previous day
        </Link>
        <label htmlFor="date" className="sr-only">
          Date
        </label>
        <Input id="date" name="date" type="date" defaultValue={date} max={today} className="h-10 w-44" />
        <button type="submit" className="h-10 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-muted">
          Go
        </button>
        {date < today ? (
          <Link href={`/attendance?date=${addDays(date, 1)}`} className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-muted">
            Next day →
          </Link>
        ) : null}
      </form>

      <Card aria-labelledby="day-title">
        <CardHeader
          titleId="day-title"
          title={`${weekdayName(date)}, ${formatDate(date)}`}
          description={`${taken} of ${rows.length} registers taken${counted ? ` · ${Math.round(((totals.present + totals.late) / counted) * 100)}% attendance` : ""} · ${totals.absent} absent · ${totals.late} late · ${totals.excused} excused`}
        />
        {rows.length === 0 ? (
          <EmptyState icon="classes" title="No classes this year" />
        ) : (
          <Table caption={`Registers for ${formatDate(date)}`}>
            <THead>
              <TR>
                <TH>Class</TH>
                <TH>Homeroom teacher</TH>
                <TH className="text-right">Present</TH>
                <TH className="text-right">Absent</TH>
                <TH className="text-right">Late</TH>
                <TH className="text-right">Excused</TH>
                <TH>Register</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.classId}>
                  <TD className="font-medium">
                    <Link href={`/attendance/summary?class=${r.classId}`} className="text-brand underline-offset-4 hover:underline">
                      {r.className}
                    </Link>
                  </TD>
                  <TD>{r.homeroom ?? <span className="text-subtle">Not assigned</span>}</TD>
                  <TD className="text-right tabular-nums">{r.summary ? r.summary.present : "—"}</TD>
                  <TD className={cn("text-right tabular-nums", r.summary?.absent ? "font-semibold text-danger" : "")}>{r.summary ? r.summary.absent : "—"}</TD>
                  <TD className="text-right tabular-nums">{r.summary ? r.summary.late : "—"}</TD>
                  <TD className="text-right tabular-nums">{r.summary ? r.summary.excused : "—"}</TD>
                  <TD>
                    <Link href={`/attendance/register?class=${r.classId}&date=${date}`} className="text-sm font-medium text-brand underline-offset-4 hover:underline">
                      {r.summary ? "View / edit" : r.students ? "Take register" : "—"}
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
