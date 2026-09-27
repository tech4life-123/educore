import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TextField } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { displayLoginId } from "@/lib/auth/login-id";
import { fullName } from "@/lib/format";
import { getCurrentAcademicYear } from "@/services/academics";
import { requireCapability } from "@/services/auth";
import { getStaffRecord } from "@/services/staff";
import { saveStaffDetails } from "../actions";

export const metadata: Metadata = { title: "Staff member" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StaffPage({ params }: PageProps<"/teachers/[id]">) {
  const { school } = await requireCapability("school.manage", "/teachers");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const year = await getCurrentAcademicYear(school.id);
  const staff = await getStaffRecord(school.id, id, year?.id ?? null);
  if (!staff) notFound();
  const d = staff.details;
  const name = fullName({ first_name: staff.firstName, middle_name: staff.middleName, last_name: staff.lastName });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/teachers" className="text-sm font-medium text-muted hover:text-foreground">
          ← Teachers & staff
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{name}</h1>
          {staff.role === "school_admin" ? <Badge tone="brand">Administrator</Badge> : <Badge>Teacher</Badge>}
          {staff.status !== "active" ? <Badge tone="warning">{staff.status}</Badge> : null}
        </div>
        <p className="mt-1 text-sm text-muted">
          {d?.job_title ? `${d.job_title} · ` : ""}
          <span className="font-mono">{displayLoginId(staff, school.code)}</span>
          {staff.phone ? ` · ${staff.phone}` : ""}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card aria-labelledby="teaching-title">
          <CardHeader titleId="teaching-title" title={`Teaching ${year ? `in ${year.name}` : ""}`} description={`${staff.assignments.length} subject assignment${staff.assignments.length === 1 ? "" : "s"}`} />
          {staff.assignments.length === 0 ? (
            <EmptyState icon="subjects" title="No subjects assigned" description="Assign subject teachers on each class page." />
          ) : (
            <ul className="divide-y divide-border">
              {staff.assignments.map((a) => (
                <li key={a.classSubjectId} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                  <span className="font-medium text-foreground">{a.subject}</span>
                  <Link href={`/classes/${a.classId}`} className="text-brand underline-offset-4 hover:underline">
                    Class {a.className}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card aria-labelledby="homeroom-title">
          <CardHeader titleId="homeroom-title" title="Homeroom" />
          {staff.homeroom.length === 0 ? (
            <EmptyState title="Not a homeroom teacher this year" />
          ) : (
            <ul className="divide-y divide-border">
              {staff.homeroom.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                  <Link href={`/classes/${h.id}`} className="font-medium text-brand underline-offset-4 hover:underline">
                    Class {h.name}
                  </Link>
                  <Link href={`/attendance/summary?class=${h.id}`} className="text-muted hover:text-foreground">
                    Attendance
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card aria-labelledby="record-title">
        <CardHeader
          titleId="record-title"
          title="Staff record"
          description="Visible only to administrators and to the staff member."
          action={
            <Link href={`/users/${staff.id}`} className={buttonClasses("secondary", "sm")}>
              Login & access
            </Link>
          }
        />
        <CardBody>
          <ActionForm action={saveStaffDetails} aria-label="Staff record">
            <input type="hidden" name="profile_id" value={staff.id} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <TextField id="employee_number" name="employee_number" label="Employee number" defaultValue={d?.employee_number ?? ""} maxLength={30} />
              <TextField id="job_title" name="job_title" label="Job title" defaultValue={d?.job_title ?? ""} maxLength={80} placeholder="e.g. Mathematics teacher" />
              <SelectField
                id="gender"
                name="gender"
                label="Gender"
                placeholder="Not recorded"
                defaultValue={d?.gender ?? ""}
                options={[
                  { value: "female", label: "Female" },
                  { value: "male", label: "Male" },
                ]}
              />
              <TextField id="qualification" name="qualification" label="Highest qualification" defaultValue={d?.qualification ?? ""} maxLength={150} placeholder="e.g. B.Sc. Education" />
              <TextField id="specialization" name="specialization" label="Specialization" defaultValue={d?.specialization ?? ""} maxLength={150} />
              <SelectField
                id="employment_type"
                name="employment_type"
                label="Employment"
                placeholder="Not recorded"
                defaultValue={d?.employment_type ?? ""}
                options={[
                  { value: "full_time", label: "Full-time" },
                  { value: "part_time", label: "Part-time" },
                  { value: "contract", label: "Contract" },
                  { value: "volunteer", label: "Volunteer" },
                ]}
              />
              <TextField id="hire_date" name="hire_date" type="date" label="Date hired" defaultValue={d?.hire_date ?? ""} />
              <TextField id="home_address" name="home_address" label="Home address" defaultValue={d?.home_address ?? ""} maxLength={300} />
            </div>
            <SubmitButton loadingText="Saving…">Save record</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}
