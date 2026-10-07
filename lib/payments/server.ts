import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import { IngestRefused, type AccountRecord, type WebhookDeps } from "./handler";

/**
 * Production dependencies for the callback route. Uses the service-role client
 * (callbacks come from a provider, not a signed-in person) — which is safe here
 * only because the handler authenticates every message with the account's
 * signing secret BEFORE anything is written, and provider_ingest() is the only
 * thing it can reach.
 */
export function webhookDeps(): WebhookDeps | null {
  const admin = createAdminClient();
  if (!admin) return null;

  return {
    now: () => Date.now(),

    async loadAccount(id) {
      const { data: account } = await admin
        .from("payment_provider_accounts")
        .select("id, provider, environment, status")
        .eq("id", id)
        .maybeSingle();
      if (!account) return null;
      const { data: secret } = await admin
        .from("payment_provider_secrets")
        .select("webhook_secret")
        .eq("account_id", id)
        .maybeSingle();
      if (!secret) return null;
      return { account: account as AccountRecord, secret: secret.webhook_secret };
    },

    async ingest(accountId, payment, raw) {
      const { data, error } = await admin.rpc("provider_ingest", {
        p_account: accountId,
        p_external_id: payment.externalId,
        p_status: payment.status,
        p_amount: payment.amount,
        p_currency: payment.currency,
        p_date: payment.date,
        p_payer_name: payment.payerName,
        p_payer_phone: payment.payerPhone,
        p_payload: raw as Json,
      });
      if (error) {
        // 22023 = the database refused on purpose (unknown/disabled account, bad id).
        if (error.code === "22023") throw new IngestRefused(error.message);
        throw new Error(error.message);
      }
      const result = data as { outcome?: string; duplicate?: boolean } | null;
      return {
        outcome: (result?.outcome ?? "ignored") as "ingested" | "ignored" | "conflict",
        duplicate: result?.duplicate === true,
      };
    },
  };
}
