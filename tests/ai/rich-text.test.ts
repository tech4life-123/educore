import assert from "node:assert/strict";
import { test } from "node:test";
import { parseInline, parseRichText } from "@/lib/ai/rich-text";
import { AI_DATA_TOOLS_AVAILABLE, suggestionsFor } from "@/lib/ai/suggestions";

test("paragraphs, headings, bullet and numbered lists", () => {
  const blocks = parseRichText("## Steps\nOpen **Grades**.\nThen publish.\n\n- one\n* two\n\n3. three\n4) four");
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["heading", "paragraph", "bullets", "numbers"],
  );
  const numbers = blocks[3];
  assert.equal(numbers.kind === "numbers" && numbers.start, 3);
  assert.deepEqual(parseInline("Open **Grades** then `Publish`"), [
    { kind: "text", text: "Open " },
    { kind: "bold", text: "Grades" },
    { kind: "text", text: " then " },
    { kind: "code", text: "Publish" },
  ]);
});

test("markup and scripts stay plain text (rendered as text nodes, never HTML)", () => {
  const blocks = parseRichText('<script>alert(1)</script> <img src=x onerror=alert(2)> [link](javascript:alert(3))');
  assert.equal(blocks.length, 1);
  const b = blocks[0];
  assert.equal(b.kind, "paragraph");
  if (b.kind === "paragraph") {
    assert.deepEqual(b.content, [{ kind: "text", text: '<script>alert(1)</script> <img src=x onerror=alert(2)> [link](javascript:alert(3))' }]);
  }
});

test("suggestions differ by role and hide data questions until data tools exist", () => {
  const roles = ["student", "parent", "teacher", "school_admin", "super_admin"] as const;
  const sets = roles.map((r) => suggestionsFor(r));
  for (const s of sets) {
    assert.ok(s.length >= 3 && s.length <= 4);
  }
  assert.equal(new Set(sets.map((s) => s.join("|"))).size, roles.length);
  if (!AI_DATA_TOOLS_AVAILABLE) {
    assert.ok(!suggestionsFor("student").includes("What is my average?"));
    assert.ok(!suggestionsFor("teacher").includes("Who was absent today?"));
  }
});
