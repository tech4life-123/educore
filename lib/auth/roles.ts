import type { Enums } from "@/types/database";

export type AppRole = Enums<"app_role">;
export type SchoolRole = Exclude<AppRole, "super_admin">;

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Platform Administrator",
  school_admin: "School Administrator",
  teacher: "Teacher",
  student: "Student",
  parent: "Parent / Guardian",
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
export type Capability = "school.manage" | "users.manage" | "profiles.view_school" | "audit.view";

const CAPABILITIES: Record<AppRole, readonly Capability[]> = {
  super_admin: [],
  school_admin: ["school.manage", "users.manage", "profiles.view_school", "audit.view"],
  teacher: ["profiles.view_school"],
  student: [],
  parent: [],
};

/** Roles a school administrator may assign. */
export const ASSIGNABLE_ROLES: readonly SchoolRole[] = ["student", "teacher", "parent", "school_admin"];

export function hasCapability(role: AppRole, capability: Capability): boolean {
  return CAPABILITIES[role].includes(capability);
}
