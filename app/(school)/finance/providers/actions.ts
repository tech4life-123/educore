"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { friendlyDbError } from "@/lib/action-state";
import { parseAmount } from "@/lib/finance";
import { handleProviderWebhook } from "@/lib/payments/handler";
import { webhookDeps } from "@/lib/payments/server";
import { SIGNATURE_HEADER, signBody } from "@/lib/payments/sign";
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

/**
 * Sandbox only: sends a correctly signed test message through the SAME handler
 * a real provider would reach (signature check, parsing, idempotent ingest),
 * so a school can see the whole flow without any real money or credentials.
 * The signing secret is read and used on the server and is never returned.
 */
export async function sendTestPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await guard();
  const id = str(formData, "account_id");
  if (!UUID.test(id)) return err("Choose an account.");
  const amount = parseAmount(str(formData, "amount") || "25.50");
  if (amount === null || amount <= 0) return err("Enter an amount above zero with at most 2 decimals.");
  const currency = str(formData, "currency") === "LRD" ? "LRD" : "USD";

  // RLS: only returns an account of the caller's own school.
  const { data: mine } = await supabase.from("payment_provider_accounts").select("id, provider, environment, status").eq("id", id).maybeSingle();
  if (!mine || mine.provider !== "mock" || mine.environment !== "sandbox") return err("Test payments can only be sent to a Sandbox account.");
  if (mine.status !== "active") return err("Switch the account on first.");

  const deps = webhookDeps();
  if (!deps) return err("The server isn’t configured to receive provider messages (missing service key).");
  const found = await deps.loadAccount(id);
  if (!found) return err("The account’s signing secret couldn’t be found.");

  const body = JSON.stringify({
    transaction_id: `SANDBOX-${Date.now().toString(36).toUpperCase()}`,
    status: "successful",
    amount: amount.toFixed(2),
    currency,
    paid_at: new Date().toISOString(),
    payer_name: "Test Payer",
    payer_phone: "+231770000000",
  });
  const send = async () => {
    const t = Math.floor(Date.now() / 1000);
    const request = new Request("https://internal.invalid/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", [SIGNATURE_HEADER]: signBody(found.secret, body, t) },
      body,
    });
    const res = await handleProviderWebhook(request, { provider: "mock", account: id }, deps);
    return { status: res.status, json: (await res.json()) as { outcome?: string; duplicate?: boolean; error?: string } };
  };

  const first = await send();
  if (first.status !== 200) return err(`The test message was refused (${first.status}: ${first.json.error ?? "error"}).`);
  let message = `Test payment received: ${amount.toFixed(2)} ${currency}. Open Reconciliation → To match to see it.`;
  if (formData.get("twice") === "on") {
    const again = await send();
    message += again.json.duplicate ? " Sent a second time: recognised as a duplicate, so no second line was created." : " Sent a second time, but it was NOT recognised as a duplicate — please report this.";
  }
  revalidatePath("/finance/providers");
  revalidatePath("/finance/reconciliation");
  return { status: "success", message };
}
