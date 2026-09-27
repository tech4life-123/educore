"use client";

import { Button } from "@/components/ui/button";

/** Sets every student on the sheet to "Present" (the teacher then changes the exceptions). */
export function MarkAllPresent() {
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={(e) => {
        e.currentTarget.form
          ?.querySelectorAll<HTMLInputElement>('input[type="radio"][value="present"]')
          .forEach((radio) => {
            radio.checked = true;
          });
      }}
    >
      Mark everyone present
    </Button>
  );
}
