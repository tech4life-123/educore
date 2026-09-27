"use server";

import { revalidatePath } from "next/cache";
import { friendlyDbError, type ActionState } from "@/lib/action-state";
import { displayLoginId } from "@/lib/auth/login-id";
import { fullName } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/services/auth";
import { MemberError, createMember, resetMemberPassword, setMemberStatus, type CreatedMember } from "@/services/members";
import { getSchoolForPlatform } from "@/services/platform";

const field = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const STATUSES = new Set(["active", "suspended", "archived"] as const);
type SettableStatus = "active" | "suspended" | "archived";

/** Suspend, reactivate or archive a school. Authorized again inside the database. */
export async function setSchoolStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const schoolId = field(formData, "school_id");
  const status = field(formData, "status") as SettableStatus;
  if (!STATUSES.has(status)) return { status: "error", message: "Choose a valid status." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_set_school_status", { p_school_id: schoolId, p_status: status });
  if (error) return { status: "error", message: friendlyDbError(error, "The status couldn’t be changed.") };

  revalidatePath("/platform");
  revalidatePath(`/platform/schools/${schoolId}`);
  revalidatePath("/platform/statistics");
  const done = { active: "The school is active. Its members can sign in again.", suspended: "The school is suspended. Its members can no longer see any school data.", archived: "The school is archived." };
  return { status: "success", message: done[status] };
}

export interface AddAdminState {
  formError?: string;
  fieldErrors?: Partial<Record<"firstName" | "lastName" | "username" | "email", string>>;
  values?: Record<string, string>;
  created?: CreatedMember;
}

/** Create another administrator account in an existing school. */
export async function addSchoolAdminAction(_prev: AddAdminState, formData: FormData): Promise<AddAdminState> {
  await requireSuperAdmin();
  const schoolId = field(formData, "school_id");
  const values = {
    firstName: field(formData, "firstName"),
    middleName: field(formData, "middleName"),
    lastName: field(formData, "lastName"),
    username: field(formData, "username").toLowerCase(),
    email: field(formData, "email").toLowerCase(),
    phone: field(formData, "phone"),
  };

  const found = await getSchoolForPlatform(schoolId);
  if (found.status !== "ok") return { formError: "That school couldn’t be loaded.", values };
  if (found.school.status === "archived") {
    return { formError: "This school is archived. Reactivate it before adding administrators.", values };
  }

  try {
    const created = await createMember({ id: found.school.id, code: found.school.code }, { ...values, role: "school_admin" });
    revalidatePath(`/platform/schools/${schoolId}`);
    return { created };
  } catch (error) {
    if (error instanceof MemberError) {
      return error.field && error.field !== "role"
        ? { fieldErrors: { [error.field]: error.message }, values }
        : { formError: error.message, values };
    }
    console.error("[platform] add admin failed", error instanceof Error ? error.name : "unknown");
    return { formError: "Something went wrong. Please try again.", values };
  }
}

export interface AdminAccountState extends ActionState {
  slip?: { fullName: string; loginId: string; temporaryPassword: string };
}

/** Resolve an administrator of THIS school, so a crafted form can't touch anyone else. */
async function schoolAdmin(formData: FormData) {
  const schoolId = field(formData, "school_id");
  const profileId = field(formData, "profile_id");
  const found = await getSchoolForPlatform(schoolId);
  if (found.status !== "ok") return null;
  const person = found.admins.find((a) => a.id === profileId);
  return person ? { school: found.school, person } : null;
}

/** New temporary password for a school administrator (e.g. the only admin forgot theirs). */
export async function resetAdminPasswordAction(_prev: AdminAccountState, formData: FormData): Promise<AdminAccountState> {
  await requireSuperAdmin();
  const target = await schoolAdmin(formData);
  if (!target) return { status: "error", message: "Administrator not found." };
  try {
    const temporaryPassword = await resetMemberPassword(target.person.id);
    return {
      status: "success",
      message: "Password reset. Hand this slip to the administrator; it is shown only once.",
      slip: {
        fullName: fullName({ first_name: target.person.firstName, middle_name: target.person.middleName, last_name: target.person.lastName }),
        loginId: displayLoginId(target.person, target.school.code),
        temporaryPassword,
      },
    };
  } catch (error) {
    return { status: "error", message: error instanceof MemberError ? error.message : "The password couldn’t be reset." };
  }
}

/** Suspend or reactivate one administrator account. */
export async function setAdminStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const target = await schoolAdmin(formData);
  if (!target) return { status: "error", message: "Administrator not found." };
  const status = field(formData, "status");
  if (status !== "active" && status !== "suspended") return { status: "error", message: "Choose a valid status." };
  try {
    await setMemberStatus(target.person.id, status);
  } catch (error) {
    return { status: "error", message: error instanceof MemberError ? error.message : "The status couldn’t be changed." };
  }
  revalidatePath(`/platform/schools/${target.school.id}`);
  return { status: "success", message: status === "active" ? "Account reactivated." : "Account suspended." };
}
