"use server";

import { revalidatePath } from "next/cache";
import { friendlyDbError, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/services/auth";

/**
 * Parent ↔ student links (school administrators). RLS limits writes to the
 * caller's school; a database trigger checks that the parent side has the
 * parent role and the child side the student role.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RELATIONSHIPS = ["mother", "father", "guardian", "grandparent", "sibling", "other"] as const;

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function linkGuardian(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { school } = await requireCapability("users.manage", "/users");
  const parentId = value(formData, "parent_id");
  const studentId = value(formData, "student_id");
  const relationship = value(formData, "relationship");
  const isPrimary = formData.get("is_primary") === "on";

  if (!UUID.test(parentId) || !UUID.test(studentId)) {
    return { status: "error", message: "Choose a person from the list." };
  }
  if (!(RELATIONSHIPS as readonly string[]).includes(relationship)) {
    return { status: "error", message: "Choose the relationship." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("guardian_links").insert({
    school_id: school.id,
    parent_id: parentId,
    student_id: studentId,
    relationship,
    is_primary: isPrimary,
  });
  if (error?.code === "23505") return { status: "error", message: "These two accounts are already linked." };
  if (error) return { status: "error", message: friendlyDbError(error, "The link couldn’t be saved.") };

  revalidatePath(`/users/${parentId}`);
  revalidatePath(`/users/${studentId}`);
  revalidatePath("/dashboard");
  return { status: "success", message: "Linked." };
}

export async function unlinkGuardian(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { school } = await requireCapability("users.manage", "/users");
  const linkId = value(formData, "id");
  const back = value(formData, "profile_id");
  if (!UUID.test(linkId) || !UUID.test(back)) return { status: "error", message: "That link wasn’t found." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("guardian_links")
    .delete()
    .eq("id", linkId)
    .eq("school_id", school.id)
    .select("parent_id, student_id");
  if (error || !data?.length) return { status: "error", message: friendlyDbError(error, "The link couldn’t be removed.") };

  revalidatePath(`/users/${data[0].parent_id}`);
  revalidatePath(`/users/${data[0].student_id}`);
  revalidatePath("/dashboard");
  return { status: "success", message: "Link removed." };
}
