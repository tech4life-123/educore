import assert from "node:assert/strict";
import { test } from "node:test";
import { readNdjson, sendChat, trimHistory, type ChatTurn } from "@/lib/ai/client";
import { INPUT_LIMITS, validateChatInput } from "@/lib/ai/limits";

function streamOf(text: string, chunk = 5): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(c) {
      for (let i = 0; i < bytes.length; i += chunk) c.enqueue(bytes.slice(i, i + chunk));
      c.close();
    },
  });
}

test("trimHistory keeps the newest turns within the server's limits and starts with the user", () => {
  const turns: ChatTurn[] = Array.from({ length: 31 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }));
  const out = trimHistory(turns);
  assert.ok(out.length <= INPUT_LIMITS.maxMessages);
  assert.equal(out[0].role, "user");
  assert.equal(out[out.length - 1].content, "m30");
  assert.equal(validateChatInput({ messages: out }).ok, true, "trimmed history is always accepted by the server");

  const long: ChatTurn[] = [];
  for (let i = 0; i < 9; i++) long.push({ role: "user", content: "q".repeat(1500) }, { role: "assistant", content: "a".repeat(3000) });
  long.push({ role: "user", content: "latest" });
  const trimmed = trimHistory(long);
  assert.equal(validateChatInput({ messages: trimmed }).ok, true);
  assert.equal(trimmed[trimmed.length - 1].content, "latest");
});

test("readNdjson handles lines split across chunks and ignores junk", async () => {
  const lines: unknown[] = [];
  for await (const l of readNdjson(streamOf('{"type":"text","text":"Hel"}\n{"type":"text","text":"lo"}\nnot json\n{"type":"done"}', 3))) lines.push(l);
  assert.deepEqual(lines, [{ type: "text", text: "Hel" }, { type: "text", text: "lo" }, { type: "done" }]);
});

test("sendChat streams text and reports success", async () => {
  let sent: { url: string; body: unknown; headers: Record<string, string> } | null = null;
  const fake = (async (url: string, init: RequestInit) => {
    sent = { url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> };
    return new Response(streamOf('{"type":"text","text":"Hi "}\n{"type":"text","text":"there"}\n{"type":"done","truncated":false}\n'), { status: 200 });
  }) as unknown as typeof fetch;
  let text = "";
  const r = await sendChat([{ role: "user", content: "hello" }], (t) => (text += t), undefined, fake);
  assert.deepEqual(r, { ok: true, truncated: false });
  assert.equal(text, "Hi there");
  assert.equal(sent!.url, "/api/ai/chat");
  assert.equal(sent!.headers["content-type"], "application/json");
  assert.deepEqual(sent!.body, { messages: [{ role: "user", content: "hello" }] });
});

test("sendChat shows the server's safe message on refusal and marks limits as retryable", async () => {
  const refuse = (status: number, message: string) =>
    (async () => new Response(JSON.stringify({ error: { code: "x", message } }), { status })) as unknown as typeof fetch;
  assert.deepEqual(await sendChat([{ role: "user", content: "x" }], () => undefined, undefined, refuse(401, "Please sign in to use EduCore AI.")), {
    ok: false,
    message: "Please sign in to use EduCore AI.",
    retryable: false,
  });
  const limited = await sendChat([{ role: "user", content: "x" }], () => undefined, undefined, refuse(429, "limit"));
  assert.equal(limited.ok === false && limited.retryable, true);
});

test("sendChat: error line mid-stream, cut-off stream, network failure", async () => {
  const withError = (async () => new Response(streamOf('{"type":"text","text":"Part"}\n{"type":"error","code":"timeout","message":"EduCore AI took too long to answer. Please try again."}\n'))) as unknown as typeof fetch;
  const r1 = await sendChat([{ role: "user", content: "x" }], () => undefined, undefined, withError);
  assert.deepEqual(r1, { ok: false, message: "EduCore AI took too long to answer. Please try again.", retryable: true });

  const cut = (async () => new Response(streamOf('{"type":"text","text":"Part"}\n'))) as unknown as typeof fetch;
  const r2 = await sendChat([{ role: "user", content: "x" }], () => undefined, undefined, cut);
  assert.equal(r2.ok, false);

  const offline = (async () => {
    throw new TypeError("Failed to fetch");
  }) as unknown as typeof fetch;
  const r3 = await sendChat([{ role: "user", content: "x" }], () => undefined, undefined, offline);
  assert.equal(r3.ok === false && r3.message.startsWith("Couldn't reach EduCore"), true);
});

test("sendChat reports Stopped when the person aborts", async () => {
  const controller = new AbortController();
  const hanging = ((_: string, init: RequestInit) =>
    new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as unknown as typeof fetch;
  const pending = sendChat([{ role: "user", content: "x" }], () => undefined, controller.signal, hanging);
  controller.abort();
  assert.deepEqual(await pending, { ok: false, message: "Stopped.", retryable: true });
});

test("sendChat passes progress lines to onStatus, never into the answer text", async () => {
  const f = (async () =>
    new Response(streamOf('{"type":"status","text":"Checking attendance…"}\n{"type":"text","text":"91.4%"}\n{"type":"done"}\n'))) as unknown as typeof fetch;
  let text = "";
  const statuses: string[] = [];
  const r = await sendChat([{ role: "user", content: "hi" }], (c) => (text += c), undefined, f, (s) => statuses.push(s));
  assert.equal(r.ok, true);
  assert.equal(text, "91.4%");
  assert.deepEqual(statuses, ["Checking attendance…"]);
  // Without a status callback, status lines are simply ignored.
  const r2 = await sendChat([{ role: "user", content: "hi" }], () => undefined, undefined, f);
  assert.equal(r2.ok, true);
});
