"use client";

import { useEffect } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[ui] unhandled error", error.digest ?? "no-digest");
  }, [error]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-4">
      <Alert tone="danger" title="Something went wrong">
        An unexpected error occurred. Please try again{error.digest ? ` (reference ${error.digest})` : ""}.
      </Alert>
      <div>
        <Button variant="secondary" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
