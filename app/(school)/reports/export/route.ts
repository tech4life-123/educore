import { NextResponse, type NextRequest } from "next/server";
import { formatGrade } from "@/lib/grades/compute";
import { getAcademicYear, getCurrentAcademicYear } from "@/services/academics";
import { requireCapability } from "@/services/auth";
import { getSchoolReport } from "@/services/reports";

/** One row per student: class, attendance this year, result for the semester and any flags. */
export async function GET(request: NextRequest) {
  const { school } = await requireCapability("reports.view", "/reports");
  const current = await getCurrentAcademicYear(school.id);
  const year = current ? await getAcademicYear(school.id, current.id) : null;
  if (!year) return NextResponse.redirect(new URL("/reports", request.url));

  const { report, term, passingScore } = await getSchoolReport(school.id, year, request.nextUrl.searchParams.get("term"));

  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  const header = [
    "Student", "Admission number", "Class", "Gender", "Present", "Late", "Absent", "Excused", "Attendance %",
    `Average (${term?.name ?? "semester"})`, `Result (pass mark ${passingScore})`, "Flags",
  ];
  const lines = [...report.perStudent]
    .sort((a, b) => (a.student.className ?? "~").localeCompare(b.student.className ?? "~", "en", { numeric: true }) || a.student.name.localeCompare(b.student.name))
    .map((w) =>
      [
        w.student.name,
        w.student.admissionNumber,
        w.student.className,
        w.student.gender,
        w.attendance.present,
        w.attendance.late,
        w.attendance.absent,
        w.attendance.excused,
        w.attendance.rate === null ? null : Math.round(w.attendance.rate * 10) / 10,
        w.average === null ? null : formatGrade(w.average),
        w.average === null ? "" : w.failing ? "Fail" : "Pass",
        [w.failing ? "Failing" : "", w.lowAttendance ? "Low attendance" : ""].filter(Boolean).join("; "),
      ]
        .map(cell)
        .join(","),
    );

  const csv = "﻿" + [header.map(cell).join(","), ...lines].join("\r\n");
  const slug = `${school.code}-${year.name}`.replace(/[^A-Za-z0-9-]+/g, "-");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-students.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
