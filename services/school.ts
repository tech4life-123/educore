import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { School, SchoolSettings } from "./auth";

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

export type SchoolProfileView = Pick<
  School,
  | "id"
  | "name"
  | "code"
  | "motto"
  | "address"
  | "city"
  | "county"
  | "country"
  | "phone"
  | "email"
  | "website"
  | "logo_url"
  | "cover_image_url"
  | "primary_color"
  | "secondary_color"
  | "timezone"
  | "is_demo"
>;

/** Editable profile of the caller's own school (RLS: own school only). */
export const getSchoolProfile = cache(async (schoolId: string): Promise<SchoolProfileView | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schools")
    .select(
      "id, name, code, motto, address, city, county, country, phone, email, website, logo_url, cover_image_url, primary_color, secondary_color, timezone, is_demo",
    )
    .eq("id", schoolId)
    .maybeSingle();

  if (error) {
    console.error("[school] profile lookup failed", error.code);
    throw new Error("Unable to load the school profile");
  }
  return data;
});
