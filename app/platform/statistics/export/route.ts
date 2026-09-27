import { attendanceRate, femaleShare, includeDemoParam, passRate } from "@/lib/platform-stats";
import { requireSuperAdmin } from "@/services/auth";
import { getPlatformStatistics } from "@/services/platform";

/** Per-school statistics as CSV (aggregates only — no individual records). */
export async function GET(request: Request) {
  await requireSuperAdmin();
  const includeDemo = includeDemoParam(new URL(request.url).searchParams.get("demo"));
  const rows = (await getPlatformStatistics()).filter((r) => includeDemo || !r.is_demo);

  const cell = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    // Quote everything; neutralise spreadsheet formulas.
    return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  const pct = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
  const header = [
    "School", "Code", "County", "Status", "Demonstration (fictional)", "Current year", "Students", "Girls", "Boys", "Girls %", "Enrolled in a class",
    "Teachers", "Administrators", "Classes", "Present", "Late", "Absent", "Excused", "Attendance %",
    "Students with report card", "Passed", "Pass rate %", "Passing score",
  ];
  const lines = rows.map((r) =>
    [
      r.name, r.code, r.county, r.status, r.is_demo ? "yes" : "no", r.current_year, r.students, r.female, r.male, pct(femaleShare(r)), r.enrolled,
      r.teachers, r.admins, r.classes, r.att_present, r.att_late, r.att_absent, r.att_excused, pct(attendanceRate(r)),
      r.graded_students, r.passed, pct(passRate(r)), r.passing_score,
    ].map(cell).join(","),
  );
  const csv = "﻿" + [header.map(cell).join(","), ...lines].join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="educore-statistics-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
