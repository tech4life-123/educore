import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnnouncementForm } from "@/components/announcements/announcement-form";
import { Card, CardBody } from "@/components/ui/card";
import { todayIn } from "@/lib/attendance";
import { isoToZonedLocal } from "@/lib/announcements";
import { getCurrentAcademicYear } from "@/services/academics";
import { getAnnouncement } from "@/services/announcements";
import { requireCapability } from "@/services/auth";
import { listClasses } from "@/services/classes";
import { getSchoolProfile } from "@/services/school";
import { classesTaughtBy } from "@/services/students";
import { updateAnnouncement } from "../../actions";

export const metadata: Metadata = { title: "Edit announcement" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditAnnouncementPage({ params }: PageProps<"/announcements/[id]/edit">) {
  const { school, profile } = await requireCapability("grades.enter", "/announcements");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const isAdmin = profile.role === "school_admin";
  const schoolProfile = await getSchoolProfile(school.id);
  const tz = schoolProfile?.timezone ?? "Africa/Monrovia";
  const a = await getAnnouncement(school.id, id, profile.id, todayIn(tz));
  if (!a || (!isAdmin && a.authorId !== profile.id)) notFound();

  const year = await getCurrentAcademicYear(school.id);
  const all = year ? await listClasses(school.id, year.id) : [];
  const taught = !isAdmin && year ? await classesTaughtBy(school.id, year.id, profile.id) : null;
  const classes = (taught ? all.filter((c) => taught.includes(c.id)) : all).map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/announcements/${a.id}`} className="text-sm font-medium text-muted hover:text-foreground">
          ← Back
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Edit announcement</h1>
      </div>
      <Card>
        <CardBody className="p-5 sm:p-6">
          <AnnouncementForm
            action={updateAnnouncement}
            classes={classes}
            isAdmin={isAdmin}
            submitLabel="Save changes"
            defaults={{
              id: a.id,
              title: a.title,
              body: a.body,
              audience: a.audience,
              classId: a.classId ?? "",
              pinned: a.pinned,
              publishAt: isoToZonedLocal(a.publishAt, tz),
              expiresOn: a.expiresOn ?? "",
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
