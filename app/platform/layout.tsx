import { EduCoreLogo } from "@/components/brand/educore-logo";
import { AppShell, SchoolBrand } from "@/components/shell/app-shell";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { fullName } from "@/lib/format";
import type { NavItem } from "@/lib/navigation";
import { requireSuperAdmin } from "@/services/auth";
import { signOut } from "@/app/(auth)/login/actions";
import { AssistantLauncher } from "@/components/ai/assistant";
import { getAiConfig } from "@/lib/ai/config";
import { AI_DATA_TOOLS_AVAILABLE, suggestionsFor } from "@/lib/ai/suggestions";

const PLATFORM_NAVIGATION: readonly NavItem[] = [
  { label: "Schools", href: "/platform", icon: "platform", available: true, roles: [] },
  { label: "Statistics", href: "/platform/statistics", icon: "reports", available: true, roles: [] },
  { label: "Domains", href: "/platform/domains", icon: "domains", available: true, roles: [] },
];

export default async function PlatformLayout({ children }: LayoutProps<"/platform">) {
  const { user, profile } = await requireSuperAdmin();

  return (
    <AppShell
      identity={{
        homeHref: "/platform",
        primaryColor: null,
        brand: <SchoolBrand logo={<EduCoreLogo showName={false} />} name="EduCore" subtitle="Platform administration" />,
      }}
      user={{ fullName: fullName(profile), email: user.email ?? null, roleLabel: ROLE_LABELS.super_admin }}
      navigation={PLATFORM_NAVIGATION}
      signOutAction={signOut}
      assistant={
        getAiConfig().enabled ? (
          <AssistantLauncher suggestions={suggestionsFor("super_admin")} dataAccess={AI_DATA_TOOLS_AVAILABLE} />
        ) : null
      }
    >
      {children}
    </AppShell>
  );
}
