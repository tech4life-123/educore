"use client";

import { Button } from "./button";

export function PrintButton({ children = "Print" }: { children?: string }) {
  return (
    <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
      {children}
    </Button>
  );
}
