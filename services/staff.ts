import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

/** Teachers & staff directory (admins). */

export type StaffDetails = Omit<Tables<"staff_profiles">, "id" | "school_id" | "created_at" | "updated_at">;

function fail(scope: string, error: { code?: string } | null): never {
  console.error(`[staff] ${scope} failed`, error?.code ?? "unknown");
  throw new Error(`Unable to load ${scope}`);
}
function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export interface StaffListRow {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  role: string;
  status: string;
  email: string | null;
  username: string | null;
  phone: string | null;
  employeeNumber: string | null;
  jobTitle: string | null;
  qualification: string | null;
  homeroom: string[];
  subjects: number;
}

export async function listStaff(schoolId: string, yearId: string | null): Promise<StaffListRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("profiles")
    .select(
      `id, first_name, middle_name, last_name, role, status, email, username, phone,
       details:staff_profiles!staff_profiles_profile_fkey(employee_number, job_title, qualification),
       homeroom:classes!classes_homeroom_fkey(name, academic_year_id),
       teaching:class_subjects!class_subjects_teacher_fkey(id, class:classes!class_subjects_class_fkey(academic_year_id))`,
    )
    .eq("school_id", schoolId)
    .in("role", ["teacher", "school_admin"])
    .neq("status", "inactive")
    .order("last_name")
    .order("first_name")
    .limit(1000);
  if (yearId) query = query.eq("homeroom.academic_year_id", yearId);
  const { data, error } = await query;
  if (error) fail("staff", error);
  return data.map((p) => {
    const d = one(p.details);
    return {
      id: p.id,
      firstName: p.first_name,
      middleName: p.middle_name,
      lastName: p.last_name,
      role: p.role,
      status: p.status,
      email: p.email,
      username: p.username,
      phone: p.phone,
      employeeNumber: d?.employee_number ?? null,
      jobTitle: d?.job_title ?? null,
      qualification: d?.qualification ?? null,
      homeroom: p.homeroom.map((h) => h.name),
      subjects: p.teaching.filter((t) => !yearId || t.class?.academic_year_id === yearId).length,
    };
  });
}

export interface StaffRecord {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  role: string;
  status: string;
  email: string | null;
  username: string | null;
  phone: string | null;
  details: StaffDetails | null;
  homeroom: { id: string; name: string }[];
  assignments: { classSubjectId: string; classId: string; className: string; subject: string }[];
}

export async function getStaffRecord(schoolId: string, profileId: string, yearId: string | null): Promise<StaffRecord | null> {
  const supabase = await createClient();
  let query = supabase
    .from("profiles")
    .select(
      `id, first_name, middle_name, last_name, role, status, email, username, phone,
       details:staff_profiles!staff_profiles_profile_fkey(profile_id, employee_number, gender, job_title, qualification, specialization, employment_type, hire_date, home_address),
       homeroom:classes!classes_homeroom_fkey(id, name, academic_year_id),
       teaching:class_subjects!class_subjects_teacher_fkey(id, class:classes!class_subjects_class_fkey(id, name, academic_year_id), subject:subjects!class_subjects_subject_fkey(name))`,
    )
    .eq("school_id", schoolId)
    .eq("id", profileId)
    .in("role", ["teacher", "school_admin"]);
  if (yearId) query = query.eq("homeroom.academic_year_id", yearId);
  const { data, error } = await query.maybeSingle();
  if (error) fail("staff member", error);
  if (!data) return null;
  return {
    id: data.id,
    firstName: data.first_name,
    middleName: data.middle_name,
    lastName: data.last_name,
    role: data.role,
    status: data.status,
    email: data.email,
    username: data.username,
    phone: data.phone,
    details: one(data.details),
    homeroom: data.homeroom.map((h) => ({ id: h.id, name: h.name })),
    assignments: data.teaching
      .filter((t) => t.class && (!yearId || t.class.academic_year_id === yearId))
      .map((t) => ({ classSubjectId: t.id, classId: t.class!.id, className: t.class!.name, subject: t.subject?.name ?? "—" }))
      .sort((a, b) => a.className.localeCompare(b.className, "en", { numeric: true }) || a.subject.localeCompare(b.subject)),
  };
}
