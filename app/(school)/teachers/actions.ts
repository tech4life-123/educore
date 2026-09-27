"use server";

import { revalidatePath } from "next/cache";
import { friendlyDbError, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/services/auth";

/** Staff record actions — admins only (RLS enforces it again). */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER = /^[A-Za-z0-9][A-Za-z0-9/-]{0,29}$/;
const EMPLOYMENT = new Set(["full_time", "part_time", "volunteer", "contract"]);

function text(formData: FormData, key: string, max: number): string | null {
  const v = String(formData.get(key) ?? "").trim().replace(/\s+/g, " ");
  return v ? v.slice(0, max) : null;
}

export async function saveStaffDetails(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { school } = await requireCapability("school.manage", "/teachers");
  const profileId = String(formData.get("profile_id") ?? "");
  if (!UUID.test(profileId)) return { status: "error", message: "That staff member wasn’t found." };

  const employee = text(formData, "employee_number", 30);
  const hired = text(formData, "hire_date", 10);
  const gender = text(formData, "gender", 10);
  const employment = text(formData, "employment_type", 20);
  if (employee && !NUMBER.test(employee)) return { status: "error", message: "Employee numbers use letters, digits, “/” and “-” only." };
  if (hired && (!DATE.test(hired) || hired < "1950-01-01")) return { status: "error", message: "Enter a valid hire date." };
  if (gender && gender !== "female" && gender !== "male") return { status: "error", message: "Choose a gender." };
  if (employment && !EMPLOYMENT.has(employment)) return { status: "error", message: "Choose an employment type." };

  const supabase = await createClient();
  const { error } = await supabase.from("staff_profiles").upsert(
    {
      school_id: school.id,
      profile_id: profileId,
      employee_number: employee,
      gender,
      job_title: text(formData, "job_title", 80),
      qualification: text(formData, "qualification", 150),
      specialization: text(formData, "specialization", 150),
      employment_type: employment,
      hire_date: hired,
      home_address: text(formData, "home_address", 300),
    },
    { onConflict: "profile_id" },
  );
  if (error?.code === "23505") return { status: "error", message: `Employee number ${employee} is already used.` };
  if (error) return { status: "error", message: friendlyDbError(error, "The staff record couldn’t be saved.") };
  revalidatePath("/teachers", "layout");
  return { status: "success", message: "Staff record saved." };
}
