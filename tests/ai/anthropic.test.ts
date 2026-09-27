import assert from "node:assert/strict";
import { test } from "node:test";
import { AnthropicProvider, buildAnthropicBody } from "@/lib/ai/providers/anthropic";
import { AiError, type AiRequest, type AiStreamEvent } from "@/lib/ai/types";

const request: AiRequest = {
  system: "sys",
  messages: [
    { role: "user", content: "Hello" },
    { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "get_x", input: { a: 1 } }] },
    { role: "user", content: [{ type: "tool_result", toolUseId: "t1", content: "{}", isError: true }] },
  ],
  tools: [{ name: "get_x", description: "d", inputSchema: { type: "object" } }],
  maxOutputTokens: 100,
  temperature: 0.3,
};

function sse(events: Record<string, unknown>[]): string {
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
}

/** A fetch that streams `body` in small chunks and records the request. */
function streamingFetch(body: string, status = 200, calls: { url: string; init: RequestInit }[] = []) {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const bytes = new TextEncoder().encode(body);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7));
        c.close();
      },
    });
    return new Response(stream, { status });
  }) as unknown as typeof fetch;
}

async function collect(it: AsyncIterable<AiStreamEvent>) {
  const out: AiStreamEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

const HAPPY = sse([
  { type: "message_start", message: { model: "claude-test", usage: { input_tokens: 25, output_tokens: 1 } } },
  { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  { type: "ping" },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello " } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "there" } },
  { type: "content_block_stop", index: 0 },
  { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "tu_1", name: "get_x", input: {} } },
  { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"student' } },
  { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '":"me"}' } },
  { type: "content_block_stop", index: 1 },
  { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 15 } },
  { type: "message_stop" },
]);

test("request body: model, limits, system, mapped messages and tools", () => {
  const body = buildAnthropicBody("m1", request, true) as Record<string, unknown>;
  assert.equal(body.model, "m1");
  assert.equal(body.max_tokens, 100);
  assert.equal(body.system, "sys");
  assert.equal(body.stream, true);
  assert.equal(body.temperature, 0.3);
  assert.deepEqual(body.tools, [{ name: "get_x", description: "d", input_schema: { type: "object" } }]);
  const msgs = body.messages as { content: unknown }[];
  assert.deepEqual(msgs[1].content, [{ type: "tool_use", id: "t1", name: "get_x", input: { a: 1 } }]);
  assert.deepEqual(msgs[2].content, [{ type: "tool_result", tool_use_id: "t1", content: "{}", is_error: true }]);
});

test("stream: text deltas, tool call with split JSON, usage and stop reason", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const p = new AnthropicProvider({ apiKey: "sk-test", model: "m1", timeoutMs: 5000, fetchImpl: streamingFetch(HAPPY, 200, calls) });
  const events = await collect(p.stream(request));
  assert.deepEqual(events, [
    { type: "text", text: "Hello " },
    { type: "text", text: "there" },
    { type: "tool_use", id: "tu_1", name: "get_x", input: { student: "me" } },
    { type: "done", stopReason: "tool_use", usage: { inputTokens: 25, outputTokens: 15 }, model: "claude-test" },
  ]);
  assert.equal(calls[0].url, "https://api.anthropic.com/v1/messages");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers["x-api-key"], "sk-test");
  assert.equal(headers["anthropic-version"], "2023-06-01");
});

test("HTTP errors map to safe codes (and the provider's text is never read)", async () => {
  for (const [status, code] of [[401, "auth"], [403, "auth"], [429, "rate_limited"], [529, "overloaded"], [400, "bad_request"], [404, "bad_request"], [500, "unavailable"], [503, "unavailable"]] as const) {
    const p = new AnthropicProvider({ apiKey: "k", model: "m", timeoutMs: 5000, fetchImpl: streamingFetch('{"error":{"message":"secret internal detail"}}', status) });
    await assert.rejects(collect(p.stream(request)), (e: unknown) => e instanceof AiError && e.code === code && !e.message.includes("secret"));
  }
});

test("network failure → unavailable; missing key → not_configured", async () => {
  const p = new AnthropicProvider({ apiKey: "k", model: "m", timeoutMs: 5000, fetchImpl: (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch });
  await assert.rejects(p.complete(request), (e: unknown) => e instanceof AiError && e.code === "unavailable");
  assert.throws(() => new AnthropicProvider({ apiKey: "", model: "m", timeoutMs: 1 }), (e: unknown) => e instanceof AiError && e.code === "not_configured");
});

test("timeout aborts the request", async () => {
  const hanging = ((_: string, init: RequestInit) =>
    new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as unknown as typeof fetch;
  const p = new AnthropicProvider({ apiKey: "k", model: "m", timeoutMs: 50, fetchImpl: hanging });
  await assert.rejects(p.complete(request), (e: unknown) => e instanceof AiError && e.code === "timeout");
});

test("an error event mid-stream is raised; a stream that stops early is invalid", async () => {
  const withError = sse([
    { type: "message_start", message: { usage: { input_tokens: 1 } } },
    { type: "error", error: { type: "overloaded_error", message: "Overloaded" } },
  ]);
  const p1 = new AnthropicProvider({ apiKey: "k", model: "m", timeoutMs: 5000, fetchImpl: streamingFetch(withError) });
  await assert.rejects(collect(p1.stream(request)), (e: unknown) => e instanceof AiError && e.code === "overloaded");

  const cut = sse([{ type: "message_start", message: {} }, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi" } }]);
  const p2 = new AnthropicProvider({ apiKey: "k", model: "m", timeoutMs: 5000, fetchImpl: streamingFetch(cut) });
  await assert.rejects(collect(p2.stream(request)), (e: unknown) => e instanceof AiError && e.code === "invalid_response");
});

test("complete(): parses text and tool blocks and usage", async () => {
  const json = JSON.stringify({ model: "m2", stop_reason: "end_turn", usage: { input_tokens: 3, output_tokens: 2 }, content: [{ type: "text", text: "OK" }] });
  const p = new AnthropicProvider({ apiKey: "k", model: "m", timeoutMs: 5000, fetchImpl: streamingFetch(json) });
  const r = await p.complete(request);
  assert.deepEqual(r, { content: [{ type: "text", text: "OK" }], stopReason: "end_turn", usage: { inputTokens: 3, outputTokens: 2 }, model: "m2" });
});
