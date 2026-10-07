import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateTemporaryPassword } from "@/lib/auth/temp-password";
import { displayLoginId, internalAuthEmail, isValidUsername, normalizeUsername } from "@/lib/auth/login-id";
import type { Enums, Tables } from "@/types/database";

/**
 * Member (user account) management.
 *
 * Order of operations for every privileged action:
 *   1. The DATABASE authorizes the caller, using the caller's own session, via
 *      a SECURITY DEFINER function (create_member / set_member_status /
 *      require_password_change). School scoping is enforced there.
 *   2. Only then does the server use the service-role client to make the
 *      matching change in Supabase Auth (create account, ban, set password).
 * Creation is the one exception: the Auth account must exist before it can be
 * linked, so it is created first and deleted again if the database refuses.
 */

export type MemberRole = Exclude<Enums<"app_role">, "super_admin">;
export type MemberStatus = Enums<"profile_status">;

export type MemberRow = Pick<
  Tables<"profiles">,
  | "id"
  | "first_name"
  | "middle_name"
  | "last_name"
  | "role"
  | "status"
  | "username"
  | "email"
  | "phone"
  | "must_change_password"
  | "created_at"
>;

const MEMBER_COLUMNS =
  "id, first_name, middle_name, last_name, role, status, username, email, phone, must_change_password, created_at" as const;

export class MemberError extends Error {
  constructor(
    message: string,
    readonly field?: "username" | "email" | "role",
  ) {
    super(message);
    this.name = "MemberError";
  }
}

export interface NewMemberInput {
  firstName: string;
  middleName?: string;
  lastName: string;
  role: MemberRole;
  username?: string;
  email?: string;
  phone?: string;
}

export interface CreatedMember {
  profileId: string;
  fullName: string;
  role: MemberRole;
  loginId: string;
  temporaryPassword: string;
}

function requireAdminClient() {
  const admin = createAdminClient();
  if (!admin) {
    throw new MemberError(
      "Account management is not configured on this server (missing SUPABASE_SERVICE_ROLE_KEY). Contact the platform administrator.",
    );
  }
  return admin;
}

function messageForRpcError(error: PostgrestError): MemberError {
  if (error.code === "23505") return new MemberError("That username is already taken at this school.", "username");
  if (error.code === "22023") return new MemberError(error.message);
  if (error.code === "42501") return new MemberError("You don’t have permission to do that.");
  console.error("[members] rpc failed", error.code);
  return new MemberError("The change couldn’t be saved. Please try again.");
}

/** Validate and normalise a new-member request. Throws MemberError. */
export function validateNewMember(input: NewMemberInput): NewMemberInput {
  const firstName = input.firstName.trim().replace(/\s+/g, " ");
  const lastName = input.lastName.trim().replace(/\s+/g, " ");
  const middleName = input.middleName?.trim().replace(/\s+/g, " ") || undefined;
  const username = input.username ? normalizeUsername(input.username) : undefined;
  const email = input.email?.trim().toLowerCase() || undefined;
  const phone = input.phone?.trim() || undefined;

  if (!firstName || firstName.length > 100) throw new MemberError("First name is required (up to 100 characters).");
  if (!lastName || lastName.length > 100) throw new MemberError("Last name is required (up to 100 characters).");
  if (middleName && middleName.length > 100) throw new MemberError("Middle name is too long.");
  if (!["student", "teacher", "parent", "school_admin", "finance_officer"].includes(input.role)) {
    throw new MemberError("Choose a valid role.", "role");
  }
  if (!username && !email) throw new MemberError("Give a username, an email address, or both.", "username");
  if (username && !isValidUsername(username)) {
    throw new MemberError(
      "Usernames are 3–32 characters: lower-case letters, numbers, dots, dashes or underscores, starting with a letter or number.",
      "username",
    );
  }
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || email.endsWith(".invalid"))) {
    throw new MemberError("Enter a valid email address.", "email");
  }
  if (phone && !/^\+?[0-9 ()-]{7,20}$/.test(phone)) throw new MemberError("Enter a valid phone number, e.g. +231 77 000 0000.");

  return { firstName, middleName, lastName, role: input.role, username, email, phone };
}

/**
 * Create an account and link it to `school`. The caller must be a school admin
 * of that school or a platform super admin — enforced by create_member().
 */
export async function createMember(
  school: { id: string; code: string },
  raw: NewMemberInput,
): Promise<CreatedMember> {
  const input = validateNewMember(raw);
  const admin = requireAdminClient();
  const supabase = await createClient();
  const temporaryPassword = generateTemporaryPassword();
  const authEmail = input.email ?? internalAuthEmail(input.username!, school.code);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: authEmail,
    password: temporaryPassword,
    email_confirm: true, // no confirmation email is ever sent
    app_metadata: { educore_school_id: school.id },
  });

  if (createError || !created.user) {
    if (createError?.code === "email_exists" || createError?.code === "user_already_exists") {
      throw input.email
        ? new MemberError("An account with this email address already exists.", "email")
        : new MemberError("That username is already taken at this school.", "username");
    }
    if (createError?.code === "email_address_invalid") {
      throw input.email
        ? new MemberError("That email address was rejected. Check it and try again.", "email")
        : new MemberError("Username accounts are not accepted by the sign-in service. Contact the platform administrator.");
    }
    console.error("[members] auth createUser failed", createError?.code ?? createError?.status);
    throw new MemberError("The account couldn’t be created. Please try again.");
  }

  const { data: profileId, error: rpcError } = await supabase.rpc("create_member", {
    p_school_id: school.id,
    p_user_id: created.user.id,
    p_first_name: input.firstName,
    p_middle_name: input.middleName ?? "",
    p_last_name: input.lastName,
    p_role: input.role,
    p_username: input.username ?? "",
    p_email: input.email ?? "",
    p_phone: input.phone ?? "",
  });

  if (rpcError || !profileId) {
    // The database refused: remove the orphaned Auth account.
    const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
    if (cleanupError) console.error("[members] cleanup failed for orphaned auth user", cleanupError.code);
    throw rpcError ? messageForRpcError(rpcError) : new MemberError("The account couldn’t be created.");
  }

  return {
    profileId,
    fullName: [input.firstName, input.middleName, input.lastName].filter(Boolean).join(" "),
    role: input.role,
    loginId: displayLoginId({ username: input.username ?? null, email: input.email ?? null }, school.code),
    temporaryPassword,
  };
}

/** Suspend, reactivate or deactivate a member. Mirrors the change as an Auth ban. */
export async function setMemberStatus(profileId: string, status: Exclude<MemberStatus, "invited">) {
  const admin = requireAdminClient();
  const supabase = await createClient();

  const { data: userId, error } = await supabase.rpc("set_member_status", {
    p_profile_id: profileId,
    p_status: status,
  });
  if (error || !userId) throw error ? messageForRpcError(error) : new MemberError("User not found.");

  // A banned user can't sign in or refresh a session. Access to data is
  // already cut by RLS the moment the profile stops being active.
  const { error: banError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: status === "active" ? "none" : "876000h",
  });
  if (banError) {
    console.error("[members] ban sync failed", banError.code);
    throw new MemberError(
      "The status was saved, but signing the user out everywhere failed. Their data access is already blocked; try again to finish.",
    );
  }
}

/** Set a new temporary password. Returns it so the admin can hand it over once. */
export async function resetMemberPassword(profileId: string): Promise<string> {
  const admin = requireAdminClient();
  const supabase = await createClient();

  const { data: userId, error } = await supabase.rpc("require_password_change", { p_profile_id: profileId });
  if (error || !userId) throw error ? messageForRpcError(error) : new MemberError("User not found.");

  const temporaryPassword = generateTemporaryPassword();
  const { error: authError } = await admin.auth.admin.updateUserById(userId, { password: temporaryPassword });
  if (authError) {
    console.error("[members] password reset failed", authError.code);
    throw new MemberError("The password couldn’t be reset. Please try again.");
  }
  return temporaryPassword;
}

// ---------------------------------------------------------------------------
// Reads (RLS-bound: a school admin only ever sees their own school)
// ---------------------------------------------------------------------------

export interface MemberListQuery {
  schoolId: string;
  role?: MemberRole;
  status?: MemberStatus;
  search?: string;
  page?: number;
}

export const MEMBERS_PAGE_SIZE = 25;

export async function listMembers(query: MemberListQuery): Promise<{ rows: MemberRow[]; total: number }> {
  const supabase = await createClient();
  const page = Math.max(1, query.page ?? 1);
  const from = (page - 1) * MEMBERS_PAGE_SIZE;

  let request = supabase
    .from("profiles")
    .select(MEMBER_COLUMNS, { count: "exact" })
    .eq("school_id", query.schoolId)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })
    .range(from, from + MEMBERS_PAGE_SIZE - 1);

  if (query.role) request = request.eq("role", query.role);
  if (query.status) request = request.eq("status", query.status);

  // Only letters, digits, spaces, dots, dashes, @ — prevents filter-syntax injection.
  const term = query.search?.replace(/[^\p{L}\p{N} .@_-]/gu, "").trim().slice(0, 60);
  if (term) {
    const like = `"%${term}%"`;
    request = request.or(
      `first_name.ilike.${like},last_name.ilike.${like},username.ilike.${like},email.ilike.${like}`,
    );
  }

  const { data, count, error } = await request;
  if (error) {
    console.error("[members] list failed", error.code);
    throw new Error("Unable to load users");
  }
  return { rows: data ?? [], total: count ?? 0 };
}

export async function getMember(schoolId: string, profileId: string): Promise<MemberRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(MEMBER_COLUMNS)
    .eq("school_id", schoolId)
    .eq("id", profileId)
    .maybeSingle();
  if (error) {
    console.error("[members] get failed", error.code);
    throw new Error("Unable to load user");
  }
  return data;
}

export async function existingUsernames(schoolId: string, usernames: string[]): Promise<Set<string>> {
  if (usernames.length === 0) return new Set();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("username")
    .eq("school_id", schoolId)
    .in("username", usernames);
  if (error) throw new Error("Unable to check usernames");
  return new Set((data ?? []).map((r) => r.username).filter((u): u is string => Boolean(u)));
}

// ---------------------------------------------------------------------------
// Bulk password reset
// ---------------------------------------------------------------------------

export const BULK_RESET_MAX = 200;

export interface ResetTargetQuery {
  schoolId: string;
  role: MemberRole;
  /** Students only: limit to one class. */
  classId?: string;
  /** Only accounts that have not yet chosen their own password. */
  onlyTemporary: boolean;
  /** Never include the admin doing the reset. */
  excludeProfileId: string;
}

export type ResetTarget = Pick<MemberRow, "id" | "first_name" | "middle_name" | "last_name" | "role" | "username" | "email">;

/** Active accounts matching the filters (RLS-bound: own school only). */
export async function findResetTargets(query: ResetTargetQuery): Promise<ResetTarget[]> {
  const supabase = await createClient();
  let request = supabase
    .from("profiles")
    .select("id, first_name, middle_name, last_name, role, username, email")
    .eq("school_id", query.schoolId)
    .eq("role", query.role)
    .eq("status", "active")
    .neq("id", query.excludeProfileId)
    .order("last_name")
    .order("first_name")
    .limit(BULK_RESET_MAX + 1);
  if (query.onlyTemporary) request = request.eq("must_change_password", true);

  if (query.classId) {
    const { data: enrolled, error } = await supabase
      .from("enrollments")
      .select("student_id")
      .eq("school_id", query.schoolId)
      .eq("class_id", query.classId);
    if (error) throw new Error("Unable to load the class");
    const ids = enrolled.map((e) => e.student_id);
    if (ids.length === 0) return [];
    request = request.in("id", ids);
  }

  const { data, error } = await request;
  if (error) {
    console.error("[members] reset targets failed", error.code);
    throw new Error("Unable to load users");
  }
  return data;
}

export interface BulkResetResult {
  profileId: string;
  fullName: string;
  role: MemberRole;
  loginId?: string;
  temporaryPassword?: string;
  error?: string;
}

/** Reset each account's password (the database authorizes every one). */
export async function bulkResetPasswords(targets: ResetTarget[], schoolCode: string): Promise<BulkResetResult[]> {
  const results: BulkResetResult[] = [];
  const queue = [...targets];
  const CONCURRENCY = 4;

  async function worker() {
    for (let t = queue.shift(); t; t = queue.shift()) {
      const fullName = [t.first_name, t.middle_name, t.last_name].filter(Boolean).join(" ");
      try {
        const temporaryPassword = await resetMemberPassword(t.id);
        results.push({ profileId: t.id, fullName, role: t.role as MemberRole, loginId: displayLoginId(t, schoolCode), temporaryPassword });
      } catch (e) {
        results.push({
          profileId: t.id,
          fullName,
          role: t.role as MemberRole,
          error: e instanceof MemberError ? e.message : "Couldn’t reset this password.",
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  const order = new Map(targets.map((t, i) => [t.id, i]));
  return results.sort((a, b) => (order.get(a.profileId) ?? 0) - (order.get(b.profileId) ?? 0));
}
