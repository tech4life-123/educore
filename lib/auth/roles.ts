import type { Enums } from "@/types/database";

export type AppRole = Enums<"app_role">;
export type SchoolRole = Exclude<AppRole, "super_admin">;

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Platform Administrator",
  school_admin: "School Administrator",
  teacher: "Teacher",
  student: "Student",
  parent: "Parent / Guardian",
  finance_officer: "Finance Officer",
  admissions_officer: "Admissions Officer",
};

/** Where each role lands after signing in. */
export function homePathForRole(role: AppRole): "/platform" | "/dashboard" {
  return role === "super_admin" ? "/platform" : "/dashboard";
}

/**
 * Application-level capabilities. These drive UI and server-side route
 * guards; the database enforces the same rules independently through RLS and
 * column privileges, so a UI bug can never widen access.
 */
export type Capability = "finance.manage" | "documents.manage" | "school.manage" | "users.manage" | "profiles.view_school" | "audit.view" | "classes.view" | "grades.enter" | "reports.view";

const CAPABILITIES: Record<AppRole, readonly Capability[]> = {
  super_admin: [],
  school_admin: ["finance.manage", "documents.manage", "school.manage", "users.manage", "profiles.view_school", "audit.view", "classes.view", "grades.enter", "reports.view"],
  teacher: ["profiles.view_school", "classes.view", "grades.enter"],
  student: [],
  parent: [],
  finance_officer: ["finance.manage", "documents.manage"],
  admissions_officer: ["documents.manage"],
};

/** Roles a school administrator may assign. */
export const ASSIGNABLE_ROLES: readonly SchoolRole[] = ["student", "teacher", "parent", "school_admin", "finance_officer", "admissions_officer"];

export function hasCapability(role: AppRole, capability: Capability): boolean {
  return CAPABILITIES[role].includes(capability);
}
