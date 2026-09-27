/**
 * What users see when EduCore AI can't answer. Provider error text, stack
 * traces and database errors are never shown — only these fixed messages.
 */

import type { AiErrorCode } from "./types";

export type ChatErrorCode =
  | AiErrorCode
  | "unauthenticated"
  | "forbidden"
  | "forbidden_origin"
  | "unsupported_media_type"
  | "invalid_request"
  | "too_long"
  | "usage_limit"
  | "internal";

const MESSAGES: Record<ChatErrorCode, string> = {
  not_configured: "EduCore AI isn't set up on this server yet.",
  auth: "EduCore AI is unavailable right now. Please try again later.",
  rate_limited: "EduCore AI is busy right now. Please try again in a minute.",
  overloaded: "EduCore AI is busy right now. Please try again in a minute.",
  timeout: "EduCore AI took too long to answer. Please try again.",
  bad_request: "EduCore AI couldn't process that request. Try rephrasing it.",
  invalid_response: "EduCore AI is unavailable right now. Please try again later.",
  unavailable: "EduCore AI is unavailable right now. Please try again later.",
  unauthenticated: "Please sign in to use EduCore AI.",
  forbidden: "Your account can't use EduCore AI right now.",
  forbidden_origin: "This request isn't allowed.",
  unsupported_media_type: "This request isn't allowed.",
  invalid_request: "That request wasn't valid.",
  too_long: "That message is too long.",
  usage_limit: "You've reached the EduCore AI limit for now. Please try again later.",
  internal: "Something went wrong. Please try again.",
};

export function userMessage(code: ChatErrorCode): string {
  return MESSAGES[code] ?? MESSAGES.internal;
}
