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
      notifications={
        <NotificationsMenu
          unreadCount={live.filter((a) => !a.isRead).length}
          allHref="/announcements"
          items={live.slice(0, 6).map((a) => ({
            id: a.id,
            title: a.title,
            href: `/announcements/${a.id}`,
            meta: `${a.authorName ?? "School office"} · ${formatDateTime(a.publishAt, tz)}`,
            unread: !a.isRead,
          }))}
        />
      }
    >
      {children}
    </AppShell>
  );
}
