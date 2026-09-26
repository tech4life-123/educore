import { AppShell, SchoolBrand } from "@/components/shell/app-shell";
import { SchoolLogo } from "@/components/shell/school-logo";
import { ROLE_LABELS, type SchoolRole } from "@/lib/auth/roles";
import { navigationFor } from "@/lib/navigation";
import { requireSchoolMember } from "@/services/auth";
import { fullName } from "@/lib/format";
import { signOut } from "@/app/(auth)/login/actions";

/**
 * Shell for every school-scoped route. The layout guard keeps the shell from
 * rendering for the wrong audience; each page ALSO calls a require* guard,
 * because layouts are not re-run on every client navigation.
 */
export default async function SchoolLayout({ children }: LayoutProps<"/">) {
  const { user, profile, school } = await requireSchoolMember("/dashboard");
  const role = profile.role as SchoolRole;

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
    >
      {children}
    </AppShell>
  );
}
