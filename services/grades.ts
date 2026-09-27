import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import { getAcademicYear, type AcademicTerm } from "./academics";

/**
 * Read side of assessments & grades. Everything runs with the caller's
 * session: RLS decides whose scores come back (a teacher's own class
 * subjects, all of them for an admin, a student's / parent's own published
 * scores).
 */

type Person = Pick<Tables<"profiles">, "id" | "first_name" | "middle_name" | "last_name">;
type PersonWithLogin = Person & Pick<Tables<"profiles">, "username" | "email">;

export type Category = Pick<Tables<"assessment_categories">, "id" | "name" | "weight" | "sequence" | "is_active">;
export type Assessment = Pick<
  Tables<"assessments">,
  "id" | "title" | "max_score" | "assessed_on" | "category_id" | "grading_period_id" | "class_subject_id"
>;
export type Score = Pick<Tables<"assessment_scores">, "assessment_id" | "student_id" | "score" | "is_excused">;
export type Submission = Pick<Tables<"grade_submissions">, "class_subject_id" | "grading_period_id" | "submitted_at"> & {
  submitter: Person | null;
};
export interface GradingSettings {
  passingScore: number;
  examWeight: number;
}

function fail(scope: string, error: { code?: string } | null): never {
  console.error(`[grades] ${scope} failed`, error?.code ?? "unknown");
  throw new Error(`Unable to load ${scope}`);
}

const PERSON = "id, first_name, middle_name, last_name";

export const listCategories = cache(async (schoolId: string): Promise<Category[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assessment_categories")
    .select("id, name, weight, sequence, is_active")
    .eq("school_id", schoolId)
    .order("sequence")
    .order("name");
  if (error) fail("assessment categories", error);
  return data.map((c) => ({ ...c, weight: Number(c.weight) }));
});

export const getGradingSettings = cache(async (schoolId: string): Promise<GradingSettings> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_settings")
    .select("passing_score, exam_weight")
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) fail("grading settings", error);
  return { passingScore: Number(data?.passing_score ?? 70), examWeight: Number(data?.exam_weight ?? 50) };
});

// ---------------------------------------------------------------------------
// Teacher: my class subjects
// ---------------------------------------------------------------------------

export interface TeachingAssignment {
  id: string;
  subject: { name: string; code: string } | null;
  class: { id: string; name: string; academic_year_id: string; grade: { name: string; sequence: number } | null } | null;
  teacher: Person | null;
}

export const listClassSubjectsForYear = cache(
  async (schoolId: string, yearId: string, teacherId?: string): Promise<TeachingAssignment[]> => {
    const supabase = await createClient();
    let query = supabase
      .from("class_subjects")
      .select(
        `id,
         subject:subjects!class_subjects_subject_fkey(name, code),
         class:classes!class_subjects_class_fkey!inner(id, name, academic_year_id, grade:grade_levels!classes_grade_fkey(name, sequence)),
         teacher:profiles!class_subjects_teacher_fkey(${PERSON})`,
      )
      .eq("school_id", schoolId)
      .eq("class.academic_year_id", yearId);
    if (teacherId) query = query.eq("teacher_id", teacherId);
    const { data, error } = await query;
    if (error) fail("teaching assignments", error);
    return data.sort(
      (a, b) =>
        (a.class?.grade?.sequence ?? 0) - (b.class?.grade?.sequence ?? 0) ||
        (a.class?.name ?? "").localeCompare(b.class?.name ?? "", "en", { numeric: true }) ||
        (a.subject?.name ?? "").localeCompare(b.subject?.name ?? ""),
    );
  },
);

// ---------------------------------------------------------------------------
// Gradebook for one class subject
// ---------------------------------------------------------------------------

export interface Gradebook {
  classSubject: {
    id: string;
    teacherId: string | null;
    subject: { name: string; code: string } | null;
    class: { id: string; name: string; academic_year_id: string } | null;
    teacher: Person | null;
  };
  terms: AcademicTerm[];
  periodPublished: Record<string, boolean>;
  students: PersonWithLogin[];
  assessments: Assessment[];
  scores: Score[];
  categories: Category[];
  submissions: Submission[];
  settings: GradingSettings;
}

export const getGradebook = cache(async (schoolId: string, classSubjectId: string): Promise<Gradebook | null> => {
  const supabase = await createClient();
  const { data: cs, error } = await supabase
    .from("class_subjects")
    .select(
      `id, teacher_id,
       subject:subjects!class_subjects_subject_fkey(name, code),
       class:classes!class_subjects_class_fkey(id, name, academic_year_id),
       teacher:profiles!class_subjects_teacher_fkey(${PERSON})`,
    )
    .eq("school_id", schoolId)
    .eq("id", classSubjectId)
    .maybeSingle();
  if (error) fail("class subject", error);
  if (!cs?.class) return null;

  const [year, enrolled, assessments, categories, submissions, settings, periods] = await Promise.all([
    getAcademicYear(schoolId, cs.class.academic_year_id),
    supabase
      .from("enrollments")
      .select(`student:profiles!enrollments_student_fkey(${PERSON}, username, email)`)
      .eq("school_id", schoolId)
      .eq("class_id", cs.class.id),
    supabase
      .from("assessments")
      .select("id, title, max_score, assessed_on, category_id, grading_period_id, class_subject_id")
      .eq("school_id", schoolId)
      .eq("class_subject_id", classSubjectId)
      .order("assessed_on", { ascending: true, nullsFirst: false })
      .order("created_at"),
    listCategories(schoolId),
    supabase
      .from("grade_submissions")
      .select(`class_subject_id, grading_period_id, submitted_at, submitter:profiles!grade_submissions_by_fkey(${PERSON})`)
      .eq("school_id", schoolId)
      .eq("class_subject_id", classSubjectId),
    getGradingSettings(schoolId),
    getPublishedPeriods(schoolId, cs.class.academic_year_id),
  ]);
  if (enrolled.error) fail("enrolled students", enrolled.error);
  if (assessments.error) fail("assessments", assessments.error);
  if (submissions.error) fail("grade submissions", submissions.error);

  const ids = assessments.data.map((a) => a.id);
  let scores: Score[] = [];
  if (ids.length) {
    const { data, error: scoreError } = await supabase
      .from("assessment_scores")
      .select("assessment_id, student_id, score, is_excused")
      .eq("school_id", schoolId)
      .in("assessment_id", ids);
    if (scoreError) fail("scores", scoreError);
    scores = data.map((s) => ({ ...s, score: s.score === null ? null : Number(s.score) }));
  }

  const students = enrolled.data
    .map((e) => e.student)
    .filter((s): s is PersonWithLogin => s !== null)
    .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));

  return {
    classSubject: { id: cs.id, teacherId: cs.teacher_id, subject: cs.subject, class: cs.class, teacher: cs.teacher },
    terms: year?.academic_terms ?? [],
    periodPublished: periods,
    students,
    assessments: assessments.data.map((a) => ({ ...a, max_score: Number(a.max_score) })),
    scores,
    categories,
    submissions: submissions.data,
    settings,
  };
});

export const getAssessment = cache(async (schoolId: string, assessmentId: string): Promise<Assessment | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assessments")
    .select("id, title, max_score, assessed_on, category_id, grading_period_id, class_subject_id")
    .eq("school_id", schoolId)
    .eq("id", assessmentId)
    .maybeSingle();
  if (error) fail("assessment", error);
  return data ? { ...data, max_score: Number(data.max_score) } : null;
});

// ---------------------------------------------------------------------------
// Admin: progress for one grading period
// ---------------------------------------------------------------------------

export interface PeriodProgressRow {
  classSubjectId: string;
  className: string;
  gradeSequence: number;
  subject: string;
  teacher: Person | null;
  students: number;
  assessments: number;
  scoresEntered: number;
  submission: Submission | null;
}

export async function getPeriodProgress(schoolId: string, yearId: string, periodId: string): Promise<PeriodProgressRow[]> {
  const supabase = await createClient();
  const [assignments, assessments, submissions, enrolments] = await Promise.all([
    listClassSubjectsForYear(schoolId, yearId),
    supabase
      .from("assessments")
      .select("id, class_subject_id, assessment_scores(count)")
      .eq("school_id", schoolId)
      .eq("grading_period_id", periodId),
    supabase
      .from("grade_submissions")
      .select(`class_subject_id, grading_period_id, submitted_at, submitter:profiles!grade_submissions_by_fkey(${PERSON})`)
      .eq("school_id", schoolId)
      .eq("grading_period_id", periodId),
    supabase.from("enrollments").select("class_id").eq("school_id", schoolId).eq("academic_year_id", yearId).limit(10000),
  ]);
  if (assessments.error) fail("assessments", assessments.error);
  if (submissions.error) fail("submissions", submissions.error);
  if (enrolments.error) fail("enrolments", enrolments.error);

  const perClass = new Map<string, number>();
  for (const e of enrolments.data) perClass.set(e.class_id, (perClass.get(e.class_id) ?? 0) + 1);
  const perCs = new Map<string, { assessments: number; scores: number }>();
  for (const a of assessments.data) {
    const agg = perCs.get(a.class_subject_id) ?? { assessments: 0, scores: 0 };
    agg.assessments += 1;
    agg.scores += a.assessment_scores[0]?.count ?? 0;
    perCs.set(a.class_subject_id, agg);
  }
  const subs = new Map(submissions.data.map((s) => [s.class_subject_id, s]));

  return assignments.map((cs) => ({
    classSubjectId: cs.id,
    className: cs.class?.name ?? "—",
    gradeSequence: cs.class?.grade?.sequence ?? 0,
    subject: cs.subject?.name ?? "—",
    teacher: cs.teacher,
    students: perClass.get(cs.class?.id ?? "") ?? 0,
    assessments: perCs.get(cs.id)?.assessments ?? 0,
    scoresEntered: perCs.get(cs.id)?.scores ?? 0,
    submission: subs.get(cs.id) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Student / parent: published results for one student
// ---------------------------------------------------------------------------

export interface StudentResults {
  className: string | null;
  yearName: string;
  terms: AcademicTerm[];
  periodPublished: Record<string, boolean>;
  subjects: { classSubjectId: string; name: string; code: string; teacher: Person | null }[];
  assessments: Assessment[];
  scores: Score[];
  categories: Category[];
  settings: GradingSettings;
}

export async function getStudentResults(schoolId: string, studentId: string, yearId: string, yearName: string): Promise<StudentResults> {
  const supabase = await createClient();
  const { data: enrolment, error } = await supabase
    .from("enrollments")
    .select("class:classes!enrollments_class_fkey(id, name)")
    .eq("school_id", schoolId)
    .eq("student_id", studentId)
    .eq("academic_year_id", yearId)
    .maybeSingle();
  if (error) fail("enrolment", error);

  const [year, categories, settings, periods] = await Promise.all([
    getAcademicYear(schoolId, yearId),
    listCategories(schoolId),
    getGradingSettings(schoolId),
    getPublishedPeriods(schoolId, yearId),
  ]);
  const base = {
    yearName,
    terms: year?.academic_terms ?? [],
    periodPublished: periods,
    categories,
    settings,
  };
  if (!enrolment?.class) return { ...base, className: null, subjects: [], assessments: [], scores: [] };

  const { data: classSubjects, error: csError } = await supabase
    .from("class_subjects")
    .select(`id, subject:subjects!class_subjects_subject_fkey(name, code), teacher:profiles!class_subjects_teacher_fkey(${PERSON})`)
    .eq("school_id", schoolId)
    .eq("class_id", enrolment.class.id);
  if (csError) fail("class subjects", csError);

  const csIds = classSubjects.map((c) => c.id);
  const [assessments, scores] = await Promise.all([
    csIds.length
      ? supabase
          .from("assessments")
          .select("id, title, max_score, assessed_on, category_id, grading_period_id, class_subject_id")
          .eq("school_id", schoolId)
          .in("class_subject_id", csIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("assessment_scores")
      .select("assessment_id, student_id, score, is_excused")
      .eq("school_id", schoolId)
      .eq("student_id", studentId),
  ]);
  if (assessments.error) fail("assessments", assessments.error);
  if (scores.error) fail("scores", scores.error);

  return {
    ...base,
    className: enrolment.class.name,
    subjects: classSubjects
      .map((c) => ({ classSubjectId: c.id, name: c.subject?.name ?? "—", code: c.subject?.code ?? "", teacher: c.teacher }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    assessments: assessments.data.map((a) => ({ ...a, max_score: Number(a.max_score) })),
    scores: scores.data.map((s) => ({ ...s, score: s.score === null ? null : Number(s.score) })),
  };
}

/** grading period id → published? for one academic year. */
export const getPublishedPeriods = cache(async (schoolId: string, yearId: string): Promise<Record<string, boolean>> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grading_periods")
    .select("id, published_at, term:academic_terms!grading_periods_term_fkey!inner(academic_year_id)")
    .eq("school_id", schoolId)
    .eq("term.academic_year_id", yearId);
  if (error) fail("grading periods", error);
  return Object.fromEntries(data.map((p) => [p.id, p.published_at !== null]));
});
