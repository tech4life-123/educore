/**
 * POST /api/payments/webhook/[provider]/[account] — request handling, kept free
 * of Next.js and Supabase so every branch is testable with fakes.
 *
 * Order of checks (a message reaches the database only if ALL pass):
 *   1. Known provider, well-formed account id           (404 otherwise)
 *   2. Body no larger than MAX_BODY_BYTES               (413)
 *   3. The account exists, belongs to that provider     (404 — never says which)
 *   4. The account is active                            (403)
 *   5. The adapter is implemented, and live is allowed  (501)
 *   6. Signature + freshness verified with the account's secret   (401)
 *   7. The message parses                               (422)
 * Then provider_ingest() records it exactly once (idempotent) as an UNMATCHED
 * transaction. Responses never echo secrets or internal error text.
 */

import { getAdapter, isImplemented } from "./adapters";
import { isProviderCode, type NormalizedPayment, type ProviderCode } from "./types";

export const MAX_BODY_BYTES = 16 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AccountRecord {
  id: string;
  provider: string;
  environment: "sandbox" | "live";
  status: "active" | "disabled";
}

export interface IngestResult {
  outcome: "ingested" | "ignored" | "conflict";
  duplicate: boolean;
}

export interface WebhookDeps {
  /** Account + signing secret, or null when the account does not exist. */
  loadAccount(id: string): Promise<{ account: AccountRecord; secret: string } | null>;
  /** Records the verified message. Throws IngestRefused for a definite "no". */
  ingest(accountId: string, payment: NormalizedPayment, raw: Record<string, unknown>): Promise<IngestResult>;
  now(): number;
}

/** provider_ingest said no for a reason that retrying will not fix. */
export class IngestRefused extends Error {}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function readLimitedBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function handleProviderWebhook(
  request: Request,
  params: { provider: string; account: string },
  deps: WebhookDeps,
): Promise<Response> {
  if (!isProviderCode(params.provider) || !UUID.test(params.account)) return json(404, { ok: false, error: "not_found" });
  const providerCode: ProviderCode = params.provider;

  const rawBody = await readLimitedBody(request);
  if (rawBody === null) return json(413, { ok: false, error: "payload_too_large" });

  const found = await deps.loadAccount(params.account);
  if (!found || found.account.provider !== providerCode) return json(404, { ok: false, error: "not_found" });
  const { account, secret } = found;
  if (account.status !== "active") return json(403, { ok: false, error: "account_disabled" });

  const adapter = getAdapter(providerCode);
  if (!isImplemented(providerCode) || (account.environment === "live" && !adapter.supportsLive)) {
    return json(501, { ok: false, error: "not_implemented" });
  }

  const verified = adapter.verify({ rawBody, header: (n) => request.headers.get(n), secret, now: deps.now() });
  if (!verified.ok) return json(401, { ok: false, error: "invalid_signature" });

  const parsed = adapter.parse(rawBody);
  if (!parsed.ok) return json(422, { ok: false, error: "invalid_message" });

  try {
    const result = await deps.ingest(account.id, parsed.payment, parsed.raw);
    return json(200, { ok: true, outcome: result.outcome, duplicate: result.duplicate });
  } catch (e) {
    if (e instanceof IngestRefused) return json(422, { ok: false, error: "rejected" });
    // Anything else is ours to fix; a 5xx makes the provider retry later.
    return json(500, { ok: false, error: "server_error" });
  }
}
