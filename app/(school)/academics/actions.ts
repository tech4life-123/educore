"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyDbError, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/services/auth";

/**
 * Academic setup actions (school administrators only).
 *
 * Each action re-checks the caller, validates input, and writes with the
 * caller's own session: RLS limits every write to the caller's school, and the
 * RPCs re-check that the caller is a school admin.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const ok = (message: string): ActionState => ({ status: "success", message });
const bad = (message: string): ActionState => ({ status: "error", message });

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim().replace(/\s+/g, " ");
}

function id(formData: FormData, key = "id"): string | null {
  const v = text(formData, key);
  return UUID.test(v) ? v : null;
}

function date(formData: FormData, key: string): string | null | undefined {
  const v = text(formData, key);
  if (!v) return null;
  if (!DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) return undefined;
  return v;
}

async function guard() {
  const context = await requireCapability("school.manage", "/academics");
  return { context, supabase: await createClient() };
}

function done(message: string, ...paths: string[]): ActionState {
  for (const p of paths) revalidatePath(p);
  revalidatePath("/dashboard");
  return ok(message);
}

// ---------------------------------------------------------------------------
// Academic years
// ---------------------------------------------------------------------------

export async function createAcademicYear(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await guard();
  const name = text(formData, "name");
  const startsOn = date(formData, "starts_on");
  const endsOn = date(formData, "ends_on");
  const template = formData.get("template") === "none" ? "none" : "liberia";
  const makeCurrent = formData.get("make_current") === "on";

  if (name.length < 4 || name.length > 40) return bad("Enter a name such as 2026/2027 (4–40 characters).");
  if (!startsOn || !endsOn) return bad("Enter valid start and end dates.");
  if (endsOn <= startsOn) return bad("The year must end after it starts.");
  const days = (Date.parse(endsOn) - Date.parse(startsOn)) / 86_400_000;
  if (days < 60 || days > 450) return bad("An academic year should be between 2 and 15 months long.");

  let newId: string;
  try {
    const { data, error } = await supabase.rpc("create_academic_year", {
      p_name: name,
      p_starts_on: startsOn,
      p_ends_on: endsOn,
      p_template: template,
      p_make_current: makeCurrent,
    });
    if (error || !data) return bad(friendlyDbError(error, "The academic year couldn’t be created."));
    newId = data;
  } catch {
    return bad("We couldn’t reach the server. Check your connection and try again.");
  }
  revalidatePath("/academics");
  revalidatePath("/dashboard");
  redirect(`/academics/years/${newId}?created=1`);
}

export async function setCurrentAcademicYear(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await guard();
  const yearId = id(formData);
  if (!yearId) return bad("That academic year wasn’t found.");
  const { error } = await supabase.rpc("set_current_academic_year", { p_year_id: yearId });
  if (error) return bad(friendlyDbError(error, "The current year couldn’t be changed."));
  return done("Current academic year updated.", "/academics", `/academics/years/${yearId}`, "/classes");
}

export async function updateAcademicYear(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, context } = await guard();
  const yearId = id(formData);
  const name = text(formData, "name");
  const startsOn = date(formData, "starts_on");
  const endsOn = date(formData, "ends_on");
  if (!yearId) return bad("That academic year wasn’t found.");
  if (name.length < 4 || name.length > 40) return bad("Enter a name of 4–40 characters.");
  if (!startsOn || !endsOn || endsOn <= startsOn) return bad("Enter valid dates; the year must end after it starts.");

  const { data, error } = await supabase
    .from("academic_years")
    .update({ name, starts_on: startsOn, ends_on: endsOn })
    .eq("id", yearId)
    .eq("school_id", context.school.id)
    .select("id");
  if (error || !data?.length) return bad(friendlyDbError(error, "The academic year couldn’t be saved."));
  return done("Academic year saved.", "/academics", `/academics/years/${yearId}`);
}

export async function deleteAcademicYear(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, context } = await guard();
  const yearId = id(formData);
  if (!yearId) return bad("That academic year wasn’t found.");
  const { data, error } = await supabase
    .from("academic_years")
    .delete()
    .eq("id", yearId)
    .eq("school_id", context.school.id)
    .select("id");
  if (error?.code === "23503") return bad("This year already has classes or enrolments, so it can’t be deleted.");
  if (error || !data?.length) return bad(friendlyDbError(error, "The academic year couldn’t be deleted."));
  revalidatePath("/academics");
  revalidatePath("/dashboard");
  redirect("/academics?deleted=1");
}

/** Rename / re-date a semester or a grading period. */
export async function updatePeriod(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, context } = await guard();
  const periodId = id(formData);
  const kind = formData.get("table") === "term" ? "academic_terms" : "grading_periods";
  const yearId = id(formData, "year_id");
  const name = text(formData, "name");
  const startsOn = date(formData, "starts_on");
  const endsOn = date(formData, "ends_on");
  if (!periodId || !yearId) return bad("That period wasn’t found.");
  if (name.length < 2 || name.length > 40) return bad("Names must be 2–40 characters.");
  if (startsOn === undefined || endsOn === undefined) return bad("Enter valid dates.");
  if (startsOn && endsOn && endsOn < startsOn) return bad("The end date must be on or after the start date.");

  const { data, error } = await supabase
    .from(kind)
    .update({ name, starts_on: startsOn, ends_on: endsOn })
    .eq("id", periodId)
    .eq("school_id", context.school.id)
    .select("id");
  if (error || !data?.length) return bad(friendlyDbError(error, "The changes couldn’t be saved."));
  return done("Saved.", `/academics/years/${yearId}`);
}

// ---------------------------------------------------------------------------
// Grade levels
// ---------------------------------------------------------------------------

const STAGES = ["early_childhood", "primary", "junior_high", "senior_high", "other"] as const;
type Stage = (typeof STAGES)[number];

export async function addGradeLevel(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, context } = await guard();
  const name = text(formData, "name");
  const stage = text(formData, "stage") as Stage;
  if (name.length < 1 || name.length > 40) return bad("Enter a grade name (up to 40 characters).");
  if (!STAGES.includes(stage)) return bad("Choose a stage.");

  const { data: last } = await supabase
    .from("grade_levels")
    .select("sequence")
    .eq("school_id", context.school.id)
    .order("sequence", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sequence = (last?.sequence ?? 0) + 1;
  if (sequence > 99) return bad("A school can have at most 99 grade levels.");

  const { error } = await supabase.from("grade_levels").insert({ school_id: context.school.id, name, stage, sequence });
  if (error) return bad(friendlyDbError(error, "The grade level couldn’t be added."));
  return done(`${name} added.`, "/academics/grades");
}

export async function updateGradeLevel(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, context } = await guard();
  const gradeId = id(formData);
  const name = text(formData, "name");
  const stage = text(formData, "stage") as Stage;
  if (!gradeId) return bad("That grade level wasn’t found.");
  if (name.length < 1 || name.length > 40) return bad("Enter a grade name (up to 40 characters).");
  if (!STAGES.includes(stage)) return bad("Choose a stage.");

  const { data, error } = await supabase
    .from("grade_levels")
    .update({ name, stage })
    .eq("id", gradeId)
    .eq("school_id", context.school.id)
    .select("id");
  if (error || !data?.length) return bad(friendlyDbError(error, "The grade level couldn’t be saved."));
  return done("Saved.", "/academics/grades", "/classes");
}

/** Swap a grade level with its neighbour (atomic, in the database). */
export async function moveGradeLevel(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await guard();
  const gradeId = id(formData);
  const direction = formData.get("direction") === "up" ? "up" : "down";
  if (!gradeId) return bad("That grade level wasn’t found.");
  const { error } = await supabase.rpc("move_grade_level", { p_grade_id: gradeId, p_direction: direction });
  if (error) return bad(friendlyDbError(error, "The order couldn’t be changed. Refresh and try again."));
  return done("Order updated.", "/academics/grades", "/classes");
}

export async function deleteGradeLevel(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, context } = await guard();
  const gradeId = id(formData);
  if (!gradeId) return bad("That grade level wasn’t found.");
  const { data, error } = await supabase
    .from("grade_levels")
    .delete()
    .eq("id", gradeId)
    .eq("school_id", context.school.id)
    .select("id");
  if (error?.code === "23503") return bad("Classes use this grade level, so it can’t be removed.");
  if (error || !data?.length) return bad(friendlyDbError(error, "The grade level couldn’t be removed."));
  return done("Grade level removed.", "/academics/grades");
}

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

const SUBJECT_CODE = /^[A-Z0-9][A-Z0-9-]{1,11}$/;

export async function addStandardSubjects(): Promise<ActionState> {
  const { supabase } = await guard();
  const { data, error } = await supabase.rpc("add_standard_subjects");
  if (error) return bad(friendlyDbError(error, "The standard subjects couldn’t be added."));
  return done(
    data ? `${data} standard subject${data === 1 ? "" : "s"} added.` : "All the standard subjects are already in your list.",
    "/academics/subjects",
  );
}

export async function addSubject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, context } = await guard();
  const name = text(formData, "name");
  const code = text(formData, "code").toUpperCase();
  if (name.length < 2 || name.length > 80) return bad("Enter a subject name (2–80 characters).");
  if (!SUBJECT_CODE.test(code)) return bad("Codes are 2–12 letters, digits or dashes, e.g. MATH or LIT-2.");

  const { error } = await supabase.from("subjects").insert({ school_id: context.school.id, name, code });
  if (error?.code === "23505") return bad("A subject with that name or code already exists.");
  if (error) return bad(friendlyDbError(error, "The subject couldn’t be added."));
  return done(`${name} added.`, "/academics/subjects");
}

export async function updateSubject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, context } = await guard();
  const subjectId = id(formData);
  const name = text(formData, "name");
  const code = text(formData, "code").toUpperCase();
  if (!subjectId) return bad("That subject wasn’t found.");
  if (name.length < 2 || name.length > 80) return bad("Enter a subject name (2–80 characters).");
  if (!SUBJECT_CODE.test(code)) return bad("Codes are 2–12 letters, digits or dashes.");

  const { data, error } = await supabase
    .from("subjects")
    .update({ name, code })
    .eq("id", subjectId)
    .eq("school_id", context.school.id)
    .select("id");
  if (error?.code === "23505") return bad("Another subject already uses that name or code.");
  if (error || !data?.length) return bad(friendlyDbError(error, "The subject couldn’t be saved."));
  return done("Saved.", "/academics/subjects", "/classes");
}

/** Subjects are never deleted once created (future grades will reference them); they are deactivated. */
export async function setSubjectActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, context } = await guard();
  const subjectId = id(formData);
  const active = formData.get("active") === "true";
  if (!subjectId) return bad("That subject wasn’t found.");
  const { data, error } = await supabase
    .from("subjects")
    .update({ is_active: active })
    .eq("id", subjectId)
    .eq("school_id", context.school.id)
    .select("id");
  if (error || !data?.length) return bad(friendlyDbError(error, "The subject couldn’t be updated."));
  return done(active ? "Subject reactivated." : "Subject deactivated.", "/academics/subjects", "/classes");
}

// ---------------------------------------------------------------------------
// Grading: assessment categories and exam weight
// ---------------------------------------------------------------------------

const WEIGHT = /^\d{1,3}(\.\d{1,2})?$/;

function weightOf(formData: FormData): number | null {
  const raw = text(formData, "weight");
  if (!WEIGHT.test(raw)) return null;
  const n = Number(raw);
  return n >= 0 && n <= 100 ? n : null;
}

export async function addCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, context } = await guard();
  const name = text(formData, "name");
  const weight = weightOf(formData);
  if (name.length < 2 || name.length > 40) return bad("Enter a category name (2–40 characters).");
  if (weight === null) return bad("The weight must be a number from 0 to 100.");
  const { data: last } = await supabase
    .from("assessment_categories")
    .select("sequence")
    .eq("school_id", context.school.id)
    .order("sequence", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase
    .from("assessment_categories")
    .insert({ school_id: context.school.id, name, weight, sequence: Math.min((last?.sequence ?? 0) + 1, 99) });
  if (error?.code === "23505") return bad("A category with that name already exists.");
  if (error) return bad(friendlyDbError(error, "The category couldn’t be added."));
  return done(`${name} added.`, "/academics/grading");
}

export async function updateCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, context } = await guard();
  const categoryId = id(formData);
  const name = text(formData, "name");
  const weight = weightOf(formData);
  const active = formData.get("is_active") === "on";
  if (!categoryId) return bad("That category wasn’t found.");
  if (name.length < 2 || name.length > 40) return bad("Enter a category name (2–40 characters).");
  if (weight === null) return bad("The weight must be a number from 0 to 100.");
  const { data, error } = await supabase
    .from("assessment_categories")
    .update({ name, weight, is_active: active })
    .eq("id", categoryId)
    .eq("school_id", context.school.id)
    .select("id");
  if (error?.code === "23505") return bad("Another category already has that name.");
  if (error || !data?.length) return bad(friendlyDbError(error, "The category couldn’t be saved."));
  revalidatePath("/grades", "layout");
  return done("Saved.", "/academics/grading");
}

export async function updateExamWeight(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, context } = await guard();
  const weight = weightOf(formData);
  if (weight === null) return bad("The exam weight must be a number from 0 to 100.");
  const { data, error } = await supabase
    .from("school_settings")
    .update({ exam_weight: weight })
    .eq("school_id", context.school.id)
    .select("id");
  if (error || !data?.length) return bad(friendlyDbError(error, "The exam weight couldn’t be saved."));
  revalidatePath("/grades", "layout");
  return done(`Exam weight set to ${weight}%.`, "/academics/grading");
}
