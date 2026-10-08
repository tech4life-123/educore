import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ROLE_LABELS, hasCapability, type SchoolRole } from "@/lib/auth/roles";
import { locationLine, schoolTypeLabel } from "@/lib/format";
import { requireSchoolMember } from "@/services/auth";
import { getSchoolAddresses, getSchoolProfile, getSchoolSettings } from "@/services/school";
import { ProfileForm } from "./profile-form";
import {
  AcademicSettingsForm,
  BackgroundImageForm,
  BackgroundPreferenceToggle,
  LogoForm,
  SchoolProfileForm,
} from "./school-forms";

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
  const isAdmin = hasCapability(role, "school.manage");
  const [settings, schoolProfile, addresses] = await Promise.all([
    getSchoolSettings(school.id),
    isAdmin ? getSchoolProfile(school.id) : Promise.resolve(null),
    isAdmin ? getSchoolAddresses(school.id) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          {isAdmin
            ? "Manage your personal details, your school’s profile, branding and academic configuration."
            : "Manage your personal details and view your school’s configuration."}
        </p>
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
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-subtle">Your role and school can only be changed by an administrator.</p>
            <ButtonLink href="/change-password" variant="secondary" size="sm">
              Change password
            </ButtonLink>
          </div>
        </CardBody>
      </Card>

      {isAdmin && schoolProfile ? (
        <>
          <Card aria-labelledby="logo-title">
            <CardHeader
              titleId="logo-title"
              title="School logo"
              description="Shown in the sidebar, on sign-in credentials and on printed documents."
            />
            <CardBody>
              <LogoForm name={schoolProfile.name} logoUrl={schoolProfile.logo_url} />
            </CardBody>
          </Card>

          <Card aria-labelledby="school-title">
            <CardHeader
              titleId="school-title"
              title="School profile & branding"
              description="Changes apply to everyone in your school as soon as you save."
            />
            <CardBody>
              <SchoolProfileForm defaults={schoolProfile} />
            </CardBody>
          </Card>

          <Card aria-labelledby="address-title">
            <CardHeader
              titleId="address-title"
              title="Web address"
              description="Visitors who open your address see a public page for your school, built from your profile and branding above. Signed-in users use the same address to sign in."
            />
            <CardBody>
              {addresses.length === 0 ? (
                <p className="text-sm text-muted">
                  Your school does not have its own web address yet. Ask the EduCore platform administrator to set one up.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {addresses.map((a) => (
                    <li key={a.domain} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="break-all font-mono text-sm text-foreground">{a.domain}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {a.type === "subdomain" ? "Issued by EduCore" : "Your own domain"}
                          {a.isPrimary ? " · main address" : ""}
                        </p>
                        {a.status === "pending" && a.dnsInstructions ? (
                          <p className="mt-1 text-xs text-muted">Still to add at your domain provider: {a.dnsInstructions}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={a.status === "verified" ? "success" : a.status === "failed" ? "danger" : "warning"}>
                          {a.status === "verified" ? "Live" : a.status === "failed" ? "Rejected" : "Waiting"}
                        </Badge>
                        {a.status === "verified" ? (
                          <ButtonLink href={`https://${a.domain}`} variant="secondary" size="sm">
                            Open public page
                          </ButtonLink>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card aria-labelledby="background-title">
            <CardHeader
              titleId="background-title"
              title="School background"
              description="Shown, blurred, behind every page for everyone in your school."
            />
            <CardBody className="space-y-6">
              <BackgroundImageForm backgroundUrl={schoolProfile.cover_image_url} />
              <div className="border-t border-border pt-4">
                <BackgroundPreferenceToggle defaultChecked={profile.show_school_background} />
              </div>
            </CardBody>
          </Card>

          {settings ? (
            <Card aria-labelledby="academic-title">
              <CardHeader titleId="academic-title" title="Academic configuration" />
              <CardBody>
                <AcademicSettingsForm
                  defaults={{
                    academic_system: settings.academic_system,
                    passing_score: Number(settings.passing_score),
                    attendance_threshold: Number(settings.attendance_threshold),
                    allow_parent_accounts: settings.allow_parent_accounts,
                  }}
                />
              </CardBody>
            </Card>
          ) : null}
        </>
      ) : (
        <>
          <Card aria-labelledby="school-title">
            <CardHeader titleId="school-title" title="School" action={<Badge tone="neutral">Read only</Badge>} />
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
            <CardHeader
              titleId="academic-title"
              title="Academic configuration"
              action={<Badge tone="neutral">Read only</Badge>}
            />
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
              <EmptyState
                title="No academic configuration yet"
                description="Your school administrator hasn’t configured this."
              />
            )}
          </Card>
        </>
      )}
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
