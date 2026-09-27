"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyDbError, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/services/auth";

/**
 * Class management (school administrators only). Writes go through the
 * caller's session: RLS limits them to the caller's school, composite foreign
 * keys stop cross-school references, and database triggers check that a
 * homeroom/subject teacher is staff and an enrolled person is a student.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BATCH = 200;

const ok = (message: string): ActionState => ({ status: "success", message });
const bad = (message: string): ActionState => ({ status: "error", message });

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim().replace(/\s+/g, " ");
}
function uuid(formData: FormData, key: string): string | null {
  const v = text(formData, key);
  return UUID.test(v) ? v : null;
}
function uuids(formData: FormData, key: string): string[] {
  return [...new Set(formData.getAll(key).map(String).filter((v) => UUID.test(v)))];
}

async function guard() {
  const context = await requireCapability("school.manage", "/classes");
  return { schoolId: context.school.id, supabase: await createClient() };
}

function refresh(classId?: string) {
  revalidatePath("/classes");
  if (classId) revalidatePath(`/classes/${classId}`);
  revalidatePath("/dashboard");
}

function parseClassFields(formData: FormData) {
  const name = text(formData, "name");
  const gradeId = uuid(formData, "grade_level_id");
  const homeroomRaw = text(formData, "homeroom_teacher_id");
  const homeroomId = homeroomRaw ? uuid(formData, "homeroom_teacher_id") : null;
  const capacityRaw = text(formData, "capacity");
  const capacity = capacityRaw ? Number(capacityRaw) : null;

  if (name.length < 1 || name.length > 40) return { error: "Enter a class name (up to 40 characters), e.g. 10A." };
  if (!gradeId) return { error: "Choose a grade level." };
  if (homeroomRaw && !homeroomId) return { error: "Choose a homeroom teacher from the list." };
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 500)) {
    return { error: "Capacity must be a whole number from 1 to 500, or left empty." };
  }
  return { name, gradeId, homeroomId, capacity };
}

export async function createClass(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { schoolId, supabase } = await guard();
  const yearId = uuid(formData, "academic_year_id");
  if (!yearId) return bad("Create and select an academic year first.");
  const fields = parseClassFields(formData);
  if ("error" in fields) return bad(fields.error!);

  const { data, error } = await supabase
    .from("classes")
    .insert({
      school_id: schoolId,
      academic_year_id: yearId,
      grade_level_id: fields.gradeId,
      name: fields.name,
      homeroom_teacher_id: fields.homeroomId,
      capacity: fields.capacity,
    })
    .select("id")
    .single();
  if (error?.code === "23505") return bad(`There is already a class called “${fields.name}” this year.`);
  if (error || !data) return bad(friendlyDbError(error, "The class couldn’t be created."));

  // Optionally give the class every active subject straight away.
  if (formData.get("add_all_subjects") === "on") {
    const { data: subjects } = await supabase.from("subjects").select("id").eq("school_id", schoolId).eq("is_active", true);
    if (subjects?.length) {
      await supabase
        .from("class_subjects")
        .insert(subjects.map((s) => ({ school_id: schoolId, class_id: data.id, subject_id: s.id })));
    }
  }

  refresh();
  redirect(`/classes/${data.id}?created=1`);
}

export async function updateClass(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { schoolId, supabase } = await guard();
  const classId = uuid(formData, "class_id");
  if (!classId) return bad("That class wasn’t found.");
  const fields = parseClassFields(formData);
  if ("error" in fields) return bad(fields.error!);

  const { data, error } = await supabase
    .from("classes")
    .update({ name: fields.name, grade_level_id: fields.gradeId, homeroom_teacher_id: fields.homeroomId, capacity: fields.capacity })
    .eq("id", classId)
    .eq("school_id", schoolId)
    .select("id");
  if (error?.code === "23505") return bad(`There is already a class called “${fields.name}” this year.`);
  if (error || !data?.length) return bad(friendlyDbError(error, "The class couldn’t be saved."));
  refresh(classId);
  return ok("Class details saved.");
}

export async function deleteClass(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { schoolId, supabase } = await guard();
  const classId = uuid(formData, "class_id");
  if (!classId) return bad("That class wasn’t found.");
  const { data, error } = await supabase.from("classes").delete().eq("id", classId).eq("school_id", schoolId).select("id");
  if (error?.code === "23503") return bad("Students are enrolled in this class. Remove them first, then delete the class.");
  if (error || !data?.length) return bad(friendlyDbError(error, "The class couldn’t be deleted."));
  refresh();
  redirect("/classes?deleted=1");
}

// ---------------------------------------------------------------------------
// Subjects & subject teachers
// ---------------------------------------------------------------------------

export async function addClassSubjects(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { schoolId, supabase } = await guard();
  const classId = uuid(formData, "class_id");
  const subjectIds = uuids(formData, "subject_id");
  if (!classId) return bad("That class wasn’t found.");
  if (subjectIds.length === 0) return bad("Tick at least one subject.");
  if (subjectIds.length > MAX_BATCH) return bad("Too many subjects at once.");

  const { error } = await supabase
    .from("class_subjects")
    .upsert(
      subjectIds.map((subjectId) => ({ school_id: schoolId, class_id: classId, subject_id: subjectId })),
      { onConflict: "class_id,subject_id", ignoreDuplicates: true },
    );
  if (error) return bad(friendlyDbError(error, "The subjects couldn’t be added."));
  refresh(classId);
  return ok(`${subjectIds.length} subject${subjectIds.length === 1 ? "" : "s"} added.`);
}

export async function setSubjectTeacher(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { schoolId, supabase } = await guard();
  const rowId = uuid(formData, "id");
  const classId = uuid(formData, "class_id");
  const teacherRaw = text(formData, "teacher_id");
  const teacherId = teacherRaw ? uuid(formData, "teacher_id") : null;
  if (!rowId || !classId || (teacherRaw && !teacherId)) return bad("Choose a teacher from the list.");

  const { data, error } = await supabase
    .from("class_subjects")
    .update({ teacher_id: teacherId })
    .eq("id", rowId)
    .eq("school_id", schoolId)
    .select("id");
  if (error || !data?.length) return bad(friendlyDbError(error, "The teacher couldn’t be assigned."));
  refresh(classId);
  return ok(teacherId ? "Teacher assigned." : "Teacher removed.");
}

export async function removeClassSubject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { schoolId, supabase } = await guard();
  const rowId = uuid(formData, "id");
  const classId = uuid(formData, "class_id");
  if (!rowId || !classId) return bad("That subject wasn’t found.");
  const { data, error } = await supabase.from("class_subjects").delete().eq("id", rowId).eq("school_id", schoolId).select("id");
  if (error || !data?.length) return bad(friendlyDbError(error, "The subject couldn’t be removed from this class."));
  refresh(classId);
  return ok("Subject removed from the class.");
}

// ---------------------------------------------------------------------------
// Enrolment
// ---------------------------------------------------------------------------

export async function enrollStudents(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { schoolId, supabase } = await guard();
  const classId = uuid(formData, "class_id");
  const studentIds = uuids(formData, "student_id");
  if (!classId) return bad("That class wasn’t found.");
  if (studentIds.length === 0) return bad("Tick at least one student.");
  if (studentIds.length > MAX_BATCH) return bad(`Enrol at most ${MAX_BATCH} students at a time.`);

  const { data: cls, error: classError } = await supabase
    .from("classes")
    .select("id, academic_year_id, capacity, enrollments(count)")
    .eq("id", classId)
    .eq("school_id", schoolId)
    .eq("enrollments.status", "active")
    .maybeSingle();
  if (classError || !cls) return bad("That class wasn’t found.");

  const current = cls.enrollments[0]?.count ?? 0;
  if (cls.capacity !== null && current + studentIds.length > cls.capacity) {
    return bad(`This class holds ${cls.capacity}. It has ${current}, so you can add at most ${Math.max(cls.capacity - current, 0)} more.`);
  }

  const { error } = await supabase.from("enrollments").insert(
    studentIds.map((studentId) => ({
      school_id: schoolId,
      class_id: classId,
      academic_year_id: cls.academic_year_id,
      student_id: studentId,
    })),
  );
  if (error?.code === "23505") {
    return bad("At least one of those students is already in a class this year. Refresh the page and try again.");
  }
  if (error) return bad(friendlyDbError(error, "The students couldn’t be enrolled."));
  refresh(classId);
  return ok(`${studentIds.length} student${studentIds.length === 1 ? "" : "s"} enrolled.`);
}

/** Take a student out of a class (e.g. enrolled by mistake). Their record can then be placed in another class. */
export async function removeEnrollment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { schoolId, supabase } = await guard();
  const enrollmentId = uuid(formData, "id");
  const classId = uuid(formData, "class_id");
  if (!enrollmentId || !classId) return bad("That enrolment wasn’t found.");
  const { data, error } = await supabase
    .from("enrollments")
    .delete()
    .eq("id", enrollmentId)
    .eq("school_id", schoolId)
    .select("id");
  if (error?.code === "23503") return bad("This student already has records in this class, so they can’t be removed.");
  if (error || !data?.length) return bad(friendlyDbError(error, "The student couldn’t be removed."));
  refresh(classId);
  return ok("Student removed from the class.");
}
