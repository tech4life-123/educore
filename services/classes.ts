import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

/**
 * Classes, class subjects, enrolment and guardian links — read side.
 * All queries use the caller's session; RLS scopes them to the caller's
 * school (and, for enrolments / guardian links, to what the role may see).
 */

type Person = Pick<Tables<"profiles">, "id" | "first_name" | "middle_name" | "last_name">;
export type PersonWithLogin = Person & Pick<Tables<"profiles">, "username" | "email" | "status">;

export interface ClassSummary {
  id: string;
  name: string;
  capacity: number | null;
  grade: { id: string; name: string; sequence: number } | null;
  homeroom: Person | null;
  studentCount: number;
  subjectCount: number;
}

export interface ClassSubjectRow {
  id: string;
  subject: { id: string; name: string; code: string; is_active: boolean } | null;
  teacher: Person | null;
}

export interface EnrolledStudent {
  enrollmentId: string;
  status: Tables<"enrollments">["status"];
  enrolledOn: string;
  student: PersonWithLogin | null;
}

export interface ClassDetail extends Omit<ClassSummary, "studentCount" | "subjectCount"> {
  academic_year: { id: string; name: string; is_current: boolean } | null;
  subjects: ClassSubjectRow[];
  students: EnrolledStudent[];
}

function fail(scope: string, error: { code?: string } | null): never {
  console.error(`[classes] ${scope} failed`, error?.code ?? "unknown");
  throw new Error(`Unable to load ${scope}`);
}

const PERSON = "id, first_name, middle_name, last_name";
const PERSON_LOGIN = `${PERSON}, username, email, status`;

export const listClasses = cache(async (schoolId: string, yearId: string): Promise<ClassSummary[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("classes")
    .select(
      `id, name, capacity,
       grade:grade_levels!classes_grade_fkey(id, name, sequence),
       homeroom:profiles!classes_homeroom_fkey(${PERSON}),
       enrollments(count),
       class_subjects(count)`,
    )
    .eq("school_id", schoolId)
    .eq("academic_year_id", yearId)
    .eq("enrollments.status", "active");
  if (error) fail("classes", error);

  return data
    .map((c) => ({
      id: c.id,
      name: c.name,
      capacity: c.capacity,
      grade: c.grade,
      homeroom: c.homeroom,
      studentCount: c.enrollments[0]?.count ?? 0,
      subjectCount: c.class_subjects[0]?.count ?? 0,
    }))
    .sort((a, b) => (a.grade?.sequence ?? 0) - (b.grade?.sequence ?? 0) || a.name.localeCompare(b.name, "en", { numeric: true }));
});

export const getClass = cache(async (schoolId: string, classId: string): Promise<ClassDetail | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("classes")
    .select(
      `id, name, capacity,
       academic_year:academic_years!classes_year_fkey(id, name, is_current),
       grade:grade_levels!classes_grade_fkey(id, name, sequence),
       homeroom:profiles!classes_homeroom_fkey(${PERSON}),
       class_subjects(id, subject:subjects!class_subjects_subject_fkey(id, name, code, is_active), teacher:profiles!class_subjects_teacher_fkey(${PERSON})),
       enrollments(id, status, enrolled_on, student:profiles!enrollments_student_fkey(${PERSON_LOGIN}))`,
    )
    .eq("school_id", schoolId)
    .eq("id", classId)
    .maybeSingle();
  if (error) fail("class", error);
  if (!data) return null;

  const byName = (a: Person | null, b: Person | null) =>
    `${a?.last_name ?? ""} ${a?.first_name ?? ""}`.localeCompare(`${b?.last_name ?? ""} ${b?.first_name ?? ""}`);

  return {
    id: data.id,
    name: data.name,
    capacity: data.capacity,
    academic_year: data.academic_year,
    grade: data.grade,
    homeroom: data.homeroom,
    subjects: [...data.class_subjects].sort((a, b) => (a.subject?.name ?? "").localeCompare(b.subject?.name ?? "")),
    students: data.enrollments
      .map((e) => ({ enrollmentId: e.id, status: e.status, enrolledOn: e.enrolled_on, student: e.student }))
      .sort((a, b) => byName(a.student, b.student)),
  };
});

/** Active teachers and administrators (who may be homeroom or subject teachers). */
export const listTeachingStaff = cache(async (schoolId: string): Promise<Person[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(PERSON)
    .eq("school_id", schoolId)
    .in("role", ["teacher", "school_admin"])
    .eq("status", "active")
    .order("last_name")
    .order("first_name");
  if (error) fail("teaching staff", error);
  return data;
});

/** Active students with no enrolment in the given academic year. */
export const listUnenrolledStudents = cache(async (schoolId: string, yearId: string): Promise<PersonWithLogin[]> => {
  const supabase = await createClient();
  const [students, enrolled] = await Promise.all([
    supabase
      .from("profiles")
      .select(PERSON_LOGIN)
      .eq("school_id", schoolId)
      .eq("role", "student")
      .eq("status", "active")
      .order("last_name")
      .order("first_name")
      .limit(2000),
    supabase.from("enrollments").select("student_id").eq("school_id", schoolId).eq("academic_year_id", yearId).limit(5000),
  ]);
  if (students.error) fail("students", students.error);
  if (enrolled.error) fail("enrolments", enrolled.error);
  const taken = new Set(enrolled.data.map((e) => e.student_id));
  return students.data.filter((s) => !taken.has(s.id));
});

// ---------------------------------------------------------------------------
// Guardian links
// ---------------------------------------------------------------------------

export interface GuardianLink {
  id: string;
  relationship: string;
  is_primary: boolean;
  person: PersonWithLogin | null;
}

/** Children of a parent, or parents of a student. */
export const listGuardianLinks = cache(
  async (schoolId: string, profileId: string, side: "children" | "parents"): Promise<GuardianLink[]> => {
    const supabase = await createClient();
    const query =
      side === "children"
        ? supabase
            .from("guardian_links")
            .select(`id, relationship, is_primary, person:profiles!guardian_links_student_fkey(${PERSON_LOGIN})`)
            .eq("parent_id", profileId)
        : supabase
            .from("guardian_links")
            .select(`id, relationship, is_primary, person:profiles!guardian_links_parent_fkey(${PERSON_LOGIN})`)
            .eq("student_id", profileId);
    const { data, error } = await query.eq("school_id", schoolId);
    if (error) fail("guardian links", error);
    return data;
  },
);

/** People of one role in the school, for the "link" pickers. */
export const listPeopleByRole = cache(async (schoolId: string, role: "student" | "parent"): Promise<PersonWithLogin[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(PERSON_LOGIN)
    .eq("school_id", schoolId)
    .eq("role", role)
    .in("status", ["active", "invited"])
    .order("last_name")
    .order("first_name")
    .limit(2000);
  if (error) fail(`${role}s`, error);
  return data;
});

export interface SetupCounts {
  currentYear: { id: string; name: string } | null;
  gradeLevels: number;
  subjects: number;
  classes: number;
  teachers: number;
  students: number;
  enrolled: number;
  parents: number;
  linkedStudents: number;
  hasLogo: boolean;
}

/** Real counts for the administrator's setup checklist. */
export async function getSetupCounts(schoolId: string): Promise<SetupCounts> {
  const supabase = await createClient();
  const head = { count: "exact" as const, head: true };
  const { data: year } = await supabase
    .from("academic_years")
    .select("id, name")
    .eq("school_id", schoolId)
    .eq("is_current", true)
    .maybeSingle();

  const [grades, subjects, classes, teachers, students, parents, enrolled, links, school] = await Promise.all([
    supabase.from("grade_levels").select("id", head).eq("school_id", schoolId),
    supabase.from("subjects").select("id", head).eq("school_id", schoolId).eq("is_active", true),
    year
      ? supabase.from("classes").select("id", head).eq("school_id", schoolId).eq("academic_year_id", year.id)
      : Promise.resolve({ count: 0 }),
    supabase.from("profiles").select("id", head).eq("school_id", schoolId).eq("role", "teacher").neq("status", "inactive"),
    supabase.from("profiles").select("id", head).eq("school_id", schoolId).eq("role", "student").eq("status", "active"),
    supabase.from("profiles").select("id", head).eq("school_id", schoolId).eq("role", "parent").neq("status", "inactive"),
    year
      ? supabase.from("enrollments").select("id", head).eq("school_id", schoolId).eq("academic_year_id", year.id).eq("status", "active")
      : Promise.resolve({ count: 0 }),
    supabase.from("guardian_links").select("student_id").eq("school_id", schoolId).limit(5000),
    supabase.from("schools").select("logo_url").eq("id", schoolId).maybeSingle(),
  ]);

  return {
    currentYear: year,
    gradeLevels: grades.count ?? 0,
    subjects: subjects.count ?? 0,
    classes: classes.count ?? 0,
    teachers: teachers.count ?? 0,
    students: students.count ?? 0,
    enrolled: enrolled.count ?? 0,
    parents: parents.count ?? 0,
    linkedStudents: new Set((links.data ?? []).map((l) => l.student_id)).size,
    hasLogo: Boolean(school.data?.logo_url),
  };
}
