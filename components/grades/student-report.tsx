import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { formatGrade, isPassing, roundGrade, studentTermSummary, yearlyAverage } from "@/lib/grades/compute";
import type { StudentResults } from "@/services/grades";

/**
 * A student's published results for one academic year, laid out like a
 * Liberian report card: each semester shows three marking periods, the
 * semester exam and the semester average; the yearly average follows.
 */
export function StudentReport({ studentName, studentId, results }: { studentName: string; studentId: string; results: StudentResults }) {
  if (!results.className) {
    return (
      <Card>
        <EmptyState icon="grades" title={`${studentName} isn’t in a class for ${results.yearName}`} description="Grades appear here once the school enrols them in a class." />
      </Card>
    );
  }
  const anyPublished = Object.values(results.periodPublished).some(Boolean);
  const { passingScore, examWeight } = results.settings;

  const rows = results.subjects.map((subject) => {
    const assessments = results.assessments.filter((a) => a.class_subject_id === subject.classSubjectId);
    const terms = results.terms.map((term) =>
      studentTermSummary(term, studentId, assessments, results.scores, results.categories, examWeight),
    );
    return { subject, terms, yearly: results.terms.length ? yearlyAverage(terms.map((t) => t.average)) : null };
  });

  const Cell = ({ grade, strong = false }: { grade: number | null; strong?: boolean }) => {
    const pass = isPassing(grade, passingScore);
    return (
      <td className={cn("px-3 py-2.5 text-center tabular-nums", strong && "font-semibold", pass === false && "text-danger")}>
        {formatGrade(grade)}
        {pass === false ? <span className="sr-only"> (below passing)</span> : null}
      </td>
    );
  };

  const columnAverage = (values: (number | null)[]) => {
    const v = values.filter((x): x is number => x !== null).map(roundGrade);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };

  return (
    <div className="space-y-6">
      {!anyPublished ? (
        <Card>
          <EmptyState icon="grades" title="No grades published yet" description="Grades appear here after the school publishes each marking period." />
        </Card>
      ) : null}

      {results.terms.map((term, ti) => (
        <Card key={term.id} aria-labelledby={`term-${term.id}`}>
          <CardHeader titleId={`term-${term.id}`} title={term.name} description={`${studentName} · Class ${results.className} · ${results.yearName}`} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <caption className="sr-only">
                {term.name} grades for {studentName}
              </caption>
              <thead className="bg-surface-muted text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">Subject</th>
                  {term.grading_periods.map((p) => (
                    <th key={p.id} scope="col" className="px-3 py-3 text-center font-semibold">
                      {p.kind === "exam" ? "Exam" : p.name.replace(/ Period$/, "")}
                      {!results.periodPublished[p.id] ? <span className="block text-[10px] font-normal normal-case">not published</span> : null}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-3 text-center font-semibold">Sem. avg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(({ subject, terms }) => (
                  <tr key={subject.classSubjectId}>
                    <th scope="row" className="px-4 py-2.5 text-left font-medium text-foreground">{subject.name}</th>
                    {terms[ti].periods.map((p) => <Cell key={p.periodId} grade={p.grade} />)}
                    <Cell grade={terms[ti].average} strong />
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border bg-surface-muted/60">
                <tr>
                  <th scope="row" className="px-4 py-2.5 text-left font-semibold">Average</th>
                  {term.grading_periods.map((p, pi) => (
                    <Cell key={p.id} grade={columnAverage(rows.map((r) => r.terms[ti].periods[pi]?.grade ?? null))} strong />
                  ))}
                  <Cell grade={columnAverage(rows.map((r) => r.terms[ti].average))} strong />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      ))}

      {results.terms.length > 1 ? (
        <Card aria-labelledby="yearly-title">
          <CardHeader titleId="yearly-title" title="Yearly averages" description="Shown once both semester averages are complete." />
          <ul className="divide-y divide-border">
            {rows.map(({ subject, yearly }) => {
              const pass = isPassing(yearly, passingScore);
              return (
                <li key={subject.classSubjectId} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span className="font-medium text-foreground">{subject.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums font-semibold">{formatGrade(yearly)}</span>
                    {pass === null ? null : pass ? <Badge tone="success">Pass</Badge> : <Badge tone="danger">Below {passingScore}</Badge>}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <p className="text-xs text-muted">
        Passing score: {passingScore}. Grades below it are shown in red. Semester average = average of the marking periods ×{" "}
        {100 - examWeight}% + exam × {examWeight}%.
      </p>
    </div>
  );
}
