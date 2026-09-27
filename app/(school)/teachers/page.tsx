import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { displayLoginId } from "@/lib/auth/login-id";
import { getCurrentAcademicYear } from "@/services/academics";
import { requireCapability } from "@/services/auth";
import { listStaff } from "@/services/staff";

export const metadata: Metadata = { title: "Teachers & staff" };

export default async function TeachersPage() {
  const { school } = await requireCapability("school.manage", "/teachers");
  const year = await getCurrentAcademicYear(school.id);
  const staff = await listStaff(school.id, year?.id ?? null);
  const teachers = staff.filter((s) => s.role === "teacher");
  const unassigned = teachers.filter((t) => t.subjects === 0 && t.homeroom.length === 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Teachers & staff</h1>
          <p className="mt-1 text-sm text-muted">
            {teachers.length} teacher{teachers.length === 1 ? "" : "s"} and {staff.length - teachers.length} administrator
            {staff.length - teachers.length === 1 ? "" : "s"}
            {year ? ` · teaching loads for ${year.name}` : ""}.
          </p>
        </div>
        <Link href="/users/new" className={buttonClasses("primary")}>
          Add staff member
        </Link>
      </div>

      <Card>
        <CardHeader
          title="Directory"
          description={unassigned ? `${unassigned} teacher${unassigned === 1 ? " has" : "s have"} no class or subject this year.` : undefined}
        />
        {staff.length === 0 ? (
          <EmptyState icon="teachers" title="No staff yet" description="Add teachers from User accounts." />
        ) : (
          <Table caption="Teachers and staff">
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Employee no.</TH>
                <TH>Role</TH>
                <TH>Homeroom</TH>
                <TH className="text-right">Subjects taught</TH>
                <TH>Signs in with</TH>
              </TR>
            </THead>
            <TBody>
              {staff.map((s) => (
                <TR key={s.id}>
                  <TD className="font-medium">
                    <Link href={`/teachers/${s.id}`} className="text-brand underline-offset-4 hover:underline">
                      {s.lastName}, {s.firstName}
                    </Link>
                    {s.jobTitle ? <span className="block text-xs text-muted">{s.jobTitle}</span> : null}
                  </TD>
                  <TD className="font-mono text-xs">{s.employeeNumber ?? <span className="text-subtle">—</span>}</TD>
                  <TD>{s.role === "school_admin" ? <Badge tone="brand">Administrator</Badge> : <Badge>Teacher</Badge>}</TD>
                  <TD>{s.homeroom.length ? s.homeroom.join(", ") : <span className="text-subtle">—</span>}</TD>
                  <TD className="text-right tabular-nums">{s.subjects || <span className="text-subtle">0</span>}</TD>
                  <TD className="font-mono text-xs text-muted">{displayLoginId(s, school.code)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
