import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

/**
 * Read access to the academic structure. Every query runs with the caller's
 * session, so RLS limits results to their own school.
 */

export type AcademicYear = Pick<Tables<"academic_years">, "id" | "name" | "starts_on" | "ends_on" | "is_current">;
export type GradingPeriod = Pick<Tables<"grading_periods">, "id" | "name" | "sequence" | "kind" | "starts_on" | "ends_on">;
export type AcademicTerm = Pick<Tables<"academic_terms">, "id" | "name" | "sequence" | "starts_on" | "ends_on"> & {
  grading_periods: GradingPeriod[];
};
export type AcademicYearDetail = AcademicYear & { academic_terms: AcademicTerm[] };
export type GradeLevel = Pick<Tables<"grade_levels">, "id" | "name" | "sequence" | "stage">;
export type Subject = Pick<Tables<"subjects">, "id" | "name" | "code" | "is_active">;

function fail(scope: string, error: { code?: string } | null): never {
  console.error(`[academics] ${scope} failed`, error?.code ?? "unknown");
  throw new Error(`Unable to load ${scope}`);
}

export const listAcademicYears = cache(async (schoolId: string): Promise<AcademicYear[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("academic_years")
    .select("id, name, starts_on, ends_on, is_current")
    .eq("school_id", schoolId)
    .order("starts_on", { ascending: false });
  if (error) fail("academic years", error);
  return data;
});

export const getCurrentAcademicYear = cache(async (schoolId: string): Promise<AcademicYear | null> => {
  const years = await listAcademicYears(schoolId);
  return years.find((y) => y.is_current) ?? null;
});

export const getAcademicYear = cache(async (schoolId: string, yearId: string): Promise<AcademicYearDetail | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("academic_years")
    .select(
      "id, name, starts_on, ends_on, is_current, academic_terms(id, name, sequence, starts_on, ends_on, grading_periods(id, name, sequence, kind, starts_on, ends_on))",
    )
    .eq("school_id", schoolId)
    .eq("id", yearId)
    .maybeSingle();
  if (error) fail("academic year", error);
  if (!data) return null;
  const terms = [...data.academic_terms]
    .sort((a, b) => a.sequence - b.sequence)
    .map((t) => ({ ...t, grading_periods: [...t.grading_periods].sort((a, b) => a.sequence - b.sequence) }));
  return { ...data, academic_terms: terms };
});

export const listGradeLevels = cache(async (schoolId: string): Promise<GradeLevel[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grade_levels")
    .select("id, name, sequence, stage")
    .eq("school_id", schoolId)
    .order("sequence");
  if (error) fail("grade levels", error);
  return data;
});

export const listSubjects = cache(async (schoolId: string, { activeOnly = false } = {}): Promise<Subject[]> => {
  const supabase = await createClient();
  let query = supabase.from("subjects").select("id, name, code, is_active").eq("school_id", schoolId);
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query.order("name");
  if (error) fail("subjects", error);
  return data;
});

export const STAGE_LABELS: Record<GradeLevel["stage"], string> = {
  early_childhood: "Early childhood",
  primary: "Primary",
  junior_high: "Junior high",
  senior_high: "Senior high",
  other: "Other",
};
