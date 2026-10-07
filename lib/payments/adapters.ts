import { SIGNATURE_HEADER, verifySignature } from "./sign";
import type { NormalizedPayment, ParseResult, ProviderAdapter, ProviderCode } from "./types";

const MAX_TEXT = 120;

function text(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v.slice(0, max) : null;
}

/** "25.50" or 25.5 → 25.5 (null for anything else; the database re-validates). */
function money(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && /^\d{1,9}(\.\d{1,6})?$/.test(value.trim())) return Number(value.trim());
  return null;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : `${m[1]}-${m[2]}-${m[3]}`;
}

function parseJsonObject(rawBody: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(rawBody);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Sandbox provider. Lets a school (and our tests) exercise the whole path —
 * signed message in, unmatched transaction out — with no real credentials.
 *
 * Message:
 *   { "transaction_id": "T123", "status": "successful", "amount": "25.50",
 *     "currency": "USD", "paid_at": "2026-10-09T10:00:00Z",
 *     "payer_name": "Jane Doe", "payer_phone": "+231770000000" }
 */
export const mockAdapter: ProviderAdapter = {
  code: "mock",
  label: "Sandbox (test provider)",
  supportsLive: false,
  verify({ rawBody, header, secret, now }) {
    return verifySignature(secret, rawBody, header(SIGNATURE_HEADER), now);
  },
  parse(rawBody): ParseResult {
    const o = parseJsonObject(rawBody);
    if (!o) return { ok: false, reason: "not_a_json_object" };
    const externalId = text(o.transaction_id, 100);
    if (!externalId) return { ok: false, reason: "missing_transaction_id" };
    const payment: NormalizedPayment = {
      externalId,
      status: (text(o.status, 40) ?? "").toLowerCase(),
      amount: money(o.amount),
      currency: text(o.currency, 3)?.toUpperCase() ?? null,
      date: isoDate(o.paid_at),
      payerName: text(o.payer_name),
      payerPhone: text(o.payer_phone, 30),
    };
    return { ok: true, payment, raw: o };
  },
};

/**
 * Orange Money and MTN MoMo: DELIBERATELY NOT IMPLEMENTED YET.
 *
 * Their callback formats, signature/authentication schemes and status values
 * must come from each provider's official documentation, issued with a
 * merchant account. Guessing them would mean accepting unauthenticated
 * "payment" messages, so until then these adapters refuse everything and the
 * callback route answers 501. When credentials exist, implement verify() and
 * parse() here (and certify in the provider's sandbox) — nothing else changes.
 */
function notImplemented(code: ProviderCode, label: string): ProviderAdapter {
  return {
    code,
    label,
    supportsLive: false,
    verify: () => ({ ok: false, reason: "not_implemented" }),
    parse: () => ({ ok: false, reason: "not_implemented" }),
  };
}

export const orangeMoneyAdapter = notImplemented("orange_money", "Orange Money");
export const mtnMomoAdapter = notImplemented("mtn_momo", "MTN MoMo");

const ADAPTERS: Record<ProviderCode, ProviderAdapter> = {
  mock: mockAdapter,
  orange_money: orangeMoneyAdapter,
  mtn_momo: mtnMomoAdapter,
};

export function getAdapter(code: ProviderCode): ProviderAdapter {
  return ADAPTERS[code];
}

/** True when the adapter can actually authenticate messages today. */
export function isImplemented(code: ProviderCode): boolean {
  return code === "mock";
}
