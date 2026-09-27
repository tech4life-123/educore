import type { Metadata } from "next";
import Link from "next/link";
import { AnnouncementForm } from "@/components/announcements/announcement-form";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentAcademicYear } from "@/services/academics";
import { requireCapability } from "@/services/auth";
import { listClasses } from "@/services/classes";
import { classesTaughtBy } from "@/services/students";
import { createAnnouncement } from "../actions";

export const metadata: Metadata = { title: "New announcement" };

export default async function NewAnnouncementPage() {
  const { school, profile } = await requireCapability("grades.enter", "/announcements/new");
  const isAdmin = profile.role === "school_admin";
  const year = await getCurrentAcademicYear(school.id);
  const all = year ? await listClasses(school.id, year.id) : [];
  const taught = !isAdmin && year ? await classesTaughtBy(school.id, year.id, profile.id) : null;
  const classes = (taught ? all.filter((c) => taught.includes(c.id)) : all).map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/announcements" className="text-sm font-medium text-muted hover:text-foreground">
          ← Announcements
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">New announcement</h1>
      </div>
      <Card>
        {!isAdmin && classes.length === 0 ? (
          <EmptyState icon="classes" title="You don’t teach a class this year" description="Teachers can post to the classes they teach." />
        ) : (
          <CardBody className="p-5 sm:p-6">
            <AnnouncementForm
              action={createAnnouncement}
              classes={classes}
              isAdmin={isAdmin}
              submitLabel="Post announcement"
              defaults={{ title: "", body: "", audience: isAdmin ? "everyone" : "class", classId: "", pinned: false, publishAt: "", expiresOn: "" }}
            />
          </CardBody>
        )}
      </Card>
    </div>
  );
}
