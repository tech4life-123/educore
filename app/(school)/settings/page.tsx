import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ROLE_LABELS, hasCapability, type SchoolRole } from "@/lib/auth/roles";
import { locationLine, schoolTypeLabel } from "@/lib/format";
import { requireSchoolMember } from "@/services/auth";
import { getSchoolSettings } from "@/services/school";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Settings" };

const ACADEMIC_SYSTEM_LABELS: Record<string, string> = {
  semester: "Semesters",
  trimester: "Trimesters",
  quarter: "Quarters",
  term: "Terms",
};

export default async function SettingsPage() {
  const { user, profile, school } = await requireSchoolMember("/settings");
  const role = profile.role as SchoolRole;
  const settings = await getSchoolSettings(school.id);
  const isAdmin = hasCapability(role, "school.manage");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted">Manage your personal details and view your school’s configuration.</p>
      </div>

      <Card aria-labelledby="profile-title">
        <CardHeader
          titleId="profile-title"
          title="Your profile"
          description={`${user.email ?? ""} · ${ROLE_LABELS[role]}`}
        />
        <CardBody>
          <ProfileForm
            defaults={{
              first_name: profile.first_name,
              middle_name: profile.middle_name,
              last_name: profile.last_name,
              phone: profile.phone,
            }}
          />
          <p className="mt-4 text-xs text-subtle">
            Your role and school can only be changed by an administrator.
          </p>
        </CardBody>
      </Card>

      <Card aria-labelledby="school-title">
        <CardHeader
          titleId="school-title"
          title="School"
          description={isAdmin ? "Editing school details will be added with the school onboarding milestone." : undefined}
          action={<Badge tone="neutral">Read only</Badge>}
        />
        <CardBody>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Row label="Name" value={school.name} />
            <Row label="Code" value={school.code} />
            <Row label="Type" value={schoolTypeLabel(school.school_type)} />
            <Row label="Location" value={locationLine(school)} />
          </dl>
        </CardBody>
      </Card>

      <Card aria-labelledby="academic-title">
        <CardHeader titleId="academic-title" title="Academic configuration" action={<Badge tone="neutral">Read only</Badge>} />
        {settings ? (
          <CardBody>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Row label="Academic system" value={ACADEMIC_SYSTEM_LABELS[settings.academic_system]} />
              <Row label="Passing score" value={`${settings.passing_score}%`} />
              <Row label="Attendance threshold" value={`${settings.attendance_threshold}%`} />
              <Row label="Parent accounts" value={settings.allow_parent_accounts ? "Allowed" : "Not allowed"} />
              <Row
                label="Student self-registration"
                value={settings.allow_student_registration ? "Allowed" : "Not allowed"}
              />
            </dl>
          </CardBody>
        ) : (
          <EmptyState title="No academic configuration yet" description="Your school administrator hasn’t configured this." />
        )}
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border pb-2 sm:block sm:border-0 sm:pb-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-foreground sm:mt-0.5">{value || "—"}</dd>
    </div>
  );
}
