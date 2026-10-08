import { AppShell, SchoolBrand } from "@/components/shell/app-shell";
import { SchoolLogo } from "@/components/shell/school-logo";
import { ROLE_LABELS, type SchoolRole } from "@/lib/auth/roles";
import { navigationFor } from "@/lib/navigation";
import { requireSchoolMember } from "@/services/auth";
import { fullName } from "@/lib/format";
import { signOut } from "@/app/(auth)/login/actions";
import { NotificationsMenu } from "@/components/shell/notifications-menu";
import { formatDateTime } from "@/lib/announcements";
import { todayIn } from "@/lib/attendance";
import { listAnnouncements } from "@/services/announcements";
import { getSchoolProfile } from "@/services/school";
import { listGuardianLinks } from "@/services/classes";
import { getFeeReminders } from "@/services/my-fees";
import { feeReminderItems } from "@/lib/fee-reminders";
import { AssistantLauncher } from "@/components/ai/assistant";
import { getAiConfig } from "@/lib/ai/config";
import { AI_DATA_TOOLS_AVAILABLE, suggestionsFor } from "@/lib/ai/suggestions";

/**
 * Shell for every school-scoped route. The layout guard keeps the shell from
 * rendering for the wrong audience; each page ALSO calls a require* guard,
 * because layouts are not re-run on every client navigation.
 */
export default async function SchoolLayout({ children }: LayoutProps<"/">) {
  const { user, profile, school } = await requireSchoolMember("/dashboard");
  const role = profile.role as SchoolRole;
  const schoolProfile = await getSchoolProfile(school.id);
  const tz = schoolProfile?.timezone ?? "Africa/Monrovia";
  const live = (await listAnnouncements(school.id, profile.id, todayIn(tz)).catch(() => [])).filter((a) => a.isLive);

  // Families get their fee reminders in the bell too (computed, so nothing to dismiss).
  const feeItems =
    role === "student" || role === "parent"
      ? await (async () => {
          const people =
            role === "parent"
              ? (await listGuardianLinks(school.id, profile.id, "children")).map((l) => l.person).filter((p) => p !== null).map((p) => ({ id: p.id, name: fullName(p) }))
              : [{ id: profile.id, name: fullName(profile) }];
          return feeReminderItems(await getFeeReminders(people.map((p) => p.id)), people, role === "parent");
        })().catch(() => [])
      : [];

  return (
    <AppShell
      identity={{
        homeHref: "/dashboard",
        primaryColor: school.primary_color,
        brand: (
          <SchoolBrand
            logo={<SchoolLogo name={school.name} logoUrl={school.logo_url} />}
            name={school.name}
            subtitle={school.motto ?? undefined}
          />
        ),
      }}
      user={{
        fullName: fullName(profile),
        email: user.email ?? null,
        roleLabel: ROLE_LABELS[role],
        settingsHref: "/settings",
      }}
      navigation={navigationFor(role)}
      signOutAction={signOut}
      backgroundImageUrl={profile.show_school_background ? school.cover_image_url : null}
      assistant={
        role !== "finance_officer" && role !== "admissions_officer" && getAiConfig().enabled ? <AssistantLauncher suggestions={suggestionsFor(role)} dataAccess={AI_DATA_TOOLS_AVAILABLE} /> : null
      }
      banner={
        school.is_demo ? (
          <div role="note" className="border-b border-warning/30 bg-warning-soft px-4 py-2 text-center text-sm text-warning sm:px-6">
            <strong>Demonstration school.</strong> Every person, grade and record here is fictional, generated to show how
            EduCore works.
          </div>
        ) : null
      }
      notifications={
        <NotificationsMenu
          unreadCount={live.filter((a) => !a.isRead).length + feeItems.length}
          allHref="/announcements"
          items={[
            ...feeItems.slice(0, 4),
            ...live.slice(0, 6).map((a) => ({
              id: a.id,
              title: a.title,
              href: `/announcements/${a.id}`,
              meta: `${a.authorName ?? "School office"} · ${formatDateTime(a.publishAt, tz)}`,
              unread: !a.isRead,
            })),
          ].slice(0, 8)}
        />
      }
    >
      {children}
    </AppShell>
  );
}
