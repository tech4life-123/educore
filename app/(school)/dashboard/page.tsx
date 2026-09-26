import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icons } from "@/components/ui/icons";
import { SchoolLogo } from "@/components/shell/school-logo";
import { ROLE_LABELS, type SchoolRole } from "@/lib/auth/roles";
import { locationLine, schoolTypeLabel } from "@/lib/format";
import { navigationFor } from "@/lib/navigation";
import { requireSchoolMember } from "@/services/auth";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { profile, school } = await requireSchoolMember("/dashboard");
  const { denied } = await searchParams;
  const role = profile.role as SchoolRole;
  const upcoming = navigationFor(role).filter((item) => !item.available);

  return (
    <div className="space-y-6">
      {denied ? (
        <Alert tone="warning" title="Access denied">
          You don’t have permission to open that page. If you think this is a mistake, contact your school
          administrator.
        </Alert>
      ) : null}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Welcome, {profile.first_name}</h1>
        <p className="mt-1 text-sm text-muted">
          Signed in as {ROLE_LABELS[role]} at {school.name}.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1" aria-labelledby="school-card-title">
          <CardHeader title="Your school" titleId="school-card-title" />
          <CardBody className="space-y-4">
            <div className="flex items-center gap-3">
              <SchoolLogo name={school.name} logoUrl={school.logo_url} size="lg" />
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{school.name}</p>
                <p className="text-sm text-muted">{schoolTypeLabel(school.school_type)}</p>
              </div>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">School code</dt>
                <dd className="font-medium text-foreground">{school.code}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Location</dt>
                <dd className="text-right text-foreground">{locationLine(school)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Your role</dt>
                <dd>
                  <Badge tone="brand">{ROLE_LABELS[role]}</Badge>
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2" aria-labelledby="modules-card-title">
          <CardHeader
            title="School modules"
            titleId="modules-card-title"
            description="EduCore is being rolled out in stages. These modules will appear here as they are released."
          />
          {upcoming.length > 0 ? (
            <CardBody>
              <ul className="grid gap-2 sm:grid-cols-2">
                {upcoming.map((item) => {
                  const Icon = Icons[item.icon];
                  return (
                    <li
                      key={item.href}
                      className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm"
                    >
                      <Icon className="text-muted" />
                      <span className="flex-1 text-foreground">{item.label}</span>
                      <Badge>Coming soon</Badge>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          ) : (
            <EmptyState title="All modules are available" />
          )}
        </Card>
      </div>

      <Card aria-labelledby="activity-card-title">
        <CardHeader title="Recent activity" titleId="activity-card-title" />
        <EmptyState
          title="Nothing to show yet"
          description="Activity from attendance, grades and announcements will appear here once those modules are live."
          action={
            <Link href="/settings" className="text-sm font-medium text-foreground underline underline-offset-4">
              Review your profile
            </Link>
          }
        />
      </Card>
    </div>
  );
}
