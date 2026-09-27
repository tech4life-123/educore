import "server-only";

import { cache } from "react";
import type { Audience } from "@/lib/announcements";
import { createClient } from "@/lib/supabase/server";

/**
 * Announcements. RLS returns only what the caller may see: posts in their
 * audience that are published and not expired (plus their own posts, and
 * everything for admins).
 */

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  classId: string | null;
  className: string | null;
  pinned: boolean;
  publishAt: string;
  expiresOn: string | null;
  authorId: string | null;
  authorName: string | null;
  isRead: boolean;
  /** Visible to its audience right now (published and not expired). */
  isLive: boolean;
  /** Publish time is still in the future. */
  isScheduled: boolean;
}

const COLUMNS = `id, title, body, audience, class_id, pinned, publish_at, expires_on, author_id,
  author:profiles!announcements_author_fkey(first_name, last_name),
  class:classes!announcements_class_fkey(name),
  reads:announcement_reads(profile_id)`;

type Raw = {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  class_id: string | null;
  pinned: boolean;
  publish_at: string;
  expires_on: string | null;
  author_id: string | null;
  author: { first_name: string; last_name: string } | null;
  class: { name: string } | null;
  reads: { profile_id: string }[];
};

function toRow(r: Raw, profileId: string, today: string): AnnouncementRow {
  const now = Date.now();
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    audience: r.audience,
    classId: r.class_id,
    className: r.class?.name ?? null,
    pinned: r.pinned,
    publishAt: r.publish_at,
    expiresOn: r.expires_on,
    authorId: r.author_id,
    authorName: r.author ? `${r.author.first_name} ${r.author.last_name}` : null,
    isRead: r.reads.some((x) => x.profile_id === profileId),
    isLive: new Date(r.publish_at).getTime() <= now && (!r.expires_on || r.expires_on >= today),
    isScheduled: new Date(r.publish_at).getTime() > now,
  };
}

function fail(scope: string, error: { code?: string } | null): never {
  console.error(`[announcements] ${scope} failed`, error?.code ?? "unknown");
  throw new Error(`Unable to load ${scope}`);
}

export const listAnnouncements = cache(async (schoolId: string, profileId: string, today: string, limit = 100) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .select(COLUMNS)
    .eq("school_id", schoolId)
    .order("pinned", { ascending: false })
    .order("publish_at", { ascending: false })
    .limit(limit);
  if (error) fail("announcements", error);
  return (data as unknown as Raw[]).map((r) => toRow(r, profileId, today));
});

export async function getAnnouncement(schoolId: string, id: string, profileId: string, today: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("announcements").select(COLUMNS).eq("school_id", schoolId).eq("id", id).maybeSingle();
  if (error) fail("announcement", error);
  return data ? toRow(data as unknown as Raw, profileId, today) : null;
}
