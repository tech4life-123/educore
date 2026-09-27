"use server";

import { revalidatePath } from "next/cache";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { requireCapability } from "@/services/auth";
import { BULK_RESET_MAX, bulkResetPasswords, findResetTargets, type MemberRole } from "@/services/members";

const ROLES: MemberRole[] = ["student", "teacher", "parent", "school_admin"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ResetState {
  step: "choose" | "confirm" | "done";
  error?: string;
  filters?: { role: MemberRole; classId: string; onlyTemporary: boolean };
  targets?: { id: string; fullName: string; login: string }[];
  truncated?: boolean;
  results?: { key: string; fullName: string; roleLabel: string; loginId?: string; temporaryPassword?: string; error?: string }[];
}

function readFilters(formData: FormData) {
  const role = String(formData.get("role") ?? "") as MemberRole;
  const classRaw = String(formData.get("class_id") ?? "");
  const classId = role === "student" && UUID.test(classRaw) ? classRaw : "";
  const onlyTemporary = formData.get("only_temporary") === "on";
  return ROLES.includes(role) ? { role, classId, onlyTemporary } : null;
}

export async function bulkResetAction(prev: ResetState, formData: FormData): Promise<ResetState> {
  const { school, profile } = await requireCapability("users.manage", "/users/reset");
  const intent = String(formData.get("intent") ?? "preview");
  const filters = readFilters(formData);
  if (!filters) return { step: "choose", error: "Choose which accounts to reset." };

  const query = { schoolId: school.id, ...filters, classId: filters.classId || undefined, excludeProfileId: profile.id };

  try {
    const targets = await findResetTargets(query);

    if (intent === "preview") {
      return {
        step: "confirm",
        filters,
        truncated: targets.length > BULK_RESET_MAX,
        targets: targets.slice(0, BULK_RESET_MAX).map((t) => ({
          id: t.id,
          fullName: [t.first_name, t.middle_name, t.last_name].filter(Boolean).join(" "),
          login: t.username ?? t.email ?? "",
        })),
      };
    }

    if (formData.get("understood") !== "on") {
      return { ...prev, step: "confirm", error: "Tick the box to confirm you understand the current passwords will stop working." };
    }
    // Reset only accounts that were on the confirmed list AND still match the filters now.
    const confirmed = new Set(formData.getAll("target").map(String));
    const chosen = targets.slice(0, BULK_RESET_MAX).filter((t) => confirmed.has(t.id));
    if (chosen.length === 0) return { ...prev, step: "confirm", error: "No accounts left to reset. Start again." };

    const results = await bulkResetPasswords(chosen, school.code);
    revalidatePath("/users");
    return {
      step: "done",
      filters,
      results: results.map((r) => ({
        key: r.profileId,
        fullName: r.fullName,
        roleLabel: ROLE_LABELS[r.role],
        loginId: r.loginId,
        temporaryPassword: r.temporaryPassword,
        error: r.error,
      })),
    };
  } catch (error) {
    console.error("[users] bulk reset failed", error instanceof Error ? error.name : "unknown");
    return { ...prev, error: "Something went wrong. Nothing more was changed — please try again." };
  }
}
