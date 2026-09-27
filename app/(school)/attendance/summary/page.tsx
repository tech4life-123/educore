import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { todayIn } from "@/lib/attendance";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { getAcademicYear } from "@/services/academics";
import { getClassAttendance, teachesClass } from "@/services/attendance";
import { requireCapability } from "@/services/auth";
import { getClassContext, listClassStudents } from "@/services/report-cards";
import { getSchoolProfile, getSchoolSettings } from "@/services/school";

export const metadata: Metadata = { title: "Attendance summary" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AttendanceSummaryPage({ searchParams }: PageProps<"/attendance/summary">) {
  const { school, profile } = await requireCapability("grades.enter", "/attendance");
  const params = await searchParams;
  const classId = typeof params.class === "string" && UUID.test(params.class) ? params.class : null;
  if (!classId) notFound();
  const ctx = await getClassContext(school.id, classId);
  if (!ctx) notFound();
  const isAdmin = profile.role === "school_admin";
  if (!isAdmin && !(await teachesClass(school.id, classId, profile.id))) notFound();

  const [year, schoolProfile, settings, students] = await Promise.all([
    getAcademicYear(school.id, ctx.year.id),
    getSchoolProfile(school.id),
    getSchoolSettings(school.id),
    listClassStudents(school.id, classId, school.code),
  ]);
  if (!year) notFound();
  const threshold = Number(settings?.attendance_threshold ?? 75);
  const today = todayIn(schoolProfile?.timezone ?? "Africa/Monrovia");

  const ranges = [
    { key: "year", label: `Whole year (${year.name})`, from: year.starts_on, to: year.ends_on },
    ...year.academic_terms.map((t) => ({ key: t.id, label: t.name, from: t.starts_on ?? year.starts_on, to: t.ends_on ?? year.ends_on })),
  ];
  const range = ranges.find((r) => r.key === params.range) ?? ranges[0];
  const to = range.to < today ? range.to : today;
  const data = range.from <= to ? await getClassAttendance(school.id, classId, range.from, to) : { days: 0, byStudent: new Map() };
  const below = students.filter((s) => {
    const rate = data.byStudent.get(s.id)?.rate;
    return rate != null && Math.round(rate) < threshold;
  }).length;
  const isHomeroom = isAdmin || ctx.homeroomTeacherId === profile.id;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/attendance" className="text-sm font-medium text-muted hover:text-foreground">
          ← Attendance
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Attendance summary · Class {ctx.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {formatDate(range.from)} – {formatDate(to)} · {data.days} school day{data.days === 1 ? "" : "s"} recorded · minimum {threshold}%
        </p>
      </div>

      <nav aria-label="Period" className="flex flex-wrap gap-2">
        {ranges.map((r) => (
          <Pill key={r.key} href={`/attendance/summary?class=${classId}&range=${r.key}`} active={r.key === range.key}>
            {r.label}
          </Pill>
        ))}
        {isHomeroom ? (
          <Link href={`/attendance/register?class=${classId}&date=${today}`} className={cn(buttonClasses("primary", "sm"), "ml-auto")}>
            Take today’s register
          </Link>
        ) : null}
      </nav>

      <Card aria-labelledby="sum-title">
        <CardHeader
          titleId="sum-title"
          title={`${students.length} students`}
          description={below ? `${below} student${below === 1 ? " is" : "s are"} below the ${threshold}% minimum.` : "Rate = (present + late) ÷ (present + late + absent). Excused days don’t count against a student."}
        />
        {students.length === 0 ? (
          <EmptyState icon="students" title="No students in this class" />
        ) : (
          <Table caption={`Attendance summary for class ${ctx.name}`}>
            <THead>
              <TR>
                <TH>Student</TH>
                <TH className="text-right">Present</TH>
                <TH className="text-right">Absent</TH>
                <TH className="text-right">Late</TH>
                <TH className="text-right">Excused</TH>
                <TH className="text-right">Rate</TH>
              </TR>
            </THead>
            <TBody>
              {students.map((s) => {
                const sum = data.byStudent.get(s.id);
                const rate = sum?.rate == null ? null : Math.round(sum.rate);
                return (
                  <TR key={s.id}>
                    <TD className="font-medium">{s.name}</TD>
                    <TD className="text-right tabular-nums">{sum?.present ?? 0}</TD>
                    <TD className="text-right tabular-nums">{sum?.absent ?? 0}</TD>
                    <TD className="text-right tabular-nums">{sum?.late ?? 0}</TD>
                    <TD className="text-right tabular-nums">{sum?.excused ?? 0}</TD>
                    <TD className={cn("text-right font-semibold tabular-nums", rate !== null && rate < threshold && "text-danger")}>
                      {rate === null ? "—" : `${rate}%`}
                      {rate !== null && rate < threshold ? <span className="sr-only"> (below minimum)</span> : null}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
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
