import "server-only";

import { cache } from "react";
import { displayLoginId } from "@/lib/auth/login-id";
import { fullName } from "@/lib/format";
import { buildReportCards, type CardTerm, type ReportCardData } from "@/lib/grades/report-card";
import { createClient } from "@/lib/supabase/server";
import { getAcademicYear } from "./academics";
import { getGradingSettings, getPublishedPeriods, listCategories } from "./grades";

/**
 * Report cards. Issuing reads every score in the class, which RLS allows only
 * for school admins; the result is stored per student as the card "as
 * issued". Reading uses the caller's session: admins, the homeroom teacher,
 * the student and linked parents see the cards RLS gives them.
 */

function fail(scope: string, error: { code?: string } | null): never {
  console.error(`[report-cards] ${scope} failed`, error?.code ?? "unknown");
  throw new Error(`Unable to load ${scope}`);
}

export interface ClassContext {
  id: string;
  name: string;
  homeroomTeacherId: string | null;
  gradeName: string | null;
  year: { id: string; name: string };
  yearStartsOn: string | null;
  yearEndsOn: string | null;
  terms: CardTerm[];
}

export const getClassContext = cache(async (schoolId: string, classId: string): Promise<ClassContext | null> => {
  const supabase = await createClient();
  const { data: cls, error } = await supabase
    .from("classes")
    .select(
      "id, name, homeroom_teacher_id, grade:grade_levels!classes_grade_fkey(name), year:academic_years!classes_year_fkey(id, name)",
    )
    .eq("school_id", schoolId)
    .eq("id", classId)
    .maybeSingle();
  if (error) fail("class", error);
  if (!cls?.year) return null;
  const [year, published] = await Promise.all([getAcademicYear(schoolId, cls.year.id), getPublishedPeriods(schoolId, cls.year.id)]);
  return {
    id: cls.id,
    name: cls.name,
    homeroomTeacherId: cls.homeroom_teacher_id,
    gradeName: cls.grade?.name ?? null,
    year: cls.year,
    yearStartsOn: year?.starts_on ?? null,
    yearEndsOn: year?.ends_on ?? null,
    terms: (year?.academic_terms ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      sequence: t.sequence,
      startsOn: t.starts_on,
      endsOn: t.ends_on,
      periods: t.grading_periods.map((p) => ({ id: p.id, name: p.name, kind: p.kind, published: Boolean(published[p.id]) })),
    })),
  };
});

/** Build every active student's card for one class and semester (admins only — needs all scores). */
export async function buildClassReportCards(schoolId: string, schoolCode: string, ctx: ClassContext, termId: string) {
  const supabase = await createClient();
  const [classSubjects, enrolments, categories, settings] = await Promise.all([
    supabase
      .from("class_subjects")
      .select("id, subject:subjects!class_subjects_subject_fkey(name, code), teacher:profiles!class_subjects_teacher_fkey(first_name, middle_name, last_name)")
      .eq("school_id", schoolId)
      .eq("class_id", ctx.id),
    supabase
      .from("enrollments")
      .select("student:profiles!enrollments_student_fkey(id, first_name, middle_name, last_name, username, email)")
      .eq("school_id", schoolId)
      .eq("class_id", ctx.id)
      .eq("status", "active"),
    listCategories(schoolId),
    getGradingSettings(schoolId),
  ]);
  if (classSubjects.error) fail("class subjects", classSubjects.error);
  if (enrolments.error) fail("students", enrolments.error);

  const csIds = classSubjects.data.map((c) => c.id);
  const { data: assessments, error: aError } = csIds.length
    ? await supabase
        .from("assessments")
        .select("id, category_id, max_score, grading_period_id, class_subject_id")
        .eq("school_id", schoolId)
        .in("class_subject_id", csIds)
    : { data: [], error: null };
  if (aError) fail("assessments", aError);

  const aIds = assessments.map((a) => a.id);
  const scores: { assessment_id: string; student_id: string; score: number | null; is_excused: boolean }[] = [];
  // Page through scores in chunks of assessments (URL length) and rows (API row limit).
  for (let i = 0; i < aIds.length; i += 100) {
    const chunk = aIds.slice(i, i + 100);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("assessment_scores")
        .select("assessment_id, student_id, score, is_excused")
        .eq("school_id", schoolId)
        .in("assessment_id", chunk)
        .order("id")
        .range(from, from + 999);
      if (error) fail("scores", error);
      scores.push(...data.map((s) => ({ ...s, score: s.score === null ? null : Number(s.score) })));
      if (data.length < 1000) break;
    }
  }

  const students = enrolments.data
    .map((e) => e.student)
    .filter((s) => s !== null)
    .map((s) => ({ id: s.id, name: fullName(s), login: displayLoginId(s, schoolCode) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return buildReportCards({
    className: ctx.name,
    gradeName: ctx.gradeName,
    yearName: ctx.year.name,
    terms: ctx.terms,
    termId,
    subjects: classSubjects.data
      .map((c) => ({
        classSubjectId: c.id,
        name: c.subject?.name ?? "—",
        code: c.subject?.code ?? "",
        teacher: c.teacher ? fullName(c.teacher) : null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    students,
    assessments: assessments.map((a) => ({ ...a, max_score: Number(a.max_score) })),
    scores,
    categories,
    passingScore: settings.passingScore,
    examWeight: settings.examWeight,
  });
}

export interface IssuedCard {
  id: string;
  studentId: string;
  classId: string;
  termId: string;
  academicYearId: string;
  average: number | null;
  rank: number | null;
  classSize: number;
  issuedAt: string;
  data: ReportCardData;
}

type CardRow = {
  id: string;
  student_id: string;
  class_id: string;
  term_id: string;
  academic_year_id: string;
  average: number | null;
  rank: number | null;
  class_size: number;
  issued_at: string;
  data: unknown;
};

const CARD_COLUMNS = "id, student_id, class_id, term_id, academic_year_id, average, rank, class_size, issued_at, data";

function toCard(r: CardRow): IssuedCard {
  return {
    id: r.id,
    studentId: r.student_id,
    classId: r.class_id,
    termId: r.term_id,
    academicYearId: r.academic_year_id,
    average: r.average === null ? null : Number(r.average),
    rank: r.rank,
    classSize: r.class_size,
    issuedAt: r.issued_at,
    data: r.data as ReportCardData,
  };
}

export async function listIssuedCards(schoolId: string, filter: { classId?: string; termId?: string; studentIds?: string[] }) {
  const supabase = await createClient();
  let query = supabase.from("report_cards").select(CARD_COLUMNS).eq("school_id", schoolId).order("issued_at", { ascending: false });
  if (filter.classId) query = query.eq("class_id", filter.classId);
  if (filter.termId) query = query.eq("term_id", filter.termId);
  if (filter.studentIds) query = query.in("student_id", filter.studentIds.length ? filter.studentIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data, error } = await query.limit(500);
  if (error) fail("report cards", error);
  return data.map((r) => toCard(r as CardRow));
}

export async function getIssuedCard(schoolId: string, cardId: string): Promise<IssuedCard | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("report_cards").select(CARD_COLUMNS).eq("school_id", schoolId).eq("id", cardId).maybeSingle();
  if (error) fail("report card", error);
  return data ? toCard(data as CardRow) : null;
}

/** Remarks for a class + semester (or one student), keyed by student id. */
export async function getRemarks(schoolId: string, termId: string, filter: { classId?: string; studentId?: string }) {
  const supabase = await createClient();
  let query = supabase.from("report_card_remarks").select("student_id, remark").eq("school_id", schoolId).eq("term_id", termId);
  if (filter.classId) query = query.eq("class_id", filter.classId);
  if (filter.studentId) query = query.eq("student_id", filter.studentId);
  const { data, error } = await query;
  if (error) fail("remarks", error);
  return new Map(data.map((r) => [r.student_id, r.remark]));
}

export async function getPromotionDecisions(schoolId: string, yearId: string, studentIds: string[]) {
  if (studentIds.length === 0) return new Map<string, { decision: "promoted" | "not_promoted"; note: string | null }>();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("promotion_decisions")
    .select("student_id, decision, note")
    .eq("school_id", schoolId)
    .eq("academic_year_id", yearId)
    .in("student_id", studentIds);
  if (error) fail("promotion decisions", error);
  return new Map(data.map((d) => [d.student_id, { decision: d.decision as "promoted" | "not_promoted", note: d.note }]));
}

/** Classes the caller may manage report cards for: all (admin) or their homeroom classes (teacher). */
export async function listReportCardClasses(schoolId: string, yearId: string, homeroomTeacherId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("classes")
    .select("id, name, grade:grade_levels!classes_grade_fkey(name, sequence)")
    .eq("school_id", schoolId)
    .eq("academic_year_id", yearId);
  if (homeroomTeacherId) query = query.eq("homeroom_teacher_id", homeroomTeacherId);
  const { data, error } = await query;
  if (error) fail("classes", error);
  return data.sort(
    (a, b) => (a.grade?.sequence ?? 0) - (b.grade?.sequence ?? 0) || a.name.localeCompare(b.name, "en", { numeric: true }),
  );
}

/** Active students of a class (for remarks and status tables). */
export async function listClassStudents(schoolId: string, classId: string, schoolCode: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("enrollments")
    .select("student:profiles!enrollments_student_fkey(id, first_name, middle_name, last_name, username, email)")
    .eq("school_id", schoolId)
    .eq("class_id", classId)
    .eq("status", "active");
  if (error) fail("students", error);
  return data
    .map((e) => e.student)
    .filter((s) => s !== null)
    .map((s) => ({ id: s.id, name: fullName(s), sortName: `${s.last_name} ${s.first_name}`, login: displayLoginId(s, schoolCode) }))
    .sort((a, b) => a.sortName.localeCompare(b.sortName));
}
