import assert from "node:assert/strict";
import { test } from "node:test";
import { SseParser } from "@/lib/ai/sse";

test("parses events split across chunks and CRLF line endings", () => {
  const p = new SseParser();
  assert.deepEqual(p.push("event: a\r\ndata: {\"x\":"), []);
  assert.deepEqual(p.push("1}\r\n\r\nevent: b\ndata: 2\n\n"), [
    { event: "a", data: '{"x":1}' },
    { event: "b", data: "2" },
  ]);
});

test("ignores comments, joins multi-line data, flushes the tail", () => {
  const p = new SseParser();
  assert.deepEqual(p.push(": keep-alive\n\ndata: line1\ndata: line2\n\n"), [{ event: "message", data: "line1\nline2" }]);
  assert.deepEqual(p.push("data: tail"), []);
  assert.deepEqual(p.end(), [{ event: "message", data: "tail" }]);
});
