import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import type { SetupCounts } from "@/services/classes";
import { cn } from "@/lib/cn";

interface Step {
  label: string;
  detail: string;
  done: boolean;
  href: string;
  cta: string;
}

/** Administrator's getting-started checklist, computed from real data. */
export function SetupChecklist({ counts }: { counts: SetupCounts }) {
  const steps: Step[] = [
    {
      label: "Add your logo and colours",
      detail: counts.hasLogo ? "Logo uploaded." : "Upload your school logo and set brand colours.",
      done: counts.hasLogo,
      href: "/settings",
      cta: "Open settings",
    },
    {
      label: "Create the academic year",
      detail: counts.currentYear ? `Current year: ${counts.currentYear.name}.` : "Two semesters, each with 3 marking periods and an exam.",
      done: Boolean(counts.currentYear),
      href: "/academics",
      cta: "Set up years",
    },
    {
      label: "Review grade levels and subjects",
      detail: `${counts.gradeLevels} grade level${counts.gradeLevels === 1 ? "" : "s"}, ${counts.subjects} active subject${counts.subjects === 1 ? "" : "s"}.`,
      done: counts.gradeLevels > 0 && counts.subjects > 0,
      href: counts.subjects > 0 ? "/academics/grades" : "/academics/subjects",
      cta: counts.subjects > 0 ? "Review" : "Add subjects",
    },
    {
      label: "Add teachers and students",
      detail: `${counts.teachers} teacher${counts.teachers === 1 ? "" : "s"}, ${counts.students} active student${counts.students === 1 ? "" : "s"}.`,
      done: counts.teachers > 0 && counts.students > 0,
      href: "/users/import",
      cta: "Import users",
    },
    {
      label: "Create classes",
      detail: `${counts.classes} class${counts.classes === 1 ? "" : "es"} this year.`,
      done: counts.classes > 0,
      href: "/classes",
      cta: "Open classes",
    },
    {
      label: "Enrol students in classes",
      detail: `${counts.enrolled} of ${counts.students} active students enrolled this year.`,
      done: counts.students > 0 && counts.enrolled >= counts.students,
      href: "/classes",
      cta: "Enrol",
    },
    {
      label: "Link parents to their children",
      detail:
        counts.parents === 0
          ? "No parent accounts yet (optional)."
          : `${counts.linkedStudents} student${counts.linkedStudents === 1 ? " has" : "s have"} a linked parent.`,
      done: counts.parents > 0 && counts.linkedStudents > 0,
      href: "/users?role=parent",
      cta: "Open parents",
    },
  ];
  const completed = steps.filter((s) => s.done).length;
  if (completed === steps.length) return null;

  return (
    <Card aria-labelledby="setup-title">
      <CardHeader
        titleId="setup-title"
        title="Set up your school"
        description={`${completed} of ${steps.length} steps done`}
        action={
          <div className="h-2 w-32 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={completed} aria-label="Setup progress">
            <div className="h-full bg-brand" style={{ width: `${(completed / steps.length) * 100}%` }} />
          </div>
        }
      />
      <ol className="divide-y divide-border">
        {steps.map((step) => {
          const Icon = step.done ? Icons.check : Icons.info;
          return (
            <li key={step.label} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full",
                  step.done ? "bg-success-soft text-success" : "bg-surface-muted text-muted",
                )}
              >
                <Icon width={16} height={16} />
                <span className="sr-only">{step.done ? "Done:" : "To do:"}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-medium", step.done ? "text-muted" : "text-foreground")}>{step.label}</p>
                <p className="text-xs text-muted">{step.detail}</p>
              </div>
              {!step.done ? (
                <Link href={step.href} className="text-sm font-medium text-brand underline-offset-4 hover:underline">
                  {step.cta}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
