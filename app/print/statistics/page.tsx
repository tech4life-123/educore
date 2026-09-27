import type { Metadata } from "next";
import { CountyTable, SchoolTable } from "@/components/platform/statistics-tables";
import { attendanceRate, byCounty, femaleShare, passRate, percent, studentTeacherRatio, totals, whole } from "@/lib/platform-stats";
import { requireSuperAdmin } from "@/services/auth";
import { getPlatformStatistics } from "@/services/platform";
import { StatisticsToolbar } from "./toolbar";

export const metadata: Metadata = { title: "Statistics report" };

export default async function PrintStatisticsPage() {
  await requireSuperAdmin();
  const all = await getPlatformStatistics();
  const schools = all.filter((s) => s.status === "active");
  const t = totals(schools);
  const counties = byCounty(schools);
  const generated = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "Africa/Monrovia" }).format(new Date());

  const figures: [string, string][] = [
    ["Schools", whole(schools.length)],
    ["Students", whole(t.students)],
    ["Girls", percent(femaleShare(t))],
    ["Teachers", whole(t.teachers)],
    ["Students per teacher", studentTeacherRatio(t)],
    ["Attendance", percent(attendanceRate(t))],
    ["Pass rate", percent(passRate(t))],
  ];

  return (
    <>
      <StatisticsToolbar />
      <article className="statistics-report mx-auto my-6 max-w-[210mm] bg-white p-[12mm] text-neutral-900 shadow print:my-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="border-b-2 border-neutral-900 pb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-600">EduCore · School statistics</p>
          <h1 className="mt-1 text-2xl font-bold">Schools on EduCore — summary by county</h1>
          <p className="mt-1 text-sm text-neutral-700">
            {schools.length} active {schools.length === 1 ? "school" : "schools"} · current academic year of each school · generated {generated}
          </p>
        </header>

        <dl className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
          {figures.map(([label, value]) => (
            <div key={label} className="rounded border border-neutral-300 px-2 py-1.5">
              <dt className="text-[10px] uppercase tracking-wide text-neutral-600">{label}</dt>
              <dd className="text-lg font-bold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        <section className="mt-6 break-inside-avoid">
          <h2 className="mb-2 text-base font-semibold">By county</h2>
          <CountyTable counties={counties} total={{ ...t, schools: schools.length }} dense />
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-base font-semibold">By school</h2>
          <SchoolTable schools={schools} linkSchools={false} />
        </section>

        <footer className="mt-6 border-t border-neutral-300 pt-2 text-[10px] leading-snug text-neutral-600">
          Attendance = present and late marks ÷ (present + late + absent); excused days are left out. Pass rate = students
          whose latest issued report card this year meets their school’s passing score ÷ students with a report card.
          Rates are computed from combined counts. Figures cover only the data schools have entered in EduCore.
        </footer>
      </article>
    </>
  );
}
