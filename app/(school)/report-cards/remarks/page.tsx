import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatGrade } from "@/lib/grades/compute";
import { requireCapability } from "@/services/auth";
import { getClassContext, getRemarks, listClassStudents, listIssuedCards } from "@/services/report-cards";
import { saveRemarks } from "../actions";

export const metadata: Metadata = { title: "Report card remarks" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RemarksPage({ searchParams }: PageProps<"/report-cards/remarks">) {
  const { school, profile } = await requireCapability("grades.enter", "/report-cards");
  const params = await searchParams;
  const classId = typeof params.class === "string" && UUID.test(params.class) ? params.class : null;
  const termId = typeof params.term === "string" && UUID.test(params.term) ? params.term : null;
  if (!classId || !termId) notFound();

  const ctx = await getClassContext(school.id, classId);
  const term = ctx?.terms.find((t) => t.id === termId);
  if (!ctx || !term) notFound();
  const canWrite = profile.role === "school_admin" || ctx.homeroomTeacherId === profile.id;
  if (!canWrite) notFound();

  const [students, remarks, cards] = await Promise.all([
    listClassStudents(school.id, classId, school.code),
    getRemarks(school.id, termId, { classId }),
    listIssuedCards(school.id, { classId, termId }),
  ]);
  const cardOf = new Map(cards.map((c) => [c.studentId, c]));
  const back = `/report-cards?class=${classId}&term=${termId}`;

  return (
    <div className="space-y-6">
      <div>
        <Link href={back} className="text-sm font-medium text-muted hover:text-foreground">
          ← Report cards · Class {ctx.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Remarks · {term.name}</h1>
        <p className="mt-1 text-sm text-muted">
          One short comment per student, printed on the report card. Students and parents see it once the card is issued.
        </p>
      </div>

      <Card aria-labelledby="remarks-title">
        <CardHeader titleId="remarks-title" title={`Class ${ctx.name}`} description="Leave a box empty to have no remark." />
        {students.length === 0 ? (
          <EmptyState icon="students" title="No students in this class" />
        ) : (
          <ActionForm action={saveRemarks} aria-label="Remarks">
            <input type="hidden" name="class_id" value={classId} />
            <input type="hidden" name="term_id" value={termId} />
            <ul className="divide-y divide-border">
              {students.map((s) => {
                const card = cardOf.get(s.id);
                return (
                  <li key={s.id} className="grid gap-2 px-5 py-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
                    <label htmlFor={`r-${s.id}`} className="text-sm">
                      <span className="block font-medium text-foreground">{s.name}</span>
                      <span className="text-xs text-muted">
                        {card ? `Average ${formatGrade(card.average)}${card.rank ? ` · rank ${card.rank}/${card.classSize}` : ""}` : "Card not issued yet"}
                      </span>
                    </label>
                    <textarea
                      id={`r-${s.id}`}
                      name={`remark:${s.id}`}
                      rows={2}
                      maxLength={600}
                      defaultValue={remarks.get(s.id) ?? ""}
                      placeholder="e.g. A hard-working student. Keep improving in Mathematics."
                      className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-foreground sm:text-sm"
                    />
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4">
              <SubmitButton loadingText="Saving…">Save remarks</SubmitButton>
              <Link href={back} className="text-sm font-medium text-muted hover:text-foreground">
                Back
              </Link>
            </div>
          </ActionForm>
        )}
      </Card>
      <Alert tone="info">Remarks can be changed any time; the card always shows the latest remark.</Alert>
    </div>
  );
}
