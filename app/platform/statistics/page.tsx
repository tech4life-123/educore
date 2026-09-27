import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CountyTable, SchoolTable } from "@/components/platform/statistics-tables";
import { attendanceRate, byCounty, femaleShare, passRate, percent, studentTeacherRatio, totals, whole } from "@/lib/platform-stats";
import { requireSuperAdmin } from "@/services/auth";
import { getPlatformStatistics } from "@/services/platform";

export const metadata: Metadata = { title: "Statistics" };

export default async function PlatformStatisticsPage() {
  await requireSuperAdmin();
  const all = await getPlatformStatistics();
  const schools = all.filter((s) => s.status === "active");
  const excluded = all.length - schools.length;
  const t = totals(schools);
  const counties = byCounty(schools);
  const unrecorded = t.students - t.female - t.male;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Statistics</h1>
          <p className="mt-1 text-sm text-muted">
            Totals across the {schools.length} active {schools.length === 1 ? "school" : "schools"} on EduCore, for each school’s current academic year.
            {excluded ? ` ${excluded} suspended, pending or archived ${excluded === 1 ? "school is" : "schools are"} left out.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/platform/statistics/export" className={buttonClasses("secondary")}>
            Download CSV
          </a>
          <a href="/print/statistics" target="_blank" rel="noopener" className={buttonClasses()}>
            Printable report
          </a>
        </div>
      </div>

      {schools.length === 0 ? (
        <Card>
          <EmptyState icon="reports" title="No active schools yet" description="Statistics appear once schools are running on EduCore." />
        </Card>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Tile label="Schools" value={whole(schools.length)} note={`${counties.length} ${counties.length === 1 ? "county" : "counties"}`} />
            <Tile label="Students" value={whole(t.students)} note={`${whole(t.enrolled)} placed in a class`} />
            <Tile label="Teachers" value={whole(t.teachers)} note={`${studentTeacherRatio(t)} students per teacher`} />
            <Tile label="Girls" value={percent(femaleShare(t))} note="of students with gender recorded" />
            <Tile label="Attendance" value={percent(attendanceRate(t))} note={`${whole(t.att_present + t.att_late + t.att_absent)} marks this year`} />
            <Tile label="Pass rate" value={percent(passRate(t))} note={`${whole(t.graded_students)} students with a report card`} />
          </dl>

          <Card aria-labelledby="gender-title">
            <CardHeader titleId="gender-title" title="Students by gender" />
            <CardBody className="space-y-3">
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={`${t.female} girls, ${t.male} boys, ${unrecorded} not recorded`}>
                {t.students ? (
                  <>
                    <span className="h-full bg-brand" style={{ width: `${(t.female / t.students) * 100}%` }} />
                    <span className="h-full bg-foreground/60" style={{ width: `${(t.male / t.students) * 100}%` }} />
                  </>
                ) : null}
              </div>
              <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <Legend swatch="bg-brand">Girls {whole(t.female)}</Legend>
                <Legend swatch="bg-foreground/60">Boys {whole(t.male)}</Legend>
                <Legend swatch="bg-surface-muted border border-border">Not recorded {whole(unrecorded)}</Legend>
              </ul>
            </CardBody>
          </Card>

          <Card aria-labelledby="county-title">
            <CardHeader titleId="county-title" title="By county" description="Rates are computed from the combined counts, so larger schools weigh more." />
            <CountyTable counties={counties} total={{ ...t, schools: schools.length }} />
          </Card>

          <Card aria-labelledby="school-title">
            <CardHeader titleId="school-title" title="By school" />
            <SchoolTable schools={schools} />
          </Card>

          <p className="text-xs text-muted">
            Attendance counts present and late marks against absences; excused days are left out. The pass rate uses each
            student’s latest issued report card this year, against their school’s passing score. Figures only cover data
            schools have entered in EduCore.
          </p>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</dd>
      <dd className="mt-0.5 text-xs text-muted">{note}</dd>
    </div>
  );
}

function Legend({ swatch, children }: { swatch: string; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-2">
      <span className={`inline-block size-3 rounded-sm ${swatch}`} aria-hidden />
      {children}
    </li>
  );
}
