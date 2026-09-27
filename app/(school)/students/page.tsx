import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { displayLoginId } from "@/lib/auth/login-id";
import { cn } from "@/lib/cn";
import { getCurrentAcademicYear } from "@/services/academics";
import { requireCapability } from "@/services/auth";
import { listClasses } from "@/services/classes";
import { classesTaughtBy, listStudents } from "@/services/students";
import { generateAdmissionNumbers } from "./actions";

export const metadata: Metadata = { title: "Students" };

export default async function StudentsPage({ searchParams }: PageProps<"/students">) {
  const { school, profile } = await requireCapability("classes.view", "/students");
  const params = await searchParams;
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const isAdmin = profile.role === "school_admin";
  const year = await getCurrentAcademicYear(school.id);

  const allClasses = year ? await listClasses(school.id, year.id) : [];
  const taught = !isAdmin && year ? await classesTaughtBy(school.id, year.id, profile.id) : undefined;
  const classes = taught ? allClasses.filter((c) => taught.includes(c.id)) : allClasses;

  const filter = pick(params.class);
  const q = pick(params.q).slice(0, 60);
  const classId = classes.some((c) => c.id === filter) ? filter : null;
  const unassigned = isAdmin && filter === "none";

  const students = await listStudents(school.id, {
    yearId: year?.id ?? null,
    classId,
    unassigned,
    search: q,
    onlyClassIds: taught,
  });
  const missingNumbers = isAdmin ? students.filter((s) => !s.admissionNumber).length : 0;
  const href = (c: string) => {
    const sp = new URLSearchParams();
    if (c) sp.set("class", c);
    if (q) sp.set("q", q);
    const s = sp.toString();
    return s ? `/students?${s}` : "/students";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Students</h1>
          <p className="mt-1 text-sm text-muted">
            {isAdmin ? "Every student at your school, with their class and school record." : "Students in the classes you teach."}
          </p>
        </div>
        {isAdmin ? (
          <div className="flex flex-wrap gap-2">
            <Link href="/users/import" className={buttonClasses("secondary")}>
              Import students
            </Link>
            <Link href="/users/new" className={buttonClasses("primary")}>
              Add student
            </Link>
          </div>
        ) : null}
      </div>

      <nav aria-label="Filter by class" className="flex flex-wrap gap-2">
        <Pill href={href("")} active={!classId && !unassigned}>
          All
        </Pill>
        {classes.map((c) => (
          <Pill key={c.id} href={href(c.id)} active={c.id === classId}>
            {c.name}
          </Pill>
        ))}
        {isAdmin ? (
          <Pill href={href("none")} active={unassigned}>
            Not in a class
          </Pill>
        ) : null}
      </nav>

      <Card>
        <form method="get" role="search" className="flex flex-wrap gap-2 border-b border-border p-4">
          {filter ? <input type="hidden" name="class" value={filter} /> : null}
          <label htmlFor="q" className="sr-only">
            Search students
          </label>
          <Input id="q" name="q" type="search" defaultValue={q} placeholder="Search name, username or admission number" className="max-w-md" />
          <button type="submit" className={buttonClasses("secondary")}>
            Search
          </button>
        </form>
        <CardHeader
          title={`${students.length} student${students.length === 1 ? "" : "s"}`}
          description={missingNumbers ? `${missingNumbers} without an admission number.` : undefined}
          action={
            missingNumbers ? (
              <ActionForm action={generateAdmissionNumbers} compact>
                <SubmitButton size="sm" variant="secondary" loadingText="Assigning…">
                  Assign admission numbers
                </SubmitButton>
              </ActionForm>
            ) : null
          }
        />
        {students.length === 0 ? (
          <EmptyState
            icon="students"
            title={q ? "No students match your search" : "No students here yet"}
            description={isAdmin ? "Add students one by one or import a spreadsheet." : "Students appear here once they are enrolled in a class you teach."}
          />
        ) : (
          <Table caption="Students">
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Admission no.</TH>
                <TH>Class{year ? ` (${year.name})` : ""}</TH>
                <TH>Gender</TH>
                <TH>Signs in with</TH>
              </TR>
            </THead>
            <TBody>
              {students.map((s) => (
                <TR key={s.id}>
                  <TD className="font-medium">
                    <Link href={`/students/${s.id}`} className="text-brand underline-offset-4 hover:underline">
                      {s.lastName}, {s.firstName}
                      {s.middleName ? ` ${s.middleName}` : ""}
                    </Link>
                    {s.status !== "active" ? <span className="ml-2 text-xs text-muted">({s.status})</span> : null}
                  </TD>
                  <TD className="font-mono text-xs">{s.admissionNumber ?? <span className="text-subtle">—</span>}</TD>
                  <TD>{s.className ?? <span className="text-subtle">Not in a class</span>}</TD>
                  <TD className="capitalize">{s.gender ?? <span className="text-subtle">—</span>}</TD>
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

function Pill({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium",
        active ? "border-brand bg-brand text-brand-foreground" : "border-border hover:bg-surface-muted",
      )}
    >
      {children}
    </Link>
  );
}
