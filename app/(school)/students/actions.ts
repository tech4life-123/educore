"use server";

import { revalidatePath } from "next/cache";
import { friendlyDbError, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAcademicYear } from "@/services/academics";
import { requireCapability } from "@/services/auth";
import { admissionNumbersWithPrefix } from "@/services/students";

/** Student record actions — admins only (RLS enforces it again). */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER = /^[A-Za-z0-9][A-Za-z0-9/-]{0,29}$/;
const PHONE = /^\+?[0-9 ()-]{7,20}$/;

function text(formData: FormData, key: string, max: number): string | null {
  const v = String(formData.get(key) ?? "").trim().replace(/\s+/g, " ");
  return v ? v.slice(0, max) : null;
}

export async function saveStudentDetails(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { school } = await requireCapability("school.manage", "/students");
  const profileId = String(formData.get("profile_id") ?? "");
  if (!UUID.test(profileId)) return { status: "error", message: "That student wasn’t found." };

  const admission = text(formData, "admission_number", 30);
  const dob = text(formData, "date_of_birth", 10);
  const admitted = text(formData, "admission_date", 10);
  const gender = text(formData, "gender", 10);
  const phone = text(formData, "emergency_contact_phone", 30);
  const today = new Date().toISOString().slice(0, 10);

  if (admission && !NUMBER.test(admission)) return { status: "error", message: "Admission numbers use letters, digits, “/” and “-” only (up to 30)." };
  if (dob && (!DATE.test(dob) || dob > today || dob < "1950-01-01")) return { status: "error", message: "Enter a valid date of birth." };
  if (admitted && (!DATE.test(admitted) || admitted < "1950-01-01")) return { status: "error", message: "Enter a valid admission date." };
  if (gender && gender !== "female" && gender !== "male") return { status: "error", message: "Choose a gender." };
  if (phone && !PHONE.test(phone)) return { status: "error", message: "Enter a valid emergency phone number, e.g. +231 77 000 0000." };

  const supabase = await createClient();
  const { error } = await supabase.from("student_profiles").upsert(
    {
      school_id: school.id,
      profile_id: profileId,
      admission_number: admission,
      date_of_birth: dob,
      gender,
      place_of_birth: text(formData, "place_of_birth", 100),
      nationality: text(formData, "nationality", 60),
      home_address: text(formData, "home_address", 300),
      admission_date: admitted,
      previous_school: text(formData, "previous_school", 150),
      emergency_contact_name: text(formData, "emergency_contact_name", 120),
      emergency_contact_phone: phone,
    },
    { onConflict: "profile_id" },
  );
  if (error?.code === "23505") return { status: "error", message: `Admission number ${admission} is already used by another student.` };
  if (error) return { status: "error", message: friendlyDbError(error, "The student record couldn’t be saved.") };

  revalidatePath("/students", "layout");
  return { status: "success", message: "Student record saved." };
}

/** Give every active student without one an admission number: <start year>-0001, -0002, … */
export async function generateAdmissionNumbers(): Promise<ActionState> {
  const { school } = await requireCapability("school.manage", "/students");
  const supabase = await createClient();
  const year = await getCurrentAcademicYear(school.id);
  const prefix = `${(year?.starts_on ?? new Date().toISOString()).slice(0, 4)}-`;

  const [{ data: students, error }, used] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, last_name, first_name, details:student_profiles!student_profiles_profile_fkey(admission_number)")
      .eq("school_id", school.id)
      .eq("role", "student")
      .neq("status", "inactive")
      .order("last_name")
      .order("first_name")
      .limit(5000),
    admissionNumbersWithPrefix(school.id, prefix),
  ]);
  if (error) return { status: "error", message: "The students couldn’t be loaded." };

  const missing = students.filter((s) => {
    const d = Array.isArray(s.details) ? s.details[0] : s.details;
    return !d?.admission_number;
  });
  if (missing.length === 0) return { status: "success", message: "Every student already has an admission number." };

  let next = used.reduce((max, n) => Math.max(max, Number(n.slice(prefix.length)) || 0), 0) + 1;
  const rows = missing.map((s) => ({
    school_id: school.id,
    profile_id: s.id,
    admission_number: `${prefix}${String(next++).padStart(4, "0")}`,
  }));
  const { error: upsertError } = await supabase.from("student_profiles").upsert(rows, { onConflict: "profile_id" });
  if (upsertError) return { status: "error", message: friendlyDbError(upsertError, "The admission numbers couldn’t be saved.") };

  revalidatePath("/students", "layout");
  return { status: "success", message: `${rows.length} admission number${rows.length === 1 ? "" : "s"} assigned (${rows[0].admission_number} onwards).` };
}
