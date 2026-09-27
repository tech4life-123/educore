import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AudienceBadge } from "@/components/announcements/audience-badge";
import { MarkRead } from "@/components/announcements/mark-read";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { todayIn } from "@/lib/attendance";
import { formatDateTime } from "@/lib/announcements";
import { getAnnouncement } from "@/services/announcements";
import { requireSchoolMember } from "@/services/auth";
import { getSchoolProfile } from "@/services/school";
import { deleteAnnouncement } from "../actions";

export const metadata: Metadata = { title: "Announcement" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AnnouncementPage({ params, searchParams }: PageProps<"/announcements/[id]">) {
  const { school, profile } = await requireSchoolMember("/announcements");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const schoolProfile = await getSchoolProfile(school.id);
  const tz = schoolProfile?.timezone ?? "Africa/Monrovia";
  const a = await getAnnouncement(school.id, id, profile.id, todayIn(tz));
  if (!a) notFound();
  const canEdit = profile.role === "school_admin" || a.authorId === profile.id;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {a.isLive && !a.isRead ? <MarkRead id={a.id} /> : null}
      <Link href="/announcements" className="text-sm font-medium text-muted hover:text-foreground">
        ← Announcements
      </Link>
      {query.posted ? <Alert tone="success" title="Announcement posted" /> : null}
      {query.saved ? <Alert tone="success" title="Changes saved" /> : null}
      <Card>
        <CardBody className="space-y-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <AudienceBadge audience={a.audience} className={a.className} />
            {a.pinned ? <Badge tone="brand">Pinned</Badge> : null}
            {!a.isLive ? <Badge tone="warning">{a.isScheduled ? "Scheduled — not visible yet" : "Expired — no longer shown"}</Badge> : null}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{a.title}</h1>
          <p className="text-sm text-muted">
            {a.authorName ?? "School office"} · {formatDateTime(a.publishAt, tz)}
            {a.expiresOn ? ` · shown until ${a.expiresOn}` : ""}
          </p>
          <div className="whitespace-pre-line text-base leading-relaxed text-foreground">{a.body}</div>
        </CardBody>
        {canEdit ? (
          <CardBody className="flex flex-wrap items-center gap-3 border-t border-border">
            <Link href={`/announcements/${a.id}/edit`} className={buttonClasses("secondary", "sm")}>
              Edit
            </Link>
            <ActionForm action={deleteAnnouncement} compact>
              <input type="hidden" name="id" value={a.id} />
              <ConfirmButton question="Delete this announcement?" confirmLabel="Yes, delete" pendingLabel="Deleting…">
                Delete
              </ConfirmButton>
            </ActionForm>
          </CardBody>
        ) : null}
      </Card>
    </div>
  );
}
