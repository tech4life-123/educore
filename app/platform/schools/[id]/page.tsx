import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { displayLoginId } from "@/lib/auth/login-id";
import { formatDate, fullName, schoolTypeLabel } from "@/lib/format";
import { currentSiteUrl } from "@/lib/site-url";
import { requireSuperAdmin } from "@/services/auth";
import { getPlatformStatistics, getSchoolForPlatform } from "@/services/platform";
import { STATUS_LABEL, STATUS_TONE, attendanceRate, passRate, percent } from "@/lib/platform-stats";
import { setAdminStatusAction, setSchoolStatusAction } from "./actions";
import { AddAdminForm } from "./add-admin-form";
import { ResetAdminPassword } from "./reset-admin-password";

export const metadata: Metadata = { title: "School" };

const STATUS_HELP = {
  active: "Members can sign in and use the school normally.",
  pending: "The school has not been activated yet.",
  suspended: "Nobody at this school can see or change any school data until it is reactivated. Nothing is deleted.",
  archived: "The school is closed on EduCore. Its records are kept, nobody can use it, and no accounts can be added.",
} as const;

export default async function PlatformSchoolPage({ params }: PageProps<"/platform/schools/[id]">) {
  await requireSuperAdmin();
  const { id } = await params;
  const [result, stats, siteUrl] = await Promise.all([getSchoolForPlatform(id), getPlatformStatistics(), currentSiteUrl()]);

  if (result.status === "not_found") notFound();
  if (result.status !== "ok") {
    return (
      <Alert tone={result.status === "not_configured" ? "warning" : "danger"} title="Couldn’t load this school">
        {result.status === "not_configured"
          ? "The server-side service key (SUPABASE_SERVICE_ROLE_KEY) is not set for this deployment."
          : "Please refresh the page."}
      </Alert>
    );
  }

  const { school, admins } = result;
  const s = stats.find((r) => r.school_id === school.id);
  const statusForm = (status: "active" | "suspended" | "archived", label: string, confirm?: string) => (
    <ActionForm action={setSchoolStatusAction} compact>
      <input type="hidden" name="school_id" value={school.id} />
      <input type="hidden" name="status" value={status} />
      {confirm ? (
        <ConfirmButton question={confirm} confirmLabel={`Yes, ${label.toLowerCase()}`} pendingLabel="Saving…">
          {label}
        </ConfirmButton>
      ) : (
        <SubmitButton size="sm" loadingText="Saving…">
          {label}
        </SubmitButton>
      )}
    </ActionForm>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/platform" className="text-sm font-medium text-muted hover:text-foreground">
          ← Schools
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{school.name}</h1>
          <Badge tone={STATUS_TONE[school.status]}>{STATUS_LABEL[school.status]}</Badge>
          {school.is_demo ? <Badge tone="warning">Demonstration school · fictional data</Badge> : null}
        </div>
        <p className="mt-1 text-sm text-muted">
          {school.code} · {schoolTypeLabel(school.school_type)}
          {school.city || school.county ? ` · ${[school.city, school.county].filter(Boolean).join(", ")}` : ""} · on EduCore since{" "}
          {formatDate(school.created_at.slice(0, 10))}
        </p>
      </div>

      {s ? (
        <Card aria-labelledby="glance-title">
          <CardHeader titleId="glance-title" title="At a glance" description={s.current_year ? `Current year: ${s.current_year}` : "No current academic year set"} />
          <dl className="grid grid-cols-2 gap-3 px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Students" value={s.students} />
            <Stat label="Girls / boys" value={`${s.female} / ${s.male}`} />
            <Stat label="Teachers" value={s.teachers} />
            <Stat label="Classes" value={s.classes} />
            <Stat label="Attendance" value={percent(attendanceRate(s))} />
            <Stat label="Pass rate" value={percent(passRate(s))} />
          </dl>
        </Card>
      ) : null}

      <Card aria-labelledby="status-title">
        <CardHeader titleId="status-title" title="School status" description={STATUS_HELP[school.status]} />
        <CardBody className="flex flex-wrap items-start gap-3">
          {school.status === "active" ? (
            <>
              {statusForm("suspended", "Suspend school", "Suspend this school? Everyone there loses access immediately.")}
              {statusForm("archived", "Archive school", "Archive this school? Nobody will be able to use it.")}
            </>
          ) : school.status === "suspended" ? (
            <>
              {statusForm("active", "Reactivate school")}
              {statusForm("archived", "Archive school", "Archive this school? Nobody will be able to use it.")}
            </>
          ) : school.status === "archived" ? (
            statusForm("active", "Restore and reactivate")
          ) : (
            statusForm("active", "Activate school")
          )}
        </CardBody>
      </Card>

      <Card aria-labelledby="admins-title">
        <CardHeader
          titleId="admins-title"
          title="Administrators"
          description="School administrators manage everything inside their school. You can reset a password if one is locked out."
        />
        {admins.length === 0 ? (
          <EmptyState icon="user" title="No administrators" description="Add one below so the school can be managed." />
        ) : (
          <Table caption={`Administrators of ${school.name}`}>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Login</TH>
                <TH>Status</TH>
                <TH>Added</TH>
                <TH>
                  <span className="sr-only">Actions</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {admins.map((a) => {
                const name = fullName({ first_name: a.firstName, middle_name: a.middleName, last_name: a.lastName });
                return (
                  <TR key={a.id}>
                    <TD className="font-medium">{name}</TD>
                    <TD className="text-sm">{displayLoginId(a, school.code)}</TD>
                    <TD>
                      <Badge tone={a.status === "active" ? "success" : a.status === "suspended" ? "danger" : "neutral"}>
                        {a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                      </Badge>
                    </TD>
                    <TD className="text-sm text-muted">{formatDate(a.createdAt.slice(0, 10))}</TD>
                    <TD>
                      {school.status === "archived" || a.status === "inactive" ? null : (
                        <div className="flex flex-wrap items-start gap-2">
                          <ResetAdminPassword schoolId={school.id} profileId={a.id} schoolName={school.name} siteUrl={siteUrl} name={name} />
                          <ActionForm action={setAdminStatusAction} compact aria-label={`Account status for ${name}`}>
                            <input type="hidden" name="school_id" value={school.id} />
                            <input type="hidden" name="profile_id" value={a.id} />
                            <input type="hidden" name="status" value={a.status === "active" ? "suspended" : "active"} />
                            {a.status === "active" ? (
                              <ConfirmButton question={`Suspend ${name}?`} confirmLabel="Yes, suspend" pendingLabel="Saving…">
                                Suspend
                              </ConfirmButton>
                            ) : (
                              <SubmitButton size="sm" variant="secondary" loadingText="Saving…">
                                Reactivate
                              </SubmitButton>
                            )}
                          </ActionForm>
                        </div>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      {school.status === "archived" ? null : (
        <Card aria-labelledby="add-admin-title">
          <CardHeader titleId="add-admin-title" title="Add an administrator" description="Creates the account and a one-time password slip to hand over." />
          <CardBody>
            <AddAdminForm schoolId={school.id} schoolCode={school.code} schoolName={school.name} siteUrl={siteUrl} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
