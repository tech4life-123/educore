import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/users/member-badges";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { displayLoginId } from "@/lib/auth/login-id";
import { fullName } from "@/lib/format";
import { currentSiteUrl } from "@/lib/site-url";
import { requireCapability } from "@/services/auth";
import { listGuardianLinks, listPeopleByRole } from "@/services/classes";
import { getMember } from "@/services/members";
import { FamilyCard } from "./family-card";
import { MemberActions } from "./member-actions";

export const metadata: Metadata = { title: "User" };

export default async function UserDetailPage({ params }: PageProps<"/users/[id]">) {
  const { id } = await params;
  const { school, profile } = await requireCapability("users.manage", `/users/${id}`);
  const [member, siteUrl] = await Promise.all([getMember(school.id, id), currentSiteUrl()]);
  if (!member) notFound();

  const name = fullName(member);
  const loginId = displayLoginId(member, school.code);
  const isSelf = member.id === profile.id;
  const familySide = member.role === "parent" ? "children" : member.role === "student" ? "parents" : null;
  const [links, candidates] = familySide
    ? await Promise.all([
        listGuardianLinks(school.id, member.id, familySide),
        listPeopleByRole(school.id, familySide === "children" ? "student" : "parent"),
      ])
    : [[], []];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/users" className="text-sm font-medium text-muted hover:text-foreground print:hidden">
          ← User accounts
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{name}</h1>
          <StatusBadge status={member.status} />
        </div>
        <p className="mt-1 text-sm text-muted">
          {ROLE_LABELS[member.role]}
          {member.role === "student" || member.role === "teacher" || member.role === "school_admin" ? (
            <>
              {" · "}
              <Link
                href={member.role === "student" ? `/students/${member.id}` : `/teachers/${member.id}`}
                className="font-medium text-brand underline-offset-4 hover:underline print:hidden"
              >
                {member.role === "student" ? "Student record" : "Staff record"}
              </Link>
            </>
          ) : null}
        </p>
      </div>

      <Card aria-labelledby="details-title">
        <CardHeader titleId="details-title" title="Account details" />
        <CardBody>
          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Signs in with</dt>
              <dd className="mt-0.5 font-mono text-foreground">{loginId}</dd>
            </div>
            <div>
              <dt className="text-muted">Username</dt>
              <dd className="mt-0.5 text-foreground">{member.username ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Email</dt>
              <dd className="mt-0.5 text-foreground">{member.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Phone</dt>
              <dd className="mt-0.5 text-foreground">{member.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Password</dt>
              <dd className="mt-0.5">
                {member.must_change_password ? (
                  <Badge tone="warning">Temporary — not yet changed</Badge>
                ) : (
                  <span className="text-foreground">Set by the user</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Created</dt>
              <dd className="mt-0.5 text-foreground">
                {new Date(member.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      {familySide ? (
        <FamilyCard side={familySide} profileId={member.id} links={links} candidates={candidates} schoolCode={school.code} />
      ) : null}

      <Card aria-labelledby="manage-title">
        <CardHeader
          titleId="manage-title"
          title="Manage access"
          description="Every change here is recorded in the school’s audit log."
        />
        <CardBody>
          {isSelf ? (
            <Alert tone="info" title="This is your account">
              To protect against lock-outs, you can’t suspend or reset your own account here. Change your own password from
              Settings.
            </Alert>
          ) : (
            <MemberActions
              profileId={member.id}
              fullName={name}
              roleLabel={ROLE_LABELS[member.role]}
              status={member.status}
              loginId={loginId}
              schoolName={school.name}
              siteUrl={siteUrl}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
