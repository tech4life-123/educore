"use client";

import { useEffect } from "react";
import { markAnnouncementRead } from "@/app/(school)/announcements/actions";

/** Records the read once the announcement has been shown. */
export function MarkRead({ id }: { id: string }) {
  useEffect(() => {
    void markAnnouncementRead(id);
  }, [id]);
  return null;
}
