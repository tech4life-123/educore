"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Icons } from "@/components/ui/icons";
import { sendChat, type ChatTurn } from "@/lib/ai/client";
import { INPUT_LIMITS } from "@/lib/ai/limits";
import { cn } from "@/lib/cn";
import { RichText } from "./rich-text";

interface Message extends ChatTurn {
  id: number;
  /** Assistant reply still streaming. */
  pending?: boolean;
  /** The reply to this user message failed; shown with Retry. */
  error?: string;
  retryable?: boolean;
  truncated?: boolean;
  /** Progress text while a data tool runs, e.g. "Checking attendance…". */
  status?: string;
}

let nextId = 1;

/**
 * EduCore AI launcher (top bar) and chat panel.
 *
 * The conversation is held in memory only — nothing is stored in the browser
 * or on the server — and it survives moving between pages because the shell
 * layout keeps this component mounted.
 */
export function AssistantLauncher({ suggestions, dataAccess = false }: { suggestions: string[]; dataAccess?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    if (!open && d.open) d.close();
  }, [open]);

  // Keep the newest message in view while streaming.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Stop any reply in progress if the component unmounts (sign-out etc.).
  useEffect(() => () => abortRef.current?.abort(), []);

  const ask = useCallback(
    async (text: string, base: Message[]) => {
      const question = text.trim();
      if (!question || busy) return;
      const user: Message = { id: nextId++, role: "user", content: question };
      const reply: Message = { id: nextId++, role: "assistant", content: "", pending: true };
      // Earlier failed questions are left out of the conversation sent to the server.
      const history: ChatTurn[] = [];
      for (const m of base) {
        if (m.error || m.pending) continue;
        history.push({ role: m.role, content: m.content });
      }
      // Drop a user turn that never got an answer.
      while (history.length && history[history.length - 1].role === "user") history.pop();
      history.push({ role: "user", content: question });

      setMessages([...base.filter((m) => !m.error), user, reply]);
      setBusy(true);
      setAnnouncement("EduCore AI is answering…");
      const controller = new AbortController();
      abortRef.current = controller;

      let answer = "";
      const result = await sendChat(
        history,
        (chunk) => {
          answer += chunk;
          const snapshot = answer;
          setMessages((list) => list.map((m) => (m.id === reply.id ? { ...m, content: snapshot, status: undefined } : m)));
        },
        controller.signal,
        undefined,
        (status) => {
          setMessages((list) => list.map((m) => (m.id === reply.id ? { ...m, status } : m)));
          setAnnouncement(status);
        },
      );
      abortRef.current = null;
      setBusy(false);

      if (result.ok) {
        setMessages((list) => list.map((m) => (m.id === reply.id ? { ...m, pending: false, status: undefined, truncated: result.truncated } : m)));
        setAnnouncement(`EduCore AI replied: ${answer}`);
      } else if (answer && result.message === "Stopped.") {
        // Keep what arrived before the person pressed Stop.
        setMessages((list) => list.map((m) => (m.id === reply.id ? { ...m, pending: false, status: undefined, truncated: true } : m)));
        setAnnouncement("Stopped.");
      } else {
        setMessages((list) =>
          list.filter((m) => m.id !== reply.id).map((m) => (m.id === user.id ? { ...m, error: result.message, retryable: result.retryable } : m)),
        );
        setAnnouncement(result.message);
      }
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [busy],
  );

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft;
    if (!text.trim() || busy) return;
    setDraft("");
    void ask(text, messages);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  function retry(message: Message) {
    const base = messages.filter((m) => m.id !== message.id);
    void ask(message.content, base);
  }

  function clear() {
    abortRef.current?.abort();
    setMessages([]);
    setDraft("");
    setAnnouncement("Conversation cleared.");
    inputRef.current?.focus();
  }

  const remaining = INPUT_LIMITS.maxMessageChars - draft.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex h-10 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:px-3"
      >
        <Icons.sparkles width={20} height={20} className="text-brand" />
        <span className="hidden sm:inline">Ask AI</span>
        <span className="sr-only sm:hidden">Ask EduCore AI</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
        className="m-0 ml-auto h-dvh max-h-none w-full max-w-none bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/30 sm:w-[28rem] sm:border-l sm:border-border"
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-start gap-3 border-b border-border px-4 py-3">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand" aria-hidden>
              <Icons.sparkles width={20} height={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-base font-semibold text-foreground">
                EduCore AI
              </h2>
              <p id={descId} className="text-xs text-muted">
                Your intelligent academic and school management assistant.
              </p>
            </div>
            <button
              type="button"
              onClick={clear}
              disabled={messages.length === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-40"
            >
              <Icons.trash width={16} height={16} />
              Clear
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-muted hover:bg-surface-muted" aria-label="Close EduCore AI">
              <Icons.close width={18} height={18} />
            </button>
          </div>

          {/* Conversation */}
          <div ref={logRef} role="log" aria-label="Conversation" aria-live="off" className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col justify-center gap-5">
                <div>
                  <p className="text-lg font-semibold text-foreground">How can I help?</p>
                  <p className="mt-1 text-sm text-muted">
                    {dataAccess
                      ? "Ask about your records in EduCore, how to do something, or for help with a topic. I only see what your account is allowed to see."
                      : "Ask how to do something in EduCore, or for help with a topic. I can’t look up school records yet — that’s coming soon."}
                  </p>
                </div>
                {suggestions.length ? (
                  <ul className="space-y-2" aria-label="Suggested questions">
                    {suggestions.map((s) => (
                      <li key={s}>
                        <button
                          type="button"
                          onClick={() => void ask(s, messages)}
                          disabled={busy}
                          className="w-full rounded-lg border border-border px-3 py-2.5 text-left text-sm text-foreground hover:border-brand hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand"
                        >
                          {s}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <ol className="space-y-4">
                {messages.map((m) =>
                  m.role === "user" ? (
                    <li key={m.id} className="flex flex-col items-end gap-1">
                      <span className="sr-only">You said:</span>
                      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-brand px-3.5 py-2 text-sm text-brand-foreground">
                        {m.content}
                      </div>
                      {m.error ? (
                        <div role="alert" className="flex max-w-[85%] flex-wrap items-center justify-end gap-2 text-xs text-danger">
                          <Icons.alert width={14} height={14} />
                          <span>{m.error}</span>
                          {m.retryable ? (
                            <button type="button" onClick={() => retry(m)} disabled={busy} className="font-semibold underline underline-offset-2">
                              Retry
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  ) : (
                    <li key={m.id} className="flex flex-col items-start gap-1">
                      <span className="text-xs font-medium text-muted">EduCore AI</span>
                      <div className="max-w-[92%] break-words rounded-2xl rounded-bl-md bg-surface-muted px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
                        {m.content ? <RichText text={m.content} /> : null}
                        {m.pending && m.status ? (
                          <span className={`flex items-center gap-2 text-muted ${m.content ? "mt-2" : ""}`}>
                            <Icons.sparkles width={14} height={14} className="animate-pulse" aria-hidden="true" />
                            <span>{m.status}</span>
                          </span>
                        ) : null}
                        {m.content || m.status ? null : (
                          <span className="inline-flex items-center gap-1 text-muted" aria-label="Thinking">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
                          </span>
                        )}
                      </div>
                      {m.truncated && !m.pending ? <span className="text-xs text-muted">Reply cut short.</span> : null}
                    </li>
                  ),
                )}
              </ol>
            )}
          </div>

          {/* Screen-reader announcements (whole replies, not every streamed word) */}
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {announcement}
          </p>

          {/* Composer */}
          <form onSubmit={submit} className="border-t border-border px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            <label htmlFor={`${titleId}-input`} className="sr-only">
              Message EduCore AI
            </label>
            <div
              data-focus-ring-container
              className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20"
            >
              <textarea
                id={`${titleId}-input`}
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, INPUT_LIMITS.maxMessageChars))}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Ask EduCore AI…"
                aria-describedby={`${titleId}-hint`}
                className="max-h-40 min-h-6 flex-1 resize-none bg-transparent text-sm leading-6 text-foreground outline-none [field-sizing:content] placeholder:text-subtle"
              />
              {busy ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-foreground hover:bg-border"
                  aria-label="Stop answering"
                >
                  <Icons.stop width={16} height={16} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground hover:opacity-90 disabled:opacity-40"
                  aria-label="Send"
                >
                  <Icons.send width={16} height={16} />
                </button>
              )}
            </div>
            <p id={`${titleId}-hint`} className={cn("mt-1.5 flex justify-between gap-2 text-[11px] text-subtle")}>
              <span>EduCore AI can make mistakes. Check important information.</span>
              {remaining < 300 ? <span className={cn(remaining < 50 && "text-danger")}>{remaining} left</span> : null}
            </p>
          </form>
        </div>
      </dialog>
    </>
  );
}
