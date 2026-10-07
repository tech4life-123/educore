import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

/**
 * Payment-provider reads. Run as the signed-in finance person; row-level
 * security limits them to their own school. The signing secret is in a table
 * no browser role can read, so it can never appear here.
 */

export type ProviderAccountRow = Tables<"payment_provider_accounts">;

export interface ProviderEventRow {
  id: string;
  accountLabel: string;
  provider: string;
  externalId: string;
  outcome: string;
  detail: string | null;
  transactionId: string | null;
  deliveryCount: number;
  receivedAt: string;
}

export async function listProviderAccounts(): Promise<ProviderAccountRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("payment_provider_accounts").select("*").order("created_at", { ascending: true });
  return data ?? [];
}

export async function listProviderEvents(limit = 30): Promise<ProviderEventRow[]> {
  const supabase = await createClient();
  const [{ data: events }, accounts] = await Promise.all([
    supabase
      .from("provider_events")
      .select("id, account_id, provider, external_id, outcome, detail, transaction_id, delivery_count, received_at")
      .order("received_at", { ascending: false })
      .limit(limit),
    listProviderAccounts(),
  ]);
  const labels = new Map(accounts.map((a) => [a.id, a.label]));
  return (events ?? []).map((e) => ({
    id: e.id,
    accountLabel: labels.get(e.account_id) ?? "—",
    provider: e.provider,
    externalId: e.external_id,
    outcome: e.outcome,
    detail: e.detail,
    transactionId: e.transaction_id,
    deliveryCount: e.delivery_count,
    receivedAt: e.received_at,
  }));
}
