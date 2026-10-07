import { Badge } from "@/components/ui/badge";
import type { Enums } from "@/types/database";

const STATUS: Record<Enums<"profile_status">, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  active: { label: "Active", tone: "success" },
  invited: { label: "Invited", tone: "warning" },
  suspended: { label: "Suspended", tone: "danger" },
  inactive: { label: "Inactive", tone: "neutral" },
};

export function StatusBadge({ status }: { status: Enums<"profile_status"> }) {
  const s = STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "inactive", label: "Inactive" },
] as const;

export const ROLE_FILTER_OPTIONS = [
  { value: "student", label: "Students" },
  { value: "teacher", label: "Teachers" },
  { value: "parent", label: "Parents" },
  { value: "school_admin", label: "Administrators" },
  { value: "finance_officer", label: "Finance officers" },
  { value: "admissions_officer", label: "Admissions officers" },
] as const;
