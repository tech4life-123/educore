/**
 * EduCore AI — provider-neutral types.
 *
 *   AI provider (Anthropic today; replaceable)
 *        ↓   AiProvider interface (this file)
 *   AI service (lib/ai/service.ts: prompts, limits, tool loop later)
 *        ↓
 *   EduCore AI tools (AI-4: authorised, RLS-bound data access)
 *        ↓
 *   Supabase
 *
 * Nothing in the app outside lib/ai talks to a provider directly, so the
 * provider can be swapped by adding one file under lib/ai/providers.
 */

export type AiRole = "user" | "assistant";

export interface AiTextBlock {
  type: "text";
  text: string;
}

/** A tool call requested by the model (used from AI-4 on). */
export interface AiToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

/** The result of a tool call, sent back to the model (used from AI-4 on). */
export interface AiToolResultBlock {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export type AiContentBlock = AiTextBlock | AiToolUseBlock | AiToolResultBlock;

export interface AiMessage {
  role: AiRole;
  content: string | AiContentBlock[];
}

/** A tool the model may call. The schema is JSON Schema for the input object. */
export interface AiToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AiRequest {
  system: string;
  messages: AiMessage[];
  tools?: AiToolDefinition[];
  /** "none": the tools are defined (history may contain tool calls) but may not be used this turn. */
  toolChoice?: "auto" | "none";
  maxOutputTokens: number;
  /** 0–1. Low values keep answers factual. */
  temperature?: number;
  signal?: AbortSignal;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export type AiStopReason = "end_turn" | "max_tokens" | "tool_use" | "stop_sequence" | "refusal" | "other";

export interface AiResponse {
  content: AiContentBlock[];
  stopReason: AiStopReason;
  usage: AiUsage;
  model: string;
}

/** Events yielded while streaming a reply. */
export type AiStreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "done"; stopReason: AiStopReason; usage: AiUsage; model: string };

export interface AiProvider {
  /** Short provider id, e.g. "anthropic". */
  readonly name: string;
  readonly model: string;
  complete(request: AiRequest): Promise<AiResponse>;
  stream(request: AiRequest): AsyncIterable<AiStreamEvent>;
}

/**
 * Every provider failure is normalised to one of these codes. User-facing
 * messages are chosen from the code (lib/ai/errors.ts) — provider error text
 * is never shown to users because it can contain internal details.
 */
export type AiErrorCode =
  | "not_configured"
  | "auth" // our API key was rejected
  | "rate_limited" // the provider throttled us
  | "overloaded"
  | "timeout"
  | "bad_request"
  | "invalid_response"
  | "unavailable";

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly status?: number;
  constructor(code: AiErrorCode, message: string, status?: number) {
    super(message);
    this.name = "AiError";
    this.code = code;
    this.status = status;
  }
}
