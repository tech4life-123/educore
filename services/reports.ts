import "server-only";

import { cache } from "react";
import { fullName } from "@/lib/format";
import { buildSchoolReport, type AttendanceCounts, type CardSubject, type ReportCardInput } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import type { AcademicYearDetail } from "./academics";
import { listReportCardClasses } from "./report-cards";
import { getSchoolSettings } from "./school";
import { listStudents } from "./students";

/**
 * School reports for administrators. Everything is read with the caller's own
 * session, so Row Level Security bounds the figures to their school.
 * Attendance is counted in the database (report_attendance_* functions);
 * results come from the report cards the school has issued.
 */

function fail(scope: string, error: { code?: string } | null): never {
  console.error(`[reports] ${scope} failed`, error?.code ?? "unknown");
  throw new Error(`Unable to load ${scope}`);
}

type RawCard = { id: string; student_id: string; class_id: string; term_id: string; average: number | null; subjects: unknown };

/** All cards issued this year (id, average and per-subject figures only). */
const listYearCards = cache(async (schoolId: string, yearId: string) => {
  const supabase = await createClient();
  const rows: RawCard[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("report_cards")
      .select("id, student_id, class_id, term_id, average, subjects:data->subjects")
      .eq("school_id", schoolId)
      .eq("academic_year_id", yearId)
      .order("id")
      .range(from, from + 999);
    if (error) fail("report cards", error);
    rows.push(...(data as RawCard[]));
    if (data.length < 1000) break;
  }
  return rows;
});

function toSubjects(raw: unknown): CardSubject[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => ({
    name: String(s?.name ?? ""),
    code: String(s?.code ?? ""),
    grades: Array.isArray(s?.grades) ? s.grades.map((g: unknown) => (typeof g === "number" ? g : null)) : [],
    semesterAverage: typeof s?.semesterAverage === "number" ? s.semesterAverage : null,
  }));
}

export async function getSchoolReport(schoolId: string, year: AcademicYearDetail, requestedTermId: string | null) {
  const supabase = await createClient();
  const [students, classes, cards, byStudent, byMonth, teachers, settings] = await Promise.all([
    listStudents(schoolId, { yearId: year.id }),
    listReportCardClasses(schoolId, year.id),
    listYearCards(schoolId, year.id),
    supabase.rpc("report_attendance_by_student", { p_year_id: year.id }),
    supabase.rpc("report_attendance_by_month", { p_year_id: year.id }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("role", "teacher").eq("status", "active"),
    getSchoolSettings(schoolId),
  ]);
  if (byStudent.error) fail("attendance", byStudent.error);
  if (byMonth.error) fail("attendance", byMonth.error);
  if (teachers.error) fail("teachers", teachers.error);

  // Semester: the one asked for, else the latest one with issued cards.
  const termsWithCards = new Set(cards.map((c) => c.term_id));
  const terms = year.academic_terms.map((t) => ({ id: t.id, name: t.name, hasCards: termsWithCards.has(t.id) }));
  const term =
    terms.find((t) => t.id === requestedTermId) ?? [...terms].reverse().find((t) => t.hasCards) ?? terms[terms.length - 1] ?? null;

  const termCards: ReportCardInput[] = cards
    .filter((c) => c.term_id === term?.id)
    .map((c) => ({
      id: c.id,
      studentId: c.student_id,
      classId: c.class_id,
      average: c.average === null ? null : Number(c.average),
      subjects: toSubjects(c.subjects),
    }));

  const attendanceByStudent = new Map<string, AttendanceCounts>(
    byStudent.data.map((r) => [r.student_id, { present: r.present, late: r.late, absent: r.absent, excused: r.excused }]),
  );

  const passingScore = Number(settings?.passing_score ?? 70);
  const attendanceThreshold = Number(settings?.attendance_threshold ?? 75);

  const report = buildSchoolReport({
    students: students.map((s) => ({
      id: s.id,
      name: fullName({ first_name: s.firstName, middle_name: s.middleName, last_name: s.lastName }),
      classId: s.classId,
      className: s.className,
      gender: s.gender,
      admissionNumber: s.admissionNumber,
    })),
    classes: classes.map((c) => ({ id: c.id, name: c.name })),
    cards: termCards,
    attendanceByStudent,
    attendanceByMonth: byMonth.data.map((m) => ({ ...m, classId: m.class_id })),
    passingScore,
    attendanceThreshold,
  });

  return {
    report,
    terms,
    term,
    teachers: teachers.count ?? 0,
    passingScore,
    attendanceThreshold,
    cardsIssued: termCards.length,
  };
}

export type SchoolReportData = Awaited<ReturnType<typeof getSchoolReport>>;
