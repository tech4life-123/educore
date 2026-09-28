/**
 * Centralised server-error capture (Next.js instrumentation file).
 *
 * Every server-side error — a failed page render, a route handler, a server
 * action — passes through `onRequestError` exactly once, in addition to any
 * try/catch closer to the failure. It logs one structured line to stderr,
 * which Vercel's built-in Runtime Logs / Observability captures automatically
 * (Project → Observability / Logs) — no extra account or SDK required.
 *
 * Deliberately excluded from the line: request headers (may carry a session
 * cookie), request body, query string values, and anything from EduCore's
 * own data. The error's own message can still contain details if a caller
 * threw with unsanitised text — see the app's existing rule of only ever
 * throwing safe, pre-written messages toward the browser.
 *
 * This does not replace real alerting (an email/Slack ping when something
 * breaks) — Vercel's free logs are pull, not push. If that's wanted later,
 * swap the console.error below for a call to a provider's SDK (e.g. Sentry).
 */

import type { Instrumentation } from "next";

export function register() {
  // No tracing/APM provider wired up yet — nothing to start here.
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const message = error instanceof Error ? error.message : String(error);
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest?: unknown }).digest) : undefined;

  console.error(
    "[server-error]",
    JSON.stringify({
      message: message.slice(0, 500),
      digest,
      method: request.method,
      // Path only, no query string: query strings must never carry personal
      // data in this app, but this avoids relying on that holding forever.
      path: request.path.split("?")[0],
      router: context.routerKind,
      route: context.routePath,
      kind: context.routeType,
    }),
  );
};
