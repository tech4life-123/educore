"use server";

import { revalidatePath } from "next/cache";
import { friendlyDbError, type ActionState } from "@/lib/action-state";
import { cardAverage } from "@/lib/grades/report-card";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/services/auth";
import { buildClassReportCards, getClassContext } from "@/services/report-cards";

/**
 * Report card actions. Issuing is admin-only (RLS); remarks may be written by
 * the class's homeroom teacher or an admin (RLS); promotion overrides are
 * admin-only (RLS). The page guards only decide what to show.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ok = (message: string): ActionState => ({ status: "success", message });
const bad = (message: string): ActionState => ({ status: "error", message });
const uuid = (formData: FormData, key: string) => {
  const v = String(formData.get(key) ?? "").trim();
  return UUID.test(v) ? v : null;
};

export async function issueReportCards(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { school } = await requireCapability("school.manage", "/report-cards");
  const classId = uuid(formData, "class_id");
  const termId = uuid(formData, "term_id");
  if (!classId || !termId) return bad("Choose a class and a semester.");

  const ctx = await getClassContext(school.id, classId);
  const term = ctx?.terms.find((t) => t.id === termId);
  if (!ctx || !term) return bad("That class or semester wasn’t found.");
  if (!term.periods.some((p) => p.published)) {
    return bad(`No grading period of ${term.name} has been published yet. Publish grades first (Grades page).`);
  }

  try {
    const cards = await buildClassReportCards(school.id, school.code, ctx, termId);
    if (cards.size === 0) return bad("There are no active students in this class.");
    const supabase = await createClient();
    const rows = [...cards.entries()].map(([studentId, data]) => {
      const avg = cardAverage(data);
      return {
        school_id: school.id,
        student_id: studentId,
        class_id: classId,
        academic_year_id: ctx.year.id,
        term_id: termId,
        data: JSON.parse(JSON.stringify(data)),
        average: avg === null ? null : Math.round(avg * 100) / 100,
        rank: data.rank.position,
        class_size: data.rank.of,
      };
    });
    const { error } = await supabase.from("report_cards").upsert(rows, { onConflict: "student_id,term_id" });
    if (error) return bad(friendlyDbError(error, "The report cards couldn’t be issued."));
  } catch (error) {
    console.error("[report-cards] issue failed", error instanceof Error ? error.message : "unknown");
    return bad("The report cards couldn’t be issued. Please try again.");
  }

  revalidatePath("/report-cards", "layout");
  return ok(`Report cards issued for class ${ctx.name} (${term.name}). Students and linked parents can now see them.`);
}

export async function saveRemarks(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { school } = await requireCapability("grades.enter", "/report-cards");
  const classId = uuid(formData, "class_id");
  const termId = uuid(formData, "term_id");
  if (!classId || !termId) return bad("Choose a class and a semester.");

  const upserts: { school_id: string; student_id: string; class_id: string; term_id: string; remark: string }[] = [];
  const clears: string[] = [];
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("remark:")) continue;
    const studentId = key.slice(7);
    if (!UUID.test(studentId)) continue;
    const remark = String(raw).trim().replace(/\s+/g, " ");
    if (remark.length > 600) return bad("Remarks can be at most 600 characters.");
    if (remark) upserts.push({ school_id: school.id, student_id: studentId, class_id: classId, term_id: termId, remark });
    else clears.push(studentId);
  }

  const supabase = await createClient();
  if (upserts.length) {
    const { error } = await supabase.from("report_card_remarks").upsert(upserts, { onConflict: "student_id,term_id" });
    if (error?.code === "42501") return bad("Only this class’s homeroom teacher or an administrator can write remarks.");
    if (error) return bad(friendlyDbError(error, "The remarks couldn’t be saved."));
  }
  if (clears.length) {
    const { error } = await supabase
      .from("report_card_remarks")
      .delete()
      .eq("school_id", school.id)
      .eq("term_id", termId)
      .eq("class_id", classId)
      .in("student_id", clears);
    if (error) return bad(friendlyDbError(error, "Some remarks couldn’t be cleared."));
  }
  revalidatePath("/report-cards", "layout");
  return ok(`Saved ${upserts.length} remark${upserts.length === 1 ? "" : "s"}.`);
}

export async function setPromotion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { school } = await requireCapability("school.manage", "/report-cards");
  const studentId = uuid(formData, "student_id");
  const yearId = uuid(formData, "academic_year_id");
  const decision = String(formData.get("decision") ?? "auto");
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  if (!studentId || !yearId) return bad("That student wasn’t found.");

  const supabase = await createClient();
  if (decision === "auto") {
    const { error } = await supabase
      .from("promotion_decisions")
      .delete()
      .eq("school_id", school.id)
      .eq("student_id", studentId)
      .eq("academic_year_id", yearId);
    if (error) return bad(friendlyDbError(error, "The decision couldn’t be changed."));
  } else if (decision === "promoted" || decision === "not_promoted") {
    const { error } = await supabase
      .from("promotion_decisions")
      .upsert(
        { school_id: school.id, student_id: studentId, academic_year_id: yearId, decision, note: note || null },
        { onConflict: "student_id,academic_year_id" },
      );
    if (error) return bad(friendlyDbError(error, "The decision couldn’t be saved."));
  } else {
    return bad("Choose a decision.");
  }
  revalidatePath("/report-cards", "layout");
  return ok("Saved.");
}
