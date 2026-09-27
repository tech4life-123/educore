import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ROLE_FILTER_OPTIONS, STATUS_OPTIONS, StatusBadge } from "@/components/users/member-badges";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { displayLoginId } from "@/lib/auth/login-id";
import { fullName } from "@/lib/format";
import { requireCapability } from "@/services/auth";
import { MEMBERS_PAGE_SIZE, listMembers, type MemberRole, type MemberStatus } from "@/services/members";

export const metadata: Metadata = { title: "User accounts" };

const ROLES = new Set(ROLE_FILTER_OPTIONS.map((o) => o.value as string));
const STATUSES = new Set(STATUS_OPTIONS.map((o) => o.value as string));

export default async function UsersPage({ searchParams }: PageProps<"/users">) {
  const { school, profile } = await requireCapability("users.manage", "/users");
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

  const q = one(params.q).slice(0, 60);
  const role = ROLES.has(one(params.role)) ? (one(params.role) as MemberRole) : undefined;
  const status = STATUSES.has(one(params.status)) ? (one(params.status) as MemberStatus) : undefined;
  const page = Math.max(1, Number.parseInt(one(params.page), 10) || 1);

  const { rows, total } = await listMembers({ schoolId: school.id, role, status, search: q, page });
  const pages = Math.max(1, Math.ceil(total / MEMBERS_PAGE_SIZE));
  const filtered = Boolean(q || role || status);

  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (role) sp.set("role", role);
    if (status) sp.set("status", status);
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return s ? `/users?${s}` : "/users";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">User accounts</h1>
          <p className="mt-1 text-sm text-muted">Everyone who can sign in to {school.name}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/users/import" variant="secondary">
            Import from spreadsheet
          </ButtonLink>
          <ButtonLink href="/users/new">Add user</ButtonLink>
        </div>
      </div>

      <Card>
        <form method="get" action="/users" role="search" className="grid gap-3 border-b border-border p-4 sm:grid-cols-[1fr_auto_auto_auto]">
          <label className="sr-only" htmlFor="q">
            Search users
          </label>
          <Input id="q" name="q" type="search" placeholder="Search name, username or email" defaultValue={q} />
          <label className="sr-only" htmlFor="role">
            Role
          </label>
          <select id="role" name="role" defaultValue={role ?? ""} className="h-11 rounded-lg border border-border bg-surface px-3 text-sm">
            <option value="">All roles</option>
            {ROLE_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" defaultValue={status ?? ""} className="h-11 rounded-lg border border-border bg-surface px-3 text-sm">
            <option value="">Any status</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button type="submit" className={buttonClasses("secondary", "md", "h-11")}>
            Filter
          </button>
        </form>

        {rows.length === 0 ? (
          filtered ? (
            <EmptyState
              icon="user"
              title="No users match"
              description="Try a different search or filter."
              action={
                <Link href="/users" className="text-sm font-medium text-foreground underline underline-offset-4">
                  Clear filters
                </Link>
              }
            />
          ) : (
            <EmptyState
              icon="user"
              title="No user accounts yet"
              description="Add people one at a time, or import a whole class from a spreadsheet."
              action={<ButtonLink href="/users/new">Add the first user</ButtonLink>}
            />
          )
        ) : (
          <>
            <Table caption={`User accounts at ${school.name}`}>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Login</TH>
                  <TH>Role</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((m) => (
                  <TR key={m.id}>
                    <TD>
                      <Link href={`/users/${m.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                        {fullName(m)}
                      </Link>
                      {m.id === profile.id ? <span className="ml-2 text-xs text-muted">(you)</span> : null}
                    </TD>
                    <TD className="font-mono text-xs">{displayLoginId(m, school.code)}</TD>
                    <TD>{ROLE_LABELS[m.role]}</TD>
                    <TD>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={m.status} />
                        {m.must_change_password && m.status === "active" ? <Badge>Temp password</Badge> : null}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
              <p className="text-muted">
                {total} {total === 1 ? "user" : "users"}
                {pages > 1 ? ` · page ${page} of ${pages}` : ""}
              </p>
              {pages > 1 ? (
                <div className="flex gap-2">
                  {page > 1 ? (
                    <Link href={pageHref(page - 1)} className={buttonClasses("secondary", "sm")}>
                      Previous
                    </Link>
                  ) : null}
                  {page < pages ? (
                    <Link href={pageHref(page + 1)} className={buttonClasses("secondary", "sm")}>
                      Next
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </nav>
          </>
        )}
      </Card>
    </div>
  );
}
