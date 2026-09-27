"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyDbError, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/services/auth";

/**
 * Grade entry, submission and publishing.
 *
 * The page guards are for navigation only. The database decides: RLS lets
 * only the assigned teacher (or an admin) write a class subject's
 * assessments and scores, and triggers lock submitted / published periods,
 * cap scores at the maximum and reject students who aren't in the class.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SCORE = /^\d{1,4}(\.\d{1,2})?$/;

const ok = (message: string): ActionState => ({ status: "success", message });
const bad = (message: string): ActionState => ({ status: "error", message });

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim().replace(/\s+/g, " ");
}
function uuid(formData: FormData, key: string): string | null {
  const v = text(formData, key);
  return UUID.test(v) ? v : null;
}

async function guard() {
  const context = await requireCapability("grades.enter", "/grades");
  return { schoolId: context.school.id, supabase: await createClient() };
}

function refresh(classSubjectId?: string, assessmentId?: string) {
  revalidatePath("/grades");
  if (classSubjectId) revalidatePath(`/grades/${classSubjectId}`);
  if (classSubjectId && assessmentId) revalidatePath(`/grades/${classSubjectId}/assessments/${assessmentId}`);
}

function parseAssessment(formData: FormData) {
  const title = text(formData, "title");
  const maxRaw = text(formData, "max_score");
  const dateRaw = text(formData, "assessed_on");
  const categoryRaw = text(formData, "category_id");
  const max = Number(maxRaw);
  if (title.length < 2 || title.length > 80) return { error: "Give the assessment a title (2–80 characters), e.g. “Quiz 1”." };
  if (!SCORE.test(maxRaw) || !(max > 0) || max > 1000) return { error: "The maximum score must be a number from 1 to 1000." };
  if (dateRaw && (!DATE.test(dateRaw) || Number.isNaN(Date.parse(dateRaw)))) return { error: "Enter a valid date or leave it empty." };
  if (categoryRaw && !UUID.test(categoryRaw)) return { error: "Choose a category from the list." };
  return { title, max, date: dateRaw || null, categoryId: categoryRaw || null };
}

// ---------------------------------------------------------------------------
// Assessments
// ---------------------------------------------------------------------------

export async function createAssessment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { schoolId, supabase } = await guard();
  const classSubjectId = uuid(formData, "class_subject_id");
  const periodId = uuid(formData, "grading_period_id");
  if (!classSubjectId || !periodId) return bad("Choose a grading period first.");
  const fields = parseAssessment(formData);
  if ("error" in fields) return bad(fields.error!);

  const { data, error } = await supabase
    .from("assessments")
    .insert({
      school_id: schoolId,
      class_subject_id: classSubjectId,
      grading_period_id: periodId,
      category_id: fields.categoryId,
      title: fields.title,
      max_score: fields.max,
      assessed_on: fields.date,
    })
    .select("id")
    .single();
  if (error?.code === "42501") return bad("Only the teacher assigned to this subject (or an administrator) can add assessments.");
  if (error || !data) return bad(friendlyDbError(error, "The assessment couldn’t be created."));
  refresh(classSubjectId);
  redirect(`/grades/${classSubjectId}/assessments/${data.id}?created=1`);
}

export async function updateAssessment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { schoolId, supabase } = await guard();
  const id = uuid(formData, "id");
  const classSubjectId = uuid(formData, "class_subject_id");
  if (!id || !classSubjectId) return bad("That assessment wasn’t found.");
  const fields = parseAssessment(formData);
  if ("error" in fields) return bad(fields.error!);

  const { data, error } = await supabase
    .from("assessments")
    .update({ title: fields.title, max_score: fields.max, assessed_on: fields.date, category_id: fields.categoryId })
    .eq("id", id)
    .eq("school_id", schoolId)
    .select("id");
  if (error || !data?.length) return bad(friendlyDbError(error, "The assessment couldn’t be saved."));
  refresh(classSubjectId, id);
  return ok("Assessment saved.");
}

export async function deleteAssessment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { schoolId, supabase } = await guard();
  const id = uuid(formData, "id");
  const classSubjectId = uuid(formData, "class_subject_id");
  const periodId = uuid(formData, "grading_period_id");
  if (!id || !classSubjectId) return bad("That assessment wasn’t found.");
  const { data, error } = await supabase.from("assessments").delete().eq("id", id).eq("school_id", schoolId).select("id");
  if (error || !data?.length) return bad(friendlyDbError(error, "The assessment couldn’t be deleted."));
  refresh(classSubjectId);
  redirect(`/grades/${classSubjectId}?deleted=1${periodId ? `&period=${periodId}` : ""}`);
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

/**
 * Save every score on the entry sheet in one go. Form fields per student:
 *   score:<studentId>    number, or empty to clear
 *   excused:<studentId>  "on" when excused
 * Only students listed on the sheet are touched.
 */
export async function saveScores(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { schoolId, supabase } = await guard();
  const assessmentId = uuid(formData, "assessment_id");
  const classSubjectId = uuid(formData, "class_subject_id");
  if (!assessmentId || !classSubjectId) return bad("That assessment wasn’t found.");

  const { data: assessment, error: aError } = await supabase
    .from("assessments")
    .select("id, max_score")
    .eq("id", assessmentId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (aError || !assessment) return bad("That assessment wasn’t found.");
  const max = Number(assessment.max_score);

  const upserts: { school_id: string; assessment_id: string; student_id: string; score: number | null; is_excused: boolean }[] = [];
  const clears: string[] = [];
  const problems: string[] = [];

  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("score:")) continue;
    const studentId = key.slice("score:".length);
    if (!UUID.test(studentId)) continue;
    const value = String(raw).trim().replace(",", ".");
    const excused = formData.get(`excused:${studentId}`) === "on";
    const label = text(formData, `name:${studentId}`) || "A student";

    if (excused) {
      upserts.push({ school_id: schoolId, assessment_id: assessmentId, student_id: studentId, score: null, is_excused: true });
    } else if (value === "") {
      clears.push(studentId);
    } else if (!SCORE.test(value) || Number(value) > max) {
      problems.push(`${label}: “${value}” isn’t a score from 0 to ${max}`);
    } else {
      upserts.push({ school_id: schoolId, assessment_id: assessmentId, student_id: studentId, score: Number(value), is_excused: false });
    }
  }

  if (problems.length) {
    return bad(`Nothing was saved. Please fix: ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? ` and ${problems.length - 5} more` : ""}.`);
  }

  if (upserts.length) {
    const { error } = await supabase.from("assessment_scores").upsert(upserts, { onConflict: "assessment_id,student_id" });
    if (error) return bad(friendlyDbError(error, "The scores couldn’t be saved."));
  }
  if (clears.length) {
    const { error } = await supabase
      .from("assessment_scores")
      .delete()
      .eq("school_id", schoolId)
      .eq("assessment_id", assessmentId)
      .in("student_id", clears);
    if (error) return bad(friendlyDbError(error, "Some scores couldn’t be cleared."));
  }

  refresh(classSubjectId, assessmentId);
  return ok(`Saved ${upserts.length} score${upserts.length === 1 ? "" : "s"}${clears.length ? `; ${clears.length} left blank` : ""}.`);
}

// ---------------------------------------------------------------------------
// Submission & publishing
// ---------------------------------------------------------------------------

export async function submitGrades(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { schoolId, supabase } = await guard();
  const classSubjectId = uuid(formData, "class_subject_id");
  const periodId = uuid(formData, "grading_period_id");
  if (!classSubjectId || !periodId) return bad("Choose a grading period.");
  const { error } = await supabase
    .from("grade_submissions")
    .insert({ school_id: schoolId, class_subject_id: classSubjectId, grading_period_id: periodId });
  if (error?.code === "23505") return ok("These grades were already submitted.");
  if (error) return bad(friendlyDbError(error, "The grades couldn’t be submitted."));
  refresh(classSubjectId);
  return ok("Submitted for review. The grades are now locked until an administrator publishes or returns them.");
}

/** Teacher withdraws their submission, or an admin returns it to the teacher. */
export async function withdrawSubmission(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { schoolId, supabase } = await guard();
  const classSubjectId = uuid(formData, "class_subject_id");
  const periodId = uuid(formData, "grading_period_id");
  if (!classSubjectId || !periodId) return bad("Choose a grading period.");
  const { data, error } = await supabase
    .from("grade_submissions")
    .delete()
    .eq("school_id", schoolId)
    .eq("class_subject_id", classSubjectId)
    .eq("grading_period_id", periodId)
    .select("id");
  if (error || !data?.length) return bad(friendlyDbError(error, "The submission couldn’t be withdrawn."));
  refresh(classSubjectId);
  return ok("Returned for editing.");
}

export async function setPeriodPublished(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireCapability("school.manage", "/grades");
  const supabase = await createClient();
  const periodId = uuid(formData, "grading_period_id");
  const publish = formData.get("publish") === "true";
  if (!periodId) return bad("Choose a grading period.");
  const { error } = await supabase.rpc("set_grading_period_published", { p_period_id: periodId, p_published: publish });
  if (error) return bad(friendlyDbError(error, publish ? "The grades couldn’t be published." : "The grades couldn’t be unpublished."));
  revalidatePath("/grades", "layout");
  revalidatePath("/dashboard");
  return ok(
    publish
      ? "Published. Students and linked parents can now see these grades, and they are locked."
      : "Unpublished. Students and parents can no longer see these grades, and they can be edited again.",
  );
}
