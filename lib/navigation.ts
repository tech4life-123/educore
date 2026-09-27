import type { IconName } from "@/components/ui/icons";
import type { SchoolRole } from "@/lib/auth/roles";

/**
 * Role-aware navigation for school users.
 *
 * `available: false` marks modules planned for later milestones. They are
 * shown (so users can see what is coming) but rendered as disabled items —
 * there are no pages or fake functionality behind them.
 *
 * To add a module: create app/(school)/<module>/page.tsx guarded with
 * requireSchoolMember / requireCapability, then flip `available` to true.
 * Hiding a link is never the access control — the page guard and RLS are.
 */
export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  available: boolean;
  roles: readonly SchoolRole[];
}

const ALL: readonly SchoolRole[] = ["school_admin", "teacher", "student", "parent"];

export const SCHOOL_NAVIGATION: readonly NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "dashboard", available: true, roles: ALL },
  { label: "User accounts", href: "/users", icon: "user", available: true, roles: ["school_admin"] },
  { label: "Academic setup", href: "/academics", icon: "subjects", available: true, roles: ["school_admin"] },
  { label: "Students", href: "/students", icon: "students", available: false, roles: ["school_admin", "teacher"] },
  { label: "Teachers", href: "/teachers", icon: "teachers", available: false, roles: ["school_admin"] },
  { label: "Classes", href: "/classes", icon: "classes", available: true, roles: ["school_admin", "teacher"] },
  { label: "Attendance", href: "/attendance", icon: "attendance", available: false, roles: ALL },
  { label: "Assessments", href: "/assessments", icon: "assessments", available: false, roles: ["school_admin", "teacher"] },
  { label: "Examinations", href: "/examinations", icon: "examinations", available: false, roles: ["school_admin", "teacher"] },
  { label: "Grades", href: "/grades", icon: "grades", available: false, roles: ALL },
  { label: "Report Cards", href: "/report-cards", icon: "reportCards", available: false, roles: ["school_admin", "student", "parent"] },
  { label: "Announcements", href: "/announcements", icon: "announcements", available: false, roles: ALL },
  { label: "Reports", href: "/reports", icon: "reports", available: false, roles: ["school_admin"] },
  { label: "Settings", href: "/settings", icon: "settings", available: true, roles: ALL },
];

export function navigationFor(role: SchoolRole): NavItem[] {
  return SCHOOL_NAVIGATION.filter((item) => item.roles.includes(role));
}
