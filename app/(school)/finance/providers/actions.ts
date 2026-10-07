"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { friendlyDbError } from "@/lib/action-state";
import { isProviderCode } from "@/lib/payments/types";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/services/auth";

/**
 * Payment-provider account management. School administrators only: the
 * database functions re-check the role, so this guard is the first of two.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const err = (message: string): ActionState => ({ status: "error", message });

async function guard() {
  await requireCapability("school.manage", "/finance/providers");
  return createClient();
}

export async function createProviderAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await guard();
  const provider = str(formData, "provider");
  const environment = str(formData, "environment") || "sandbox";
  const label = str(formData, "label");
  if (!isProviderCode(provider)) return err("Choose a provider.");
  if (environment !== "sandbox" && environment !== "live") return err("Choose sandbox or live.");
  if (label.length < 1 || label.length > 80) return err("Give the account a name (up to 80 characters).");

  const { data, error } = await supabase.rpc("provider_account_create", { p_provider: provider, p_environment: environment, p_label: label });
  if (error || !data?.[0]) return err(friendlyDbError(error, "The account couldn’t be created."));
  revalidatePath("/finance/providers");
  return {
    status: "success",
    message: `Account created. Copy this signing secret now — it will not be shown again: ${data[0].webhook_secret}`,
  };
}

export async function setProviderStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await guard();
  const id = str(formData, "account_id");
  const status = str(formData, "status");
  if (!UUID.test(id) || (status !== "active" && status !== "disabled")) return err("Choose an account.");
  const { error } = await supabase.rpc("provider_account_set_status", { p_account: id, p_status: status });
  if (error) return err(friendlyDbError(error, "The account couldn’t be updated."));
  revalidatePath("/finance/providers");
  return { status: "success", message: status === "active" ? "Switched on." : "Switched off. Messages from it are now refused." };
}

export async function rotateProviderSecretAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await guard();
  const id = str(formData, "account_id");
  if (!UUID.test(id)) return err("Choose an account.");
  const { data, error } = await supabase.rpc("provider_account_rotate_secret", { p_account: id });
  if (error || !data) return err(friendlyDbError(error, "The secret couldn’t be changed."));
  revalidatePath("/finance/providers");
  return { status: "success", message: `New signing secret — copy it now, it will not be shown again. The old one has stopped working: ${data}` };
}
