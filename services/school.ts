import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { SchoolSettings } from "./auth";

export type SchoolSettingsView = Pick<
  SchoolSettings,
  "academic_system" | "passing_score" | "attendance_threshold" | "allow_parent_accounts" | "allow_student_registration"
>;

/**
 * Settings for the caller's own school. RLS returns nothing for any other
 * school, so a tampered schoolId simply yields null.
 */
export const getSchoolSettings = cache(async (schoolId: string): Promise<SchoolSettingsView | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_settings")
    .select("academic_system, passing_score, attendance_threshold, allow_parent_accounts, allow_student_registration")
    .eq("school_id", schoolId)
    .maybeSingle();

  if (error) {
    console.error("[school] settings lookup failed", error.code);
    throw new Error("Unable to load school settings");
  }
  return data;
});
