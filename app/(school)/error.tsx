"use client";

import { useEffect } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function SchoolAreaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the opaque digest only; server details are never sent to the client.
    console.error("[ui] page error", error.digest ?? "no-digest");
  }, [error]);

  return (
    <div className="mx-auto max-w-lg space-y-4 py-10">
      <Alert tone="danger" title="Something went wrong">
        This page couldn’t be loaded. Please try again. If the problem continues, contact your school administrator
        {error.digest ? ` and quote reference ${error.digest}` : ""}.
      </Alert>
      <Button variant="secondary" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
