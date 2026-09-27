/**
 * Anthropic (Claude) provider — Messages API over fetch, no SDK dependency.
 * https://docs.claude.com/en/api/messages
 *
 * Server-only by construction: it needs the API key, which only the server
 * configuration (lib/ai/config.ts) can read.
 */

import { SseParser } from "../sse";
import {
  AiError,
  type AiContentBlock,
  type AiMessage,
  type AiProvider,
  type AiRequest,
  type AiResponse,
  type AiStopReason,
  type AiStreamEvent,
  type AiUsage,
} from "../types";

const API_VERSION = "2023-06-01";

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  baseUrl?: string;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
}

type WireBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

function toWireContent(content: AiMessage["content"]): string | WireBlock[] {
  if (typeof content === "string") return content;
  return content.map((b): WireBlock => {
    switch (b.type) {
      case "text":
        return { type: "text", text: b.text };
      case "tool_use":
        return { type: "tool_use", id: b.id, name: b.name, input: b.input };
      case "tool_result":
        return { type: "tool_result", tool_use_id: b.toolUseId, content: b.content, ...(b.isError ? { is_error: true } : {}) };
    }
  });
}

export function buildAnthropicBody(model: string, request: AiRequest, stream: boolean) {
  return {
    model,
    max_tokens: request.maxOutputTokens,
    system: request.system,
    messages: request.messages.map((m) => ({ role: m.role, content: toWireContent(m.content) })),
    ...(request.tools?.length
      ? {
          tools: request.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })),
          ...(request.toolChoice === "none" ? { tool_choice: { type: "none" } } : {}),
        }
      : {}),
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    ...(stream ? { stream: true } : {}),
  };
}

function stopReason(value: unknown): AiStopReason {
  return value === "end_turn" || value === "max_tokens" || value === "tool_use" || value === "stop_sequence" || value === "refusal"
    ? value
    : "other";
}

/** Map an HTTP status from the provider to an AiError code. */
export function errorForStatus(status: number): AiError {
  if (status === 401 || status === 403) return new AiError("auth", "The AI provider rejected the API key", status);
  if (status === 429) return new AiError("rate_limited", "The AI provider is rate limiting requests", status);
  if (status === 529) return new AiError("overloaded", "The AI provider is overloaded", status);
  if (status === 400 || status === 404 || status === 413 || status === 422) {
    return new AiError("bad_request", "The AI provider rejected the request", status);
  }
  return new AiError("unavailable", "The AI provider is unavailable", status);
}

function errorForStreamEvent(type: unknown): AiError {
  if (type === "overloaded_error") return new AiError("overloaded", "The AI provider is overloaded");
  if (type === "rate_limit_error") return new AiError("rate_limited", "The AI provider is rate limiting requests");
  if (type === "authentication_error" || type === "permission_error") return new AiError("auth", "The AI provider rejected the API key");
  if (type === "invalid_request_error") return new AiError("bad_request", "The AI provider rejected the request");
  return new AiError("unavailable", "The AI provider reported an error");
}

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  readonly model: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AnthropicOptions) {
    if (!options.apiKey) throw new AiError("not_configured", "No Anthropic API key");
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs;
    this.baseUrl = (options.baseUrl ?? "https://api.anthropic.com").replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** POST with an overall deadline; aborting the caller's signal also aborts us. */
  private async post(body: unknown, signal: AbortSignal | undefined): Promise<{ res: Response; done: () => void; timedOut: () => boolean }> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": API_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch {
      done();
      if (timedOut) throw new AiError("timeout", "The AI provider did not answer in time");
      throw new AiError("unavailable", "Could not reach the AI provider");
    }
    if (!res.ok) {
      done();
      // Drain without reading the text into logs or messages.
      await res.body?.cancel().catch(() => undefined);
      throw errorForStatus(res.status);
    }
    return { res, done, timedOut: () => timedOut };
  }

  async complete(request: AiRequest): Promise<AiResponse> {
    const { res, done, timedOut } = await this.post(buildAnthropicBody(this.model, request, false), request.signal);
    let json: {
      content?: { type: string; text?: string; id?: string; name?: string; input?: unknown }[];
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
      model?: string;
    };
    try {
      json = await res.json();
    } catch {
      throw timedOut() ? new AiError("timeout", "The AI provider did not answer in time") : new AiError("invalid_response", "Unreadable reply");
    } finally {
      done();
    }
    if (!Array.isArray(json.content)) throw new AiError("invalid_response", "Reply had no content");
    const content: AiContentBlock[] = [];
    for (const b of json.content) {
      if (b.type === "text" && typeof b.text === "string") content.push({ type: "text", text: b.text });
      else if (b.type === "tool_use" && b.id && b.name) content.push({ type: "tool_use", id: b.id, name: b.name, input: b.input ?? {} });
    }
    return {
      content,
      stopReason: stopReason(json.stop_reason),
      usage: { inputTokens: json.usage?.input_tokens ?? 0, outputTokens: json.usage?.output_tokens ?? 0 },
      model: json.model ?? this.model,
    };
  }

  async *stream(request: AiRequest): AsyncIterable<AiStreamEvent> {
    const { res, done, timedOut } = await this.post(buildAnthropicBody(this.model, request, true), request.signal);
    if (!res.body) {
      done();
      throw new AiError("invalid_response", "Reply had no body");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();
    const usage: AiUsage = { inputTokens: 0, outputTokens: 0 };
    let model = this.model;
    let reason: AiStopReason = "other";
    let finished = false;
    const tools = new Map<number, { id: string; name: string; json: string }>();

    try {
      while (!finished) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch {
          throw timedOut() ? new AiError("timeout", "The AI provider did not answer in time") : new AiError("unavailable", "The connection to the AI provider was lost");
        }
        const events = chunk.done ? parser.end() : parser.push(decoder.decode(chunk.value, { stream: true }));
        for (const e of events) {
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(e.data);
          } catch {
            throw new AiError("invalid_response", "Unreadable stream event");
          }
          switch (data.type) {
            case "message_start": {
              const m = data.message as { model?: string; usage?: { input_tokens?: number; output_tokens?: number } } | undefined;
              if (m?.model) model = m.model;
              usage.inputTokens = m?.usage?.input_tokens ?? 0;
              usage.outputTokens = m?.usage?.output_tokens ?? 0;
              break;
            }
            case "content_block_start": {
              const block = data.content_block as { type?: string; id?: string; name?: string } | undefined;
              if (block?.type === "tool_use" && block.id && block.name) {
                tools.set(Number(data.index), { id: block.id, name: block.name, json: "" });
              }
              break;
            }
            case "content_block_delta": {
              const delta = data.delta as { type?: string; text?: string; partial_json?: string } | undefined;
              if (delta?.type === "text_delta" && delta.text) yield { type: "text", text: delta.text };
              else if (delta?.type === "input_json_delta") {
                const t = tools.get(Number(data.index));
                if (t) t.json += delta.partial_json ?? "";
              }
              break;
            }
            case "content_block_stop": {
              const t = tools.get(Number(data.index));
              if (t) {
                let input: unknown = {};
                try {
                  input = t.json ? JSON.parse(t.json) : {};
                } catch {
                  throw new AiError("invalid_response", "Unreadable tool input");
                }
                tools.delete(Number(data.index));
                yield { type: "tool_use", id: t.id, name: t.name, input };
              }
              break;
            }
            case "message_delta": {
              const d = data.delta as { stop_reason?: string } | undefined;
              const u = data.usage as { input_tokens?: number; output_tokens?: number } | undefined;
              if (d?.stop_reason) reason = stopReason(d.stop_reason);
              if (typeof u?.output_tokens === "number") usage.outputTokens = u.output_tokens;
              if (typeof u?.input_tokens === "number") usage.inputTokens = u.input_tokens;
              break;
            }
            case "message_stop":
              finished = true;
              break;
            case "error":
              throw errorForStreamEvent((data.error as { type?: string } | undefined)?.type);
            default:
              break; // ping and future event types
          }
        }
        if (chunk.done) break;
      }
      if (!finished) throw new AiError("invalid_response", "The reply ended unexpectedly");
      yield { type: "done", stopReason: reason, usage, model };
    } finally {
      done();
      await reader.cancel().catch(() => undefined);
    }
  }
}
