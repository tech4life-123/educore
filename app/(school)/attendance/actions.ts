"use server";

import { revalidatePath } from "next/cache";
import { friendlyDbError, type ActionState } from "@/lib/action-state";
import { isIsoDate, type AttendanceStatus } from "@/lib/attendance";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/services/auth";

/**
 * Save a class's register for one day. RLS allows it only for the class's
 * homeroom teacher or an admin; triggers reject future dates, dates outside
 * the academic year and students who aren't in the class.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set<AttendanceStatus>(["present", "absent", "late", "excused"]);

export async function saveRegister(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { school } = await requireCapability("grades.enter", "/attendance");
  const classId = String(formData.get("class_id") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!UUID.test(classId) || !isIsoDate(date)) return { status: "error", message: "Choose a class and a date." };

  const marks: { studentId: string; status: AttendanceStatus; note: string | null }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("status:")) continue;
    const studentId = key.slice(7);
    const status = String(value) as AttendanceStatus;
    if (!UUID.test(studentId) || !STATUSES.has(status)) continue;
    const note = String(formData.get(`note:${studentId}`) ?? "").trim().slice(0, 200);
    marks.push({ studentId, status, note: note || null });
  }
  if (marks.length === 0) return { status: "error", message: "There are no students to mark." };

  const supabase = await createClient();
  const { data: register, error: regError } = await supabase
    .from("attendance_registers")
    .upsert({ school_id: school.id, class_id: classId, date }, { onConflict: "class_id,date" })
    .select("id")
    .single();
  if (regError?.code === "42501") {
    return { status: "error", message: "Only this class’s homeroom teacher or an administrator can take the register." };
  }
  if (regError || !register) return { status: "error", message: friendlyDbError(regError, "The register couldn’t be saved.") };

  const { error } = await supabase.from("attendance_records").upsert(
    marks.map((m) => ({
      school_id: school.id,
      register_id: register.id,
      class_id: classId,
      date,
      student_id: m.studentId,
      status: m.status,
      note: m.note,
    })),
    { onConflict: "register_id,student_id" },
  );
  if (error) return { status: "error", message: friendlyDbError(error, "The attendance marks couldn’t be saved.") };

  revalidatePath("/attendance", "layout");
  const absent = marks.filter((m) => m.status === "absent").length;
  const late = marks.filter((m) => m.status === "late").length;
  return {
    status: "success",
    message: `Register saved: ${marks.length - absent - late} present or excused, ${absent} absent, ${late} late.`,
  };
}
