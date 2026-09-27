/**
 * Deterministic provider for tests and for local development without an API
 * key (AI_PROVIDER=mock). It never contacts any service and never sees data
 * beyond the request it is given. Replies describe the request shape only.
 */

import type { AiProvider, AiRequest, AiResponse, AiStreamEvent } from "../types";

function lastUserText(request: AiRequest): string {
  const last = [...request.messages].reverse().find((m) => m.role === "user");
  if (!last) return "";
  if (typeof last.content === "string") return last.content;
  return last.content.map((b) => (b.type === "text" ? b.text : "")).join(" ");
}

export class MockProvider implements AiProvider {
  readonly name = "mock";
  readonly model = "mock-1";

  private reply(request: AiRequest): string {
    const words = lastUserText(request).trim().split(/\s+/).filter(Boolean).length;
    return `Test reply from the EduCore mock AI provider. Your message had ${words} word${words === 1 ? "" : "s"}.`;
  }

  async complete(request: AiRequest): Promise<AiResponse> {
    const text = this.reply(request);
    return {
      content: [{ type: "text", text }],
      stopReason: "end_turn",
      usage: { inputTokens: Math.ceil(JSON.stringify(request.messages).length / 4), outputTokens: Math.ceil(text.length / 4) },
      model: this.model,
    };
  }

  async *stream(request: AiRequest): AsyncIterable<AiStreamEvent> {
    const { content, usage, model } = await this.complete(request);
    const text = content[0]?.type === "text" ? content[0].text : "";
    for (const piece of text.match(/\S+\s*/g) ?? []) yield { type: "text", text: piece };
    yield { type: "done", stopReason: "end_turn", usage, model };
  }
}
