import type { Metadata } from "next";
import Link from "next/link";
import { AudienceBadge } from "@/components/announcements/audience-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { todayIn } from "@/lib/attendance";
import { formatDateTime } from "@/lib/announcements";
import { cn } from "@/lib/cn";
import { listAnnouncements } from "@/services/announcements";
import { requireSchoolMember } from "@/services/auth";
import { getSchoolProfile } from "@/services/school";

export const metadata: Metadata = { title: "Announcements" };

export default async function AnnouncementsPage({ searchParams }: PageProps<"/announcements">) {
  const { school, profile } = await requireSchoolMember("/announcements");
  const params = await searchParams;
  const schoolProfile = await getSchoolProfile(school.id);
  const tz = schoolProfile?.timezone ?? "Africa/Monrovia";
  const items = await listAnnouncements(school.id, profile.id, todayIn(tz));
  const canPost = profile.role === "school_admin" || profile.role === "teacher";
  const unread = items.filter((a) => a.isLive && !a.isRead).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Announcements</h1>
          <p className="mt-1 text-sm text-muted">
            {unread ? `${unread} unread.` : "You’re all caught up."}
            {profile.role === "teacher" ? " You can post to the classes you teach." : ""}
          </p>
        </div>
        {canPost ? (
          <Link href="/announcements/new" className={buttonClasses("primary")}>
            New announcement
          </Link>
        ) : null}
      </div>
      {params.deleted ? <Alert tone="success" title="Announcement deleted" /> : null}

      <Card>
        {items.length === 0 ? (
          <EmptyState icon="announcements" title="No announcements yet" description={canPost ? "Post the first one." : "School news will appear here."} />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((a) => (
              <li key={a.id}>
                <Link href={`/announcements/${a.id}`} className="block px-5 py-4 hover:bg-surface-muted">
                  <div className="flex flex-wrap items-center gap-2">
                    {!a.isRead && a.isLive ? <span className="size-2 rounded-full bg-brand" aria-label="Unread" /> : null}
                    <span className={cn("text-foreground", !a.isRead && a.isLive ? "font-semibold" : "font-medium")}>{a.title}</span>
                    {a.pinned ? <Badge tone="brand">Pinned</Badge> : null}
                    <AudienceBadge audience={a.audience} className={a.className} />
                    {!a.isLive ? (
                      <Badge tone="warning">{a.isScheduled ? "Scheduled" : "Expired"}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{a.body}</p>
                  <p className="mt-1 text-xs text-subtle">
                    {a.authorName ?? "School office"} · {formatDateTime(a.publishAt, tz)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
