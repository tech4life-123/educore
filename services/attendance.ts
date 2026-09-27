import "server-only";

import { createClient } from "@/lib/supabase/server";
import { summarize, type AttendanceStatus, type AttendanceSummary } from "@/lib/attendance";

/**
 * Attendance reads. RLS decides what comes back: admins see the school,
 * teachers the classes they teach, students and parents their own marks.
 */

function fail(scope: string, error: { code?: string } | null): never {
  console.error(`[attendance] ${scope} failed`, error?.code ?? "unknown");
  throw new Error(`Unable to load ${scope}`);
}

export interface Register {
  id: string;
  takenAt: string;
  takenBy: string | null;
  marks: Map<string, { status: AttendanceStatus; note: string | null }>;
}

export async function getRegister(schoolId: string, classId: string, date: string): Promise<Register | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_registers")
    .select("id, taken_at, taker:profiles!attendance_registers_taken_by_fkey(first_name, last_name), attendance_records(student_id, status, note)")
    .eq("school_id", schoolId)
    .eq("class_id", classId)
    .eq("date", date)
    .maybeSingle();
  if (error) fail("register", error);
  if (!data) return null;
  return {
    id: data.id,
    takenAt: data.taken_at,
    takenBy: data.taker ? `${data.taker.first_name} ${data.taker.last_name}` : null,
    marks: new Map(data.attendance_records.map((r) => [r.student_id, { status: r.status, note: r.note }])),
  };
}

export interface DayOverviewRow {
  classId: string;
  className: string;
  gradeSequence: number;
  homeroom: string | null;
  students: number;
  summary: AttendanceSummary | null;
}

/** Every class of the year with its register status for one day (admins). */
export async function getDayOverview(schoolId: string, yearId: string, date: string): Promise<DayOverviewRow[]> {
  const supabase = await createClient();
  const [classes, registers] = await Promise.all([
    supabase
      .from("classes")
      .select(
        "id, name, grade:grade_levels!classes_grade_fkey(sequence), homeroom:profiles!classes_homeroom_fkey(first_name, last_name), enrollments(count)",
      )
      .eq("school_id", schoolId)
      .eq("academic_year_id", yearId)
      .eq("enrollments.status", "active"),
    supabase
      .from("attendance_registers")
      .select("class_id, attendance_records(status)")
      .eq("school_id", schoolId)
      .eq("date", date),
  ]);
  if (classes.error) fail("classes", classes.error);
  if (registers.error) fail("registers", registers.error);
  const byClass = new Map(registers.data.map((r) => [r.class_id, summarize(r.attendance_records.map((m) => m.status))]));
  return classes.data
    .map((c) => ({
      classId: c.id,
      className: c.name,
      gradeSequence: c.grade?.sequence ?? 0,
      homeroom: c.homeroom ? `${c.homeroom.first_name} ${c.homeroom.last_name}` : null,
      students: c.enrollments[0]?.count ?? 0,
      summary: byClass.get(c.id) ?? null,
    }))
    .sort((a, b) => a.gradeSequence - b.gradeSequence || a.className.localeCompare(b.className, "en", { numeric: true }));
}

type MarkRow = { student_id: string; date: string; status: AttendanceStatus; note: string | null };

async function fetchMarks(schoolId: string, filter: { classId?: string; studentIds?: string[] }, from: string, to: string) {
  const supabase = await createClient();
  const rows: MarkRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = supabase
      .from("attendance_records")
      .select("student_id, date, status, note")
      .eq("school_id", schoolId)
      .gte("date", from)
      .lte("date", to)
      .order("date")
      .order("id")
      .range(offset, offset + 999);
    if (filter.classId) query = query.eq("class_id", filter.classId);
    if (filter.studentIds) query = query.in("student_id", filter.studentIds.length ? filter.studentIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data, error } = await query;
    if (error) fail("attendance", error);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

/** Per-student summaries for a class over a date range. */
export async function getClassAttendance(schoolId: string, classId: string, from: string, to: string) {
  const rows = await fetchMarks(schoolId, { classId }, from, to);
  const byStudent = new Map<string, AttendanceStatus[]>();
  for (const r of rows) byStudent.set(r.student_id, [...(byStudent.get(r.student_id) ?? []), r.status]);
  const dates = new Set(rows.map((r) => r.date));
  return { days: dates.size, byStudent: new Map([...byStudent].map(([id, s]) => [id, summarize(s)])) };
}

/** One student's marks over a date range (RLS: self, linked parent, staff). */
export async function getStudentAttendance(schoolId: string, studentId: string, from: string, to: string) {
  const rows = await fetchMarks(schoolId, { studentIds: [studentId] }, from, to);
  return { summary: summarize(rows.map((r) => r.status)), notable: rows.filter((r) => r.status !== "present").reverse() };
}

/** Summaries for several students over a range (report cards). */
export async function getAttendanceSummaries(schoolId: string, studentIds: string[], from: string, to: string) {
  const rows = await fetchMarks(schoolId, { studentIds }, from, to);
  const byStudent = new Map<string, AttendanceStatus[]>();
  for (const r of rows) byStudent.set(r.student_id, [...(byStudent.get(r.student_id) ?? []), r.status]);
  return new Map(studentIds.map((id) => [id, summarize(byStudent.get(id) ?? [])]));
}

/** Whether a teacher teaches a class (homeroom or a subject) — for page access; RLS enforces it independently. */
export async function teachesClass(schoolId: string, classId: string, profileId: string): Promise<boolean> {
  const supabase = await createClient();
  const [homeroom, subject] = await Promise.all([
    supabase.from("classes").select("id").eq("school_id", schoolId).eq("id", classId).eq("homeroom_teacher_id", profileId).maybeSingle(),
    supabase.from("class_subjects").select("id").eq("school_id", schoolId).eq("class_id", classId).eq("teacher_id", profileId).limit(1),
  ]);
  return Boolean(homeroom.data) || Boolean(subject.data?.length);
}
