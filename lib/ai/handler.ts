/**
 * POST /api/ai/chat — request handling, independent of Next.js and Supabase
 * so every branch can be tested with fakes (see lib/ai/__tests__).
 *
 * Order of checks (nothing reaches the AI provider unless all pass):
 *   1. Same-origin request with a JSON body (blocks cross-site use of a
 *      signed-in person's session to spend the school's AI budget)
 *   2. Signed in, active profile, password already changed, school active
 *   3. Assistant switched on and configured
 *   4. Body size, message count/length, conversation shape
 *   5. Per-user and per-school usage limits
 * Then the reply is streamed as NDJSON lines:
 *   {"type":"text","text":"…"} … {"type":"done"}   or   {"type":"error","code":"…","message":"…"}
 *   plus {"type":"status","text":"Checking attendance…"} while a data tool runs (AI-4).
 */

import { userMessage, type ChatErrorCode } from "./errors";
import { checkUsage, INPUT_LIMITS, validateChatInput, type UsageCounts, type UsageLimits } from "./limits";
import { buildSystemPrompt, type ViewerRole } from "./prompt";
import { AiError, type AiContentBlock, type AiMessage, type AiProvider, type AiToolDefinition, type AiUsage } from "./types";

export interface Viewer {
  profileId: string;
  role: ViewerRole;
  /** Null for platform (super admin) users. */
  schoolId: string | null;
  schoolName: string | null;
  firstName: string;
}

/** Data tools for one viewer (AI-4). Every run re-checks authorisation. */
export interface ToolBox {
  definitions: AiToolDefinition[];
  run(name: string, input: unknown): Promise<{ ok: boolean; content: string }>;
  /** Short progress text shown while a tool runs, e.g. "Checking attendance…". */
  label(name: string): string;
  /** Today's date and the current academic year/semester, for the prompt (AI-3). */
  context: { today: string | null; yearName: string | null; termName: string | null };
}

/** Per request: at most this many model calls and tool calls. */
export const TOOL_LIMITS = { maxRounds: 5, maxToolCalls: 8 } as const;

export type ViewerLookup =
  | { status: "ok"; viewer: Viewer }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "error" };

export interface UsageEvent {
  viewer: Viewer;
  kind: "chat" | "check";
  provider: string;
  model: string;
  status: "ok" | "error" | "rate_limited";
  errorCode?: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  toolNames?: string[];
  durationMs: number;
}

export interface UsageStore {
  counts(viewer: Viewer, now: number): Promise<UsageCounts>;
  record(event: UsageEvent): Promise<void>;
}

export interface ChatDeps {
  getViewer(): Promise<ViewerLookup>;
  /** Null when the assistant is off or not configured. */
  getProvider(): AiProvider | null;
  /** Null when usage limits can't be enforced (the assistant then stays off). */
  usage: UsageStore | null;
  limits: UsageLimits;
  maxOutputTokens: number;
  /** Data tools for this viewer; omitted = no tools (AI-1/AI-2 behaviour). */
  getTools?: (viewer: Viewer) => Promise<ToolBox | null>;
  now?: () => number;
  log?: (message: string, meta?: Record<string, unknown>) => void;
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };

function fail(status: number, code: ChatErrorCode, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: { code, message: userMessage(code) } }), {
    status,
    headers: { ...JSON_HEADERS, ...extra },
  });
}

/** Same-origin check: the Origin header must name this host. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  if (!origin) return request.headers.get("sec-fetch-site") === "same-origin";
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function readBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; status: 400 | 413 }> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > INPUT_LIMITS.maxBodyBytes) return { ok: false, status: 413 };
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, status: 400 };
  }
  if (new TextEncoder().encode(text).length > INPUT_LIMITS.maxBodyBytes) return { ok: false, status: 413 };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400 };
  }
}

export async function handleChat(request: Request, deps: ChatDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((message, meta) => console.error(message, meta ?? ""));

  // 1. Transport
  if (!isSameOrigin(request)) return fail(403, "forbidden_origin");
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return fail(415, "unsupported_media_type");
  }

  // 2. Identity (established on the server from the session cookie)
  const who = await deps.getViewer();
  if (who.status === "unauthenticated") return fail(401, "unauthenticated");
  if (who.status === "forbidden") return fail(403, "forbidden");
  if (who.status === "error") return fail(500, "internal");
  const viewer = who.viewer;

  // 3. Configured
  const provider = deps.getProvider();
  if (!provider || !deps.usage) return fail(503, "not_configured");
  const usage = deps.usage;

  // 4. Input
  const read = await readBody(request);
  if (!read.ok) return fail(read.status, read.status === 413 ? "too_long" : "invalid_request");
  const input = validateChatInput(read.body);
  if (!input.ok) {
    return new Response(JSON.stringify({ error: { code: input.code, message: input.message } }), { status: input.status, headers: JSON_HEADERS });
  }

  // 5. Limits
  let counts: UsageCounts;
  try {
    counts = await usage.counts(viewer, now());
  } catch {
    log("[ai] usage lookup failed");
    return fail(503, "unavailable");
  }
  const decision = checkUsage(counts, deps.limits);
  if (!decision.ok) {
    await usage
      .record({ viewer, kind: "chat", provider: provider.name, model: provider.model, status: "rate_limited", errorCode: decision.scope, inputTokens: 0, outputTokens: 0, toolCalls: 0, durationMs: 0 })
      .catch(() => log("[ai] usage record failed"));
    return fail(429, "usage_limit", { "retry-after": String(decision.retryAfterSeconds) });
  }

  // Tools and context (AI-3/AI-4). If they can't be prepared the assistant still answers, without data.
  let toolbox: ToolBox | null = null;
  if (deps.getTools) {
    try {
      toolbox = await deps.getTools(viewer);
    } catch {
      log("[ai] tool setup failed");
    }
  }

  // Stream the reply. The provider call is cancelled if the browser disconnects.
  const abort = new AbortController();
  request.signal?.addEventListener("abort", () => abort.abort(), { once: true });
  const system = buildSystemPrompt({
    role: viewer.role,
    schoolName: viewer.schoolName,
    firstName: viewer.firstName,
    toolNames: toolbox?.definitions.map((t) => t.name) ?? [],
    today: toolbox?.context.today ?? null,
    yearName: toolbox?.context.yearName ?? null,
    termName: toolbox?.context.termName ?? null,
  });
  const started = now();
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
      const tokens: AiUsage = { inputTokens: 0, outputTokens: 0 };
      let model = provider.model;
      let errorCode: string | undefined;
      const toolNames: string[] = [];
      let toolCalls = 0;
      let conversation: AiMessage[] = input.messages;
      let wroteText = false;
      try {
        for (let round = 0; round < TOOL_LIMITS.maxRounds; round++) {
          // The last round (or once the tool budget is spent) must answer without tools.
          const hasTools = Boolean(toolbox?.definitions.length);
          const offerTools = hasTools && round < TOOL_LIMITS.maxRounds - 1 && toolCalls < TOOL_LIMITS.maxToolCalls;
          // After a tool round the history contains tool calls, so the definitions must still be
          // sent (the provider rejects them otherwise) — but with tool use switched off.
          let text = "";
          let separated = false;
          const calls: { id: string; name: string; input: unknown }[] = [];
          let stop: string = "end_turn";
          for await (const event of provider.stream({
            system,
            messages: conversation,
            tools: hasTools && (offerTools || round > 0) ? toolbox!.definitions : undefined,
            toolChoice: offerTools ? "auto" : "none",
            maxOutputTokens: deps.maxOutputTokens,
            temperature: 0.3,
            signal: abort.signal,
          })) {
            if (event.type === "text") {
              if (wroteText && !separated && round > 0) {
                send({ type: "text", text: "\n\n" });
                separated = true;
              }
              text += event.text;
              wroteText = true;
              send({ type: "text", text: event.text });
            } else if (event.type === "tool_use") {
              calls.push(event);
            } else if (event.type === "done") {
              tokens.inputTokens += event.usage.inputTokens;
              tokens.outputTokens += event.usage.outputTokens;
              model = event.model;
              stop = event.stopReason;
            }
          }

          if (stop !== "tool_use" || calls.length === 0 || !toolbox || !offerTools) {
            send({ type: "done", truncated: stop === "max_tokens" });
            break;
          }

          // Run the requested tools (each re-checks authorisation), within budget.
          const assistant: AiContentBlock[] = [
            ...(text ? [{ type: "text" as const, text }] : []),
            ...calls.map((c) => ({ type: "tool_use" as const, id: c.id, name: c.name, input: c.input })),
          ];
          const results: AiContentBlock[] = [];
          for (const call of calls) {
            if (toolCalls >= TOOL_LIMITS.maxToolCalls) {
              results.push({ type: "tool_result", toolUseId: call.id, content: JSON.stringify({ error: "Tool limit reached for this question. Answer with what you have." }), isError: true });
              continue;
            }
            toolCalls++;
            if (!toolNames.includes(call.name) && toolNames.length < 20) toolNames.push(call.name);
            send({ type: "status", text: toolbox.label(call.name) });
            const result = await toolbox.run(call.name, call.input);
            results.push({ type: "tool_result", toolUseId: call.id, content: result.content, isError: !result.ok });
          }
          conversation = [...conversation, { role: "assistant", content: assistant }, { role: "user", content: results }];
          if (round === TOOL_LIMITS.maxRounds - 1) send({ type: "done", truncated: true });
        }
      } catch (error) {
        errorCode = error instanceof AiError ? error.code : "internal";
        log("[ai] chat failed", { code: errorCode, status: error instanceof AiError ? error.status : undefined });
        send({ type: "error", code: errorCode, message: userMessage(errorCode as ChatErrorCode) });
      } finally {
        await usage
          .record({
            viewer,
            kind: "chat",
            provider: provider.name,
            model,
            status: errorCode ? "error" : "ok",
            errorCode,
            inputTokens: tokens.inputTokens,
            outputTokens: tokens.outputTokens,
            toolCalls,
            toolNames,
            durationMs: Math.max(0, now() - started),
          })
          .catch(() => log("[ai] usage record failed"));
        controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
