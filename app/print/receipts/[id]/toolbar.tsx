"use client";

import { Button } from "@/components/ui/button";

export function ReceiptToolbar({ backHref, number }: { backHref: string; number: string }) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-300 bg-white px-4 py-3 print:hidden">
      <p className="text-sm text-neutral-700">Receipt {number} · A4. Choose “Save as PDF” in the print dialog to keep a copy.</p>
      <div className="flex gap-2">
        <a href={backHref} className="inline-flex h-10 items-center rounded-lg border border-neutral-300 px-4 text-sm font-medium">
          Back
        </a>
        <Button onClick={() => window.print()}>Print / Save as PDF</Button>
      </div>
    </div>
  );
}
