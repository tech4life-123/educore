"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/services/auth";
import {
  MemberError,
  createMember,
  resetMemberPassword,
  setMemberStatus,
  type CreatedMember,
  type MemberRole,
} from "@/services/members";

export interface CreateUserState {
  formError?: string;
  fieldErrors?: Partial<Record<"username" | "email" | "role", string>>;
  created?: CreatedMember;
  /** Echo of submitted values so the form keeps them after an error. */
  values?: Record<string, string>;
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

export async function createUserAction(_prev: CreateUserState, formData: FormData): Promise<CreateUserState> {
  const { school } = await requireCapability("users.manage", "/users/new");

  const values = {
    firstName: field(formData, "firstName"),
    middleName: field(formData, "middleName"),
    lastName: field(formData, "lastName"),
    role: field(formData, "role"),
    username: field(formData, "username"),
    email: field(formData, "email"),
    phone: field(formData, "phone"),
  };

  try {
    const created = await createMember(
      { id: school.id, code: school.code },
      { ...values, role: values.role as MemberRole },
    );
    revalidatePath("/users");
    return { created };
  } catch (error) {
    if (error instanceof MemberError) {
      return error.field
        ? { fieldErrors: { [error.field]: error.message }, values }
        : { formError: error.message, values };
    }
    console.error("[users] create failed", error instanceof Error ? error.name : "unknown");
    return { formError: "Something went wrong. Please try again.", values };
  }
}

export interface MemberActionState {
  error?: string;
  success?: string;
  temporaryPassword?: string;
}

export async function setStatusAction(_prev: MemberActionState, formData: FormData): Promise<MemberActionState> {
  await requireCapability("users.manage", "/users");
  const profileId = field(formData, "profileId");
  const status = field(formData, "status");
  if (status !== "active" && status !== "suspended") return { error: "Invalid request." };

  try {
    await setMemberStatus(profileId, status);
    revalidatePath("/users");
    revalidatePath(`/users/${profileId}`);
    return { success: status === "active" ? "Account reactivated." : "Account suspended. They can no longer sign in." };
  } catch (error) {
    return { error: error instanceof MemberError ? error.message : "Something went wrong. Please try again." };
  }
}

export async function resetPasswordAction(_prev: MemberActionState, formData: FormData): Promise<MemberActionState> {
  await requireCapability("users.manage", "/users");
  const profileId = field(formData, "profileId");

  try {
    const temporaryPassword = await resetMemberPassword(profileId);
    revalidatePath(`/users/${profileId}`);
    return { success: "Password reset.", temporaryPassword };
  } catch (error) {
    return { error: error instanceof MemberError ? error.message : "Something went wrong. Please try again." };
  }
}
