/**
 * Payment-provider feeds (Finance Phase 4).
 *
 * A provider tells EduCore "this money arrived". EduCore turns that into an
 * UNMATCHED incoming transaction for the school's finance officer to reconcile;
 * a provider message never settles an invoice by itself.
 */

export const PROVIDER_CODES = ["mock", "orange_money", "mtn_momo"] as const;
export type ProviderCode = (typeof PROVIDER_CODES)[number];

export function isProviderCode(value: string): value is ProviderCode {
  return (PROVIDER_CODES as readonly string[]).includes(value);
}

/** What every provider's message is reduced to before it reaches the database. */
export interface NormalizedPayment {
  /** The provider's own transaction id — the idempotency key. */
  externalId: string;
  /** Lower-case provider status; only "successful" becomes a transaction. */
  status: string;
  amount: number | null;
  currency: string | null;
  /** YYYY-MM-DD, or null when the provider gave none. */
  date: string | null;
  payerName: string | null;
  payerPhone: string | null;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };
export type ParseResult = { ok: true; payment: NormalizedPayment; raw: Record<string, unknown> } | { ok: false; reason: string };

export interface VerifyInput {
  rawBody: string;
  /** Case-insensitive header lookup. */
  header(name: string): string | null;
  secret: string;
  /** Current time in ms (injected so tests are deterministic). */
  now: number;
}

export interface ProviderAdapter {
  code: ProviderCode;
  label: string;
  /**
   * True only once the real integration exists and has been certified with the
   * provider. Until then a "live" account for this provider is refused.
   */
  supportsLive: boolean;
  /** Checks the message really came from the provider (signature + freshness). */
  verify(input: VerifyInput): VerifyResult;
  /** Reads the provider's message into the common shape. Assumes verify passed. */
  parse(rawBody: string): ParseResult;
}
