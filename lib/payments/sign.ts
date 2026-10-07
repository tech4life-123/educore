import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * EduCore's own callback signature, used by the sandbox ("mock") provider and
 * a sensible template for real adapters:
 *
 *   X-EduCore-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>
 *
 * Signing the timestamp together with the body means a captured message cannot
 * be replayed later (the receiver rejects anything outside the tolerance).
 */
export const SIGNATURE_HEADER = "x-educore-signature";
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function signBody(secret: string, rawBody: string, timestampSeconds: number): string {
  const v1 = createHmac("sha256", secret).update(`${timestampSeconds}.${rawBody}`).digest("hex");
  return `t=${timestampSeconds},v1=${v1}`;
}

export function verifySignature(
  secret: string,
  rawBody: string,
  header: string | null,
  nowMs: number,
  toleranceSeconds = SIGNATURE_TOLERANCE_SECONDS,
): { ok: true } | { ok: false; reason: string } {
  if (!header) return { ok: false, reason: "missing_signature" };
  const parts = new Map<string, string>();
  for (const piece of header.split(",")) {
    const i = piece.indexOf("=");
    if (i > 0) parts.set(piece.slice(0, i).trim(), piece.slice(i + 1).trim());
  }
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (!t || !v1 || !/^\d{1,12}$/.test(t) || !/^[0-9a-f]{64}$/i.test(v1)) return { ok: false, reason: "malformed_signature" };

  const ageSeconds = Math.abs(nowMs / 1000 - Number(t));
  if (ageSeconds > toleranceSeconds) return { ok: false, reason: "stale_signature" };

  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  const given = Buffer.from(v1, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "bad_signature" };
  return { ok: true };
}
