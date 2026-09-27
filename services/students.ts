import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

/**
 * Students directory and student records. Reads use the caller's session:
 * admins see every student; teachers see personal details only for the
 * students they teach (RLS), and the directory lists only those students.
 */

export type StudentDetails = Omit<Tables<"student_profiles">, "id" | "school_id" | "created_at" | "updated_at">;

export interface StudentListRow {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  username: string | null;
  email: string | null;
  status: string;
  className: string | null;
  classId: string | null;
  admissionNumber: string | null;
  gender: string | null;
}

function fail(scope: string, error: { code?: string } | null): never {
  console.error(`[students] ${scope} failed`, error?.code ?? "unknown");
  throw new Error(`Unable to load ${scope}`);
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/** Class ids a teacher teaches in a year (homeroom or a subject). */
export const classesTaughtBy = cache(async (schoolId: string, yearId: string, profileId: string): Promise<string[]> => {
  const supabase = await createClient();
  const [homeroom, subjects] = await Promise.all([
    supabase.from("classes").select("id").eq("school_id", schoolId).eq("academic_year_id", yearId).eq("homeroom_teacher_id", profileId),
    supabase
      .from("class_subjects")
      .select("class:classes!class_subjects_class_fkey!inner(id, academic_year_id)")
      .eq("school_id", schoolId)
      .eq("teacher_id", profileId)
      .eq("class.academic_year_id", yearId),
  ]);
  if (homeroom.error) fail("classes", homeroom.error);
  if (subjects.error) fail("classes", subjects.error);
  return [...new Set([...homeroom.data.map((c) => c.id), ...subjects.data.map((s) => s.class?.id).filter((x): x is string => Boolean(x))])];
});

export async function listStudents(
  schoolId: string,
  opts: { yearId: string | null; classId?: string | null; unassigned?: boolean; search?: string; onlyClassIds?: string[] },
): Promise<StudentListRow[]> {
  const supabase = await createClient();
  const restricted = opts.onlyClassIds !== undefined;
  if (restricted && opts.onlyClassIds!.length === 0) return [];

  let query = supabase
    .from("profiles")
    .select(
      `id, first_name, middle_name, last_name, username, email, status,
       details:student_profiles!student_profiles_profile_fkey(admission_number, gender),
       enrollments:enrollments!enrollments_student_fkey${restricted || opts.classId ? "!inner" : ""}(class_id, academic_year_id, class:classes!enrollments_class_fkey(name))`,
    )
    .eq("school_id", schoolId)
    .eq("role", "student")
    .neq("status", "inactive")
    .order("last_name")
    .order("first_name")
    .limit(2000);
  if (opts.yearId) query = query.eq("enrollments.academic_year_id", opts.yearId);
  if (opts.classId) query = query.eq("enrollments.class_id", opts.classId);
  else if (restricted) query = query.in("enrollments.class_id", opts.onlyClassIds!);

  const term = opts.search?.replace(/[^\p{L}\p{N} .@_/-]/gu, "").trim().slice(0, 60);
  if (term) {
    // Also match admission numbers (they live in student_profiles).
    const { data: byNumber } = await supabase
      .from("student_profiles")
      .select("profile_id")
      .eq("school_id", schoolId)
      .ilike("admission_number", `%${term}%`)
      .limit(50);
    const like = `"%${term}%"`;
    const ids = (byNumber ?? []).map((b) => b.profile_id);
    query = query.or(
      [`first_name.ilike.${like}`, `last_name.ilike.${like}`, `username.ilike.${like}`, ...(ids.length ? [`id.in.(${ids.join(",")})`] : [])].join(","),
    );
  }

  const { data, error } = await query;
  if (error) fail("students", error);

  let rows: StudentListRow[] = data.map((p) => {
    const d = one(p.details);
    const e = p.enrollments[0];
    return {
      id: p.id,
      firstName: p.first_name,
      middleName: p.middle_name,
      lastName: p.last_name,
      username: p.username,
      email: p.email,
      status: p.status,
      className: e?.class?.name ?? null,
      classId: e?.class_id ?? null,
      admissionNumber: d?.admission_number ?? null,
      gender: d?.gender ?? null,
    };
  });

  if (opts.unassigned) rows = rows.filter((r) => !r.classId);
  return rows;
}

export interface StudentRecord {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  details: StudentDetails | null;
  enrollments: { classId: string; className: string; yearId: string; yearName: string; isCurrent: boolean; status: string; startsOn: string }[];
}

export async function getStudentRecord(schoolId: string, profileId: string): Promise<StudentRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      `id, first_name, middle_name, last_name, username, email, phone, status, role,
       details:student_profiles!student_profiles_profile_fkey(profile_id, admission_number, date_of_birth, gender, place_of_birth, nationality, home_address, admission_date, previous_school, emergency_contact_name, emergency_contact_phone),
       enrollments:enrollments!enrollments_student_fkey(class_id, status, class:classes!enrollments_class_fkey(name), year:academic_years!enrollments_year_fkey(id, name, is_current, starts_on))`,
    )
    .eq("school_id", schoolId)
    .eq("id", profileId)
    .eq("role", "student")
    .maybeSingle();
  if (error) fail("student", error);
  if (!data) return null;
  return {
    id: data.id,
    firstName: data.first_name,
    middleName: data.middle_name,
    lastName: data.last_name,
    username: data.username,
    email: data.email,
    phone: data.phone,
    status: data.status,
    details: one(data.details),
    enrollments: data.enrollments
      .map((e) => ({
        classId: e.class_id,
        className: e.class?.name ?? "—",
        yearId: e.year?.id ?? "",
        yearName: e.year?.name ?? "—",
        isCurrent: Boolean(e.year?.is_current),
        status: e.status,
        startsOn: e.year?.starts_on ?? "",
      }))
      .sort((a, b) => b.startsOn.localeCompare(a.startsOn)),
  };
}

/** Admission numbers already used that start with a prefix (for generating the next ones). */
export async function admissionNumbersWithPrefix(schoolId: string, prefix: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_profiles")
    .select("admission_number")
    .eq("school_id", schoolId)
    .ilike("admission_number", `${prefix}%`)
    .limit(10000);
  if (error) fail("admission numbers", error);
  return data.map((d) => d.admission_number).filter((n): n is string => Boolean(n));
}
