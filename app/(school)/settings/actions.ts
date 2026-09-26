"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSchoolMember } from "@/services/auth";

export interface ProfileFormState {
  status?: "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<"first_name" | "middle_name" | "last_name" | "phone", string>>;
}

const PHONE_PATTERN = /^\+?[0-9 ()-]{7,20}$/;

function clean(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

/**
 * Update the caller's own personal details. Only these four columns are
 * writable by browser roles (column privileges), and RLS limits the row to
 * the caller's own profile — role/school cannot be changed here.
 */
export async function updateOwnProfile(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const { user } = await requireSchoolMember("/settings");

  const values = {
    first_name: clean(formData.get("first_name")),
    middle_name: clean(formData.get("middle_name")),
    last_name: clean(formData.get("last_name")),
    phone: clean(formData.get("phone")),
  };

  const fieldErrors: ProfileFormState["fieldErrors"] = {};
  if (!values.first_name) fieldErrors.first_name = "First name is required.";
  else if (values.first_name.length > 100) fieldErrors.first_name = "Use 100 characters or fewer.";
  if (values.middle_name.length > 100) fieldErrors.middle_name = "Use 100 characters or fewer.";
  if (!values.last_name) fieldErrors.last_name = "Last name is required.";
  else if (values.last_name.length > 100) fieldErrors.last_name = "Use 100 characters or fewer.";
  if (values.phone && !PHONE_PATTERN.test(values.phone)) {
    fieldErrors.phone = "Enter a valid phone number, e.g. +231 77 000 0000.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .update({
        first_name: values.first_name,
        middle_name: values.middle_name || null,
        last_name: values.last_name,
        phone: values.phone || null,
      })
      .eq("user_id", user.id)
      .select("id");

    if (error || !data || data.length !== 1) {
      console.error("[settings] profile update failed", error?.code ?? "no-row");
      return { status: "error", message: "Your changes couldn’t be saved. Please try again." };
    }
  } catch (error) {
    console.error("[settings] profile update threw", error instanceof Error ? error.name : "unknown");
    return { status: "error", message: "We couldn’t reach the server. Check your connection and try again." };
  }

  revalidatePath("/", "layout");
  return { status: "success", message: "Your profile has been updated." };
}
