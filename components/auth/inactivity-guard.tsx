"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOutInactive } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ACTIVITY_COOKIE, ACTIVITY_COOKIE_MAX_AGE_S, INACTIVITY_TIMEOUT_MS, INACTIVITY_WARNING_MS } from "@/lib/auth/inactivity";

const STORAGE_KEY = "educore.lastActivity";
/** mousemove is throttled by WRITE_THROTTLE_MS below, so it's cheap to include. */
const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "touchstart", "wheel", "scroll"] as const;
const WRITE_THROTTLE_MS = 15_000;
const POLL_MS = 1_000;

function stampNow(now: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(now));
  } catch {
    // Private browsing or storage disabled — the in-memory deadline still works for this tab.
  }
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${ACTIVITY_COOKIE}=${now}; path=/; samesite=lax; max-age=${ACTIVITY_COOKIE_MAX_AGE_S}${secure}`;
}

function clearStamp() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  document.cookie = `${ACTIVITY_COOKIE}=; path=/; max-age=0`;
}

function readStoredActivity(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Signs everyone out — administrators, teachers, students and parents alike
 * — after five real minutes without interaction: not scrolling, not typing,
 * not clicking, including because the screen was locked or the app wasn't
 * open at all for that long. Mounted once, inside the authenticated app
 * shell (components/shell/app-shell.tsx), so it only runs for signed-in
 * people, on every portal.
 *
 * The deadline is wall-clock time (a stored timestamp), checked on a plain
 * 1-second poll rather than relying on a single setTimeout — browsers
 * throttle timers in background tabs, but a poll comparing "now" to a
 * stored deadline notices immediately on the very first tick after the tab
 * (or the device) becomes active again, which is what "signed out because
 * the screen was locked for five minutes" actually requires.
 *
 * This is the proactive half of the feature: it can warn ("Still there?",
 * 30 seconds before) and sign out mid-page, with nothing else happening.
 * lib/supabase/proxy.ts is the authoritative half — it independently
 * revokes a session whose last recorded activity is stale on the very next
 * server request, so the timeout holds even if this component never got a
 * chance to run (JavaScript blocked, or the tab was closed rather than
 * left open and idle).
 *
 * On sign-out, the person is sent to /login?reason=inactivity&next=<page>,
 * so signing back in returns them to the exact page they were on — see the
 * `next` handling in app/(auth)/login/actions.ts.
 */
export function InactivityGuard() {
  const router = useRouter();
  const pathname = usePathname();
  // Real value is set inside the effect below (from a stored deadline, or
  // now) before it's ever read — Date.now() can't be called during render.
  const deadlineRef = useRef<number>(0);
  const lastWriteRef = useRef(0);
  const signingOutRef = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const signOutNow = useCallback(async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    clearStamp();
    await signOutInactive();
    router.replace(`/login?reason=inactivity&next=${encodeURIComponent(pathname)}`);
  }, [pathname, router]);

  const recordActivity = useCallback(() => {
    if (signingOutRef.current) return;
    const now = Date.now();
    deadlineRef.current = now + INACTIVITY_TIMEOUT_MS;
    setSecondsLeft(null);
    if (now - lastWriteRef.current >= WRITE_THROTTLE_MS) {
      lastWriteRef.current = now;
      stampNow(now);
    }
  }, []);

  useEffect(() => {
    // Resume from a stored deadline (another tab, or this page reloading)
    // instead of always granting a fresh five minutes just because this
    // component remounted.
    const stored = readStoredActivity();
    const now = Date.now();
    if (stored !== null) {
      deadlineRef.current = stored + INACTIVITY_TIMEOUT_MS;
    } else {
      stampNow(now);
      lastWriteRef.current = now;
    }

    const tick = () => {
      if (signingOutRef.current) return;
      const remaining = deadlineRef.current - Date.now();
      if (remaining <= 0) {
        void signOutNow();
      } else if (remaining <= INACTIVITY_WARNING_MS) {
        setSecondsLeft(Math.ceil(remaining / 1000));
      } else {
        setSecondsLeft(null);
      }
    };

    // Real interaction with this page.
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, recordActivity, { passive: true }));

    // Coming back to the tab/device is when a stale deadline actually needs
    // to be noticed, not up to a second later.
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    // Activity recorded in another tab keeps this one from timing out under it.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      const other = Number(event.newValue);
      if (Number.isFinite(other)) deadlineRef.current = other + INACTIVITY_TIMEOUT_MS;
    };
    window.addEventListener("storage", onStorage);

    tick();
    const interval = setInterval(tick, POLL_MS);

    return () => {
      clearInterval(interval);
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, recordActivity));
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("storage", onStorage);
    };
    // Deliberately runs once per mount: a route change is not itself
    // activity (it's handled by proxy.ts refreshing the stamp), and this
    // effect must not tear down and rebuild its listeners on every navigation.
  }, [recordActivity, signOutNow]);

  return (
    <Dialog
      open={secondsLeft !== null}
      onClose={recordActivity}
      title="Still there?"
      description={`You’ll be signed out from inactivity in ${secondsLeft ?? 0} second${secondsLeft === 1 ? "" : "s"}. Nothing you were doing is lost — signing back in returns you to this page.`}
    >
      <div className="flex justify-end gap-2 px-5 py-4">
        <Button type="button" variant="secondary" onClick={() => void signOutNow()}>
          Sign out now
        </Button>
        <Button type="button" onClick={recordActivity} autoFocus>
          Stay signed in
        </Button>
      </div>
    </Dialog>
  );
}
