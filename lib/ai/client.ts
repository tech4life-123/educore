/**
 * Browser-side helpers for EduCore AI (pure / fetch only — no secrets here).
 *
 * The conversation lives only in the page's memory: it is not saved in the
 * browser or on the server, and it disappears on reload or sign-out.
 */

import { INPUT_LIMITS } from "./limits";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * The most recent turns that fit the server's limits, starting with a user
 * message. Older turns are dropped in pairs.
 */
export function trimHistory(turns: ChatTurn[]): ChatTurn[] {
  let out = turns.filter((t) => t.content.trim().length > 0);
  // Must start with a user turn.
  while (out.length && out[0].role !== "user") out = out.slice(1);
  const total = (list: ChatTurn[]) => list.reduce((n, t) => n + t.content.length, 0);
  while (out.length > INPUT_LIMITS.maxMessages || (out.length > 1 && total(out) > INPUT_LIMITS.maxTotalChars)) {
    out = out.slice(2);
  }
  // Keep individual messages within the per-message cap (older assistant
  // replies can be long).
  return out.map((t) => (t.content.length > INPUT_LIMITS.maxMessageChars ? { ...t, content: t.content.slice(0, INPUT_LIMITS.maxMessageChars) } : t));
}

export type StreamLine =
  | { type: "text"; text: string }
  | { type: "done"; truncated?: boolean }
  | { type: "error"; code?: string; message: string };

/** Split an NDJSON byte stream into parsed lines. Unparseable lines are skipped. */
export async function* readNdjson(body: ReadableStream<Uint8Array>): AsyncIterable<StreamLine> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try {
          yield JSON.parse(line) as StreamLine;
        } catch {
          // ignore a malformed line
        }
      }
      if (done) break;
    }
    const rest = buffer.trim();
    if (rest) {
      try {
        yield JSON.parse(rest) as StreamLine;
      } catch {
        // ignore
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export type SendResult = { ok: true; truncated: boolean } | { ok: false; message: string; retryable: boolean };

const GENERIC = "EduCore AI is unavailable right now. Please try again later.";

/**
 * Send the conversation and stream the reply into `onText`.
 * Never throws; aborting returns { ok: false, message: "Stopped." }.
 */
export async function sendChat(
  turns: ChatTurn[],
  onText: (chunk: string) => void,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetchImpl("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: trimHistory(turns) }),
      signal,
      credentials: "same-origin",
    });
  } catch {
    if (signal?.aborted) return { ok: false, message: "Stopped.", retryable: true };
    return { ok: false, message: "Couldn't reach EduCore. Check your connection and try again.", retryable: true };
  }

  if (!res.ok || !res.body) {
    let message = GENERIC;
    try {
      const data = (await res.json()) as { error?: { message?: string } };
      if (data.error?.message) message = data.error.message;
    } catch {
      // keep generic
    }
    return { ok: false, message, retryable: res.status === 429 || res.status >= 500 };
  }

  let truncated = false;
  let finished = false;
  try {
    for await (const line of readNdjson(res.body)) {
      if (line.type === "text") onText(line.text);
      else if (line.type === "done") {
        truncated = Boolean(line.truncated);
        finished = true;
      } else if (line.type === "error") return { ok: false, message: line.message || GENERIC, retryable: true };
    }
  } catch {
    if (signal?.aborted) return { ok: false, message: "Stopped.", retryable: true };
    return { ok: false, message: "The connection was interrupted. Please try again.", retryable: true };
  }
  if (!finished) return { ok: false, message: signal?.aborted ? "Stopped." : "The reply was interrupted. Please try again.", retryable: true };
  return { ok: true, truncated };
}
