"use client";

import "./globals.css";

/** Last-resort boundary (root layout failed). Must render its own <html>. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh items-center justify-center px-4">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-xl font-semibold">EduCore is temporarily unavailable</h1>
          <p className="text-sm text-muted">Please try again in a moment.</p>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
