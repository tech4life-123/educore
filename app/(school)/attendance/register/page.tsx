import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { addDays, isIsoDate, todayIn, weekdayName } from "@/lib/attendance";
import { formatDate } from "@/lib/format";
import { getRegister } from "@/services/attendance";
import { requireCapability } from "@/services/auth";
import { getClassContext, listClassStudents } from "@/services/report-cards";
import { getSchoolProfile } from "@/services/school";
import { RegisterRows } from "@/components/attendance/register-rows";
import { saveRegister } from "../actions";
import { MarkAllPresent } from "../mark-all";

export const metadata: Metadata = { title: "Take the register" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RegisterPage({ searchParams }: PageProps<"/attendance/register">) {
  const { school, profile } = await requireCapability("grades.enter", "/attendance");
  const params = await searchParams;
  const classId = typeof params.class === "string" && UUID.test(params.class) ? params.class : null;
  if (!classId) notFound();
  const [ctx, schoolProfile] = await Promise.all([getClassContext(school.id, classId), getSchoolProfile(school.id)]);
  if (!ctx) notFound();
  if (profile.role !== "school_admin" && ctx.homeroomTeacherId !== profile.id) notFound();

  const today = todayIn(schoolProfile?.timezone ?? "Africa/Monrovia");
  const date = isIsoDate(params.date) && params.date <= today ? params.date : today;
  const [students, register] = await Promise.all([
    listClassStudents(school.id, classId, school.code),
    getRegister(school.id, classId, date),
  ]);
  const base = `/attendance/register?class=${classId}`;
  const isWeekend = ["Saturday", "Sunday"].includes(weekdayName(date));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/attendance?date=${date}`} className="text-sm font-medium text-muted hover:text-foreground">
          ← Attendance
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Register · Class {ctx.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {weekdayName(date)}, {formatDate(date)}
          {register ? ` · saved${register.takenBy ? ` by ${register.takenBy}` : ""}` : " · not taken yet"}
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-center gap-2 print:hidden">
        <input type="hidden" name="class" value={classId} />
        <Link
          href={`${base}&date=${addDays(date, -1)}`}
          className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-muted"
        >
          ← Previous day
        </Link>
        <label htmlFor="date" className="sr-only">
          Date
        </label>
        <Input id="date" name="date" type="date" defaultValue={date} max={today} className="h-10 w-44" />
        <button
          type="submit"
          className="h-10 rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-muted"
        >
          Go
        </button>
        {date < today ? (
          <Link
            href={`${base}&date=${addDays(date, 1)}`}
            className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-surface-muted"
          >
            Next day →
          </Link>
        ) : null}
        {date !== today ? (
          <Link
            href={`${base}&date=${today}`}
            className="text-sm font-medium text-brand underline-offset-4 hover:underline"
          >
            Today
          </Link>
        ) : null}
      </form>

      {isWeekend ? (
        <Alert tone="info" title="This is a weekend">
          Only take a register if school was in session.
        </Alert>
      ) : null}

      <Card aria-labelledby="register-title">
        <CardHeader
          titleId="register-title"
          title={`${students.length} student${students.length === 1 ? "" : "s"}`}
          description="Everyone starts as Present — change only the exceptions, then save."
        />
        {students.length === 0 ? (
          <EmptyState icon="students" title="No students in this class" />
        ) : (
          <ActionForm action={saveRegister} aria-label="Register">
            <input type="hidden" name="class_id" value={classId} />
            <input type="hidden" name="date" value={date} />
            <div className="flex justify-end px-5 pt-1">
              <MarkAllPresent />
            </div>
            <RegisterRows students={students} marks={register?.marks} />
            <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4">
              <SubmitButton loadingText="Saving…">{register ? "Update register" : "Save register"}</SubmitButton>
              <span className="text-xs text-muted">
                P = Present · A = Absent · L = Late · E = Excused (doesn’t count against the student)
              </span>
            </div>
          </ActionForm>
        )}
      </Card>
    </div>
  );
}
