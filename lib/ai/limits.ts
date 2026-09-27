/**
 * Input validation and usage limits for EduCore AI (pure — no I/O).
 *
 * The browser keeps the conversation and sends it with each question, so the
 * server stores no conversation text. Every request is re-validated here; a
 * hand-crafted history can't widen access because data only ever reaches the
 * model through authorised server-side tools (AI-4), never from the client.
 */

import type { AiMessage } from "./types";

export const INPUT_LIMITS = {
  /** Largest request body accepted, in bytes. */
  maxBodyBytes: 64 * 1024,
  /** Messages kept from the conversation (older ones are dropped by the client). */
  maxMessages: 20,
  /** One message. */
  maxMessageChars: 2000,
  /** The whole conversation. */
  maxTotalChars: 16000,
} as const;

export interface UsageLimits {
  userPerMinute: number;
  userPerDay: number;
  schoolPerDay: number;
}

export type ValidationResult =
  | { ok: true; messages: AiMessage[] }
  | { ok: false; status: 400 | 413; code: "invalid_request" | "too_long"; message: string };

const bad = (message: string): ValidationResult => ({ ok: false, status: 400, code: "invalid_request", message });
const tooLong = (message: string): ValidationResult => ({ ok: false, status: 413, code: "too_long", message });

/** Validate `{ messages: [{ role, content }] }` from the browser. */
export function validateChatInput(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") return bad("The request must be a JSON object.");
  const raw = (body as { messages?: unknown }).messages;
  if (!Array.isArray(raw) || raw.length === 0) return bad("Send at least one message.");
  if (raw.length > INPUT_LIMITS.maxMessages) return tooLong(`Send at most ${INPUT_LIMITS.maxMessages} messages; start a new conversation.`);

  const messages: AiMessage[] = [];
  let total = 0;
  for (const [i, m] of raw.entries()) {
    if (!m || typeof m !== "object") return bad("Each message must be an object.");
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") return bad("A message role must be user or assistant.");
    if (typeof content !== "string") return bad("A message must be text.");
    // Strip control characters except newlines and tabs.
    const text = content.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
    if (!text) return bad("Messages can't be empty.");
    if (text.length > INPUT_LIMITS.maxMessageChars) return tooLong(`A message can be at most ${INPUT_LIMITS.maxMessageChars} characters.`);
    total += text.length;
    const expected = i % 2 === 0 ? "user" : "assistant";
    if (role !== expected) return bad("Messages must alternate, starting with the user.");
    messages.push({ role, content: text });
  }
  if (total > INPUT_LIMITS.maxTotalChars) return tooLong("This conversation is too long; start a new one.");
  if (messages[messages.length - 1].role !== "user") return bad("The last message must be from the user.");
  return { ok: true, messages };
}

export interface UsageCounts {
  userLastMinute: number;
  userLastDay: number;
  /** Null for platform users (no school). */
  schoolLastDay: number | null;
}

export type LimitDecision = { ok: true } | { ok: false; scope: "user_minute" | "user_day" | "school_day"; retryAfterSeconds: number };

export function checkUsage(counts: UsageCounts, limits: UsageLimits): LimitDecision {
  if (counts.userLastMinute >= limits.userPerMinute) return { ok: false, scope: "user_minute", retryAfterSeconds: 60 };
  if (counts.userLastDay >= limits.userPerDay) return { ok: false, scope: "user_day", retryAfterSeconds: 3600 };
  if (counts.schoolLastDay !== null && counts.schoolLastDay >= limits.schoolPerDay) {
    return { ok: false, scope: "school_day", retryAfterSeconds: 3600 };
  }
  return { ok: true };
}

/** Parse a positive whole number from the environment, with bounds. */
export function envInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
