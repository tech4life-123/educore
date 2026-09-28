/**
 * Shared constants for the five-minute inactivity sign-out. Pure — no
 * Node/Edge/browser-only APIs — so the same values can be imported by the
 * proxy (lib/supabase/proxy.ts, edge runtime), the sign-in server action,
 * and the client-side guard (components/auth/inactivity-guard.tsx).
 *
 * "Inactive" means no real interaction was recorded — not scrolling, not
 * typing, not clicking — including because the screen was locked or the app
 * wasn't open at all. See components/auth/inactivity-guard.tsx for how that
 * is measured by wall-clock time, not just an in-tab timer, so returning
 * after being away for the timeout (device locked, app closed) signs the
 * person out immediately rather than waiting for a fresh five minutes.
 */

/** How long without activity before a session is signed out. */
export const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

/** How long before the timeout a warning is shown, with a chance to stay signed in. */
export const INACTIVITY_WARNING_MS = 30 * 1000;

/**
 * Last-activity timestamp (ms since epoch), as a plain (non-HttpOnly) cookie.
 * It has to be written directly by client JS on every real interaction
 * without a network round trip, so it is deliberately not HttpOnly — someone
 * can edit their own cookie to avoid signing themselves out of their own
 * account, which isn't a security concern (it's their own session already).
 * The server (proxy) reads and refreshes it, and is the layer that actually
 * revokes the session when it's stale — see updateSession().
 */
export const ACTIVITY_COOKIE = "educore_activity";

/** Cookie lifetime: long enough that it always outlives the timeout window itself. */
export const ACTIVITY_COOKIE_MAX_AGE_S = Math.ceil(INACTIVITY_TIMEOUT_MS / 1000) + 120;
