import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { RateBadge } from "@/components/attendance/summary";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TextField } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { displayLoginId } from "@/lib/auth/login-id";
import { todayIn } from "@/lib/attendance";
import { formatDate, fullName } from "@/lib/format";
import { formatGrade } from "@/lib/grades/compute";
import { ordinal } from "@/lib/grades/report-card";
import { getCurrentAcademicYear } from "@/services/academics";
import { getStudentAttendance } from "@/services/attendance";
import { requireCapability } from "@/services/auth";
import { listGuardianLinks } from "@/services/classes";
import { listIssuedCards } from "@/services/report-cards";
import { getSchoolProfile, getSchoolSettings } from "@/services/school";
import { classesTaughtBy, getStudentRecord } from "@/services/students";
import { saveStudentDetails } from "../actions";

export const metadata: Metadata = { title: "Student" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function age(dob: string | null | undefined): string | null {
  if (!dob) return null;
  const d = new Date(`${dob}T00:00:00Z`);
  const now = new Date();
  let years = now.getUTCFullYear() - d.getUTCFullYear();
  if (now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) years -= 1;
  return `${years} years`;
}

export default async function StudentPage({ params }: PageProps<"/students/[id]">) {
  const { school, profile } = await requireCapability("classes.view", "/students");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const isAdmin = profile.role === "school_admin";

  const [student, year, schoolProfile, settings] = await Promise.all([
    getStudentRecord(school.id, id),
    getCurrentAcademicYear(school.id),
    getSchoolProfile(school.id),
    getSchoolSettings(school.id),
  ]);
  if (!student) notFound();
  if (!isAdmin) {
    const taught = year ? await classesTaughtBy(school.id, year.id, profile.id) : [];
    if (!student.enrollments.some((e) => taught.includes(e.classId))) notFound();
  }

  const current = student.enrollments.find((e) => e.isCurrent) ?? null;
  const today = todayIn(schoolProfile?.timezone ?? "Africa/Monrovia");
  const [guardians, cards, attendance] = await Promise.all([
    listGuardianLinks(school.id, student.id, "parents"),
    listIssuedCards(school.id, { studentIds: [student.id] }),
    year ? getStudentAttendance(school.id, student.id, year.starts_on, today < year.ends_on ? today : year.ends_on) : null,
  ]);
  const d = student.details;
  const name = fullName({ first_name: student.firstName, middle_name: student.middleName, last_name: student.lastName });
  const latestCard = cards[0] ?? null;
  const threshold = Number(settings?.attendance_threshold ?? 75);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/students" className="text-sm font-medium text-muted hover:text-foreground">
          ← Students
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{name}</h1>
          {current ? <Badge tone="brand">Class {current.className}</Badge> : <Badge>Not in a class</Badge>}
          {student.status !== "active" ? <Badge tone="warning">{student.status}</Badge> : null}
        </div>
        <p className="mt-1 text-sm text-muted">
          {d?.admission_number ? `Admission no. ${d.admission_number} · ` : ""}
          <span className="font-mono">{displayLoginId(student, school.code)}</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Class this year">{current ? current.className : "—"}</Stat>
        <Stat label={`Attendance (${year?.name ?? "this year"})`}>
          {attendance ? <RateBadge summary={attendance.summary} threshold={threshold} /> : "—"}
          {attendance && attendance.summary.days ? (
            <span className="mt-1 block text-xs text-muted">
              {attendance.summary.absent} absent · {attendance.summary.late} late · {attendance.summary.excused} excused
            </span>
          ) : null}
        </Stat>
        <Stat label="Latest report card">
          {latestCard ? (
            <>
              {formatGrade(latestCard.average)} average
              {latestCard.rank ? <span className="block text-xs text-muted">{ordinal(latestCard.rank)} of {latestCard.classSize} · {latestCard.data.term.name}</span> : null}
            </>
          ) : (
            "Not issued yet"
          )}
        </Stat>
      </div>

      <Card aria-labelledby="record-title">
        <CardHeader
          titleId="record-title"
          title="School record"
          action={
            isAdmin ? (
              <Link href={`/users/${student.id}`} className={buttonClasses("secondary", "sm")}>
                Login & parents
              </Link>
            ) : null
          }
        />
        <CardBody>
          {isAdmin ? (
            <ActionForm action={saveStudentDetails} aria-label="School record">
              <input type="hidden" name="profile_id" value={student.id} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <TextField id="admission_number" name="admission_number" label="Admission number" defaultValue={d?.admission_number ?? ""} maxLength={30} />
                <TextField id="admission_date" name="admission_date" type="date" label="Date admitted" defaultValue={d?.admission_date ?? ""} />
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
                <TextField id="date_of_birth" name="date_of_birth" type="date" label="Date of birth" defaultValue={d?.date_of_birth ?? ""} max={today} />
                <TextField id="place_of_birth" name="place_of_birth" label="Place of birth" defaultValue={d?.place_of_birth ?? ""} maxLength={100} />
                <TextField id="nationality" name="nationality" label="Nationality" defaultValue={d?.nationality ?? ""} maxLength={60} placeholder="e.g. Liberian" />
                <TextField id="home_address" name="home_address" label="Home address" defaultValue={d?.home_address ?? ""} maxLength={300} />
                <TextField id="previous_school" name="previous_school" label="Previous school" defaultValue={d?.previous_school ?? ""} maxLength={150} />
                <TextField id="emergency_contact_name" name="emergency_contact_name" label="Emergency contact" defaultValue={d?.emergency_contact_name ?? ""} maxLength={120} />
                <TextField id="emergency_contact_phone" name="emergency_contact_phone" type="tel" label="Emergency phone" defaultValue={d?.emergency_contact_phone ?? ""} maxLength={30} />
              </div>
              <SubmitButton loadingText="Saving…">Save record</SubmitButton>
            </ActionForm>
          ) : (
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Row label="Admission number" value={d?.admission_number} />
              <Row label="Date admitted" value={d?.admission_date ? formatDate(d.admission_date) : null} />
              <Row label="Gender" value={d?.gender ? d.gender[0].toUpperCase() + d.gender.slice(1) : null} />
              <Row label="Date of birth" value={d?.date_of_birth ? `${formatDate(d.date_of_birth)} (${age(d.date_of_birth)})` : null} />
              <Row label="Nationality" value={d?.nationality} />
              <Row label="Emergency contact" value={[d?.emergency_contact_name, d?.emergency_contact_phone].filter(Boolean).join(" · ") || null} />
            </dl>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card aria-labelledby="guardians-title">
          <CardHeader titleId="guardians-title" title="Parents & guardians" />
          {guardians.length === 0 ? (
            <EmptyState title="No parent linked" description={isAdmin ? "Link a parent from the student’s account page." : undefined} />
          ) : (
            <ul className="divide-y divide-border">
              {guardians.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span>
                    <span className="font-medium text-foreground">{g.person ? fullName(g.person) : "—"}</span>
                    <span className="ml-2 capitalize text-muted">{g.relationship}</span>
                  </span>
                  {g.is_primary ? <Badge tone="brand">Primary</Badge> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card aria-labelledby="history-title">
          <CardHeader titleId="history-title" title="Classes" />
          {student.enrollments.length === 0 ? (
            <EmptyState title="Never enrolled in a class" />
          ) : (
            <ul className="divide-y divide-border">
              {student.enrollments.map((e) => (
                <li key={`${e.yearId}-${e.classId}`} className="flex items-center justify-between gap-2 px-5 py-3 text-sm">
                  <Link href={`/classes/${e.classId}`} className="font-medium text-brand underline-offset-4 hover:underline">
                    Class {e.className}
                  </Link>
                  <span className="text-muted">
                    {e.yearName}
                    {e.isCurrent ? " (current)" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {cards.length ? (
        <Card aria-labelledby="cards-title">
          <CardHeader titleId="cards-title" title="Report cards" />
          <ul className="divide-y divide-border">
            {cards.map((c) => (
              <li key={c.id}>
                <Link href={`/report-cards/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-surface-muted">
                  <span className="font-medium text-foreground">
                    {c.data.term.name} · {c.data.yearName}
                  </span>
                  <span className="text-muted">
                    {formatGrade(c.average)} average{c.rank ? ` · ${ordinal(c.rank)} of ${c.classSize}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
      <p className="text-xs text-muted">{label}</p>
      <div className="mt-1 text-lg font-semibold text-foreground">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium text-foreground">{value || "—"}</dd>
    </div>
  );
}
