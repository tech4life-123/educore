import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, TextField } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { listGradeLevels, STAGE_LABELS } from "@/services/academics";
import { requireCapability } from "@/services/auth";
import { addGradeLevel, deleteGradeLevel, moveGradeLevel, updateGradeLevel } from "../actions";

export const metadata: Metadata = { title: "Grade levels" };

const STAGE_OPTIONS = Object.entries(STAGE_LABELS).map(([value, label]) => ({ value, label }));

export default async function GradeLevelsPage() {
  const { school } = await requireCapability("school.manage", "/academics/grades");
  const grades = await listGradeLevels(school.id);

  return (
    <div className="space-y-6">
      <Card aria-labelledby="grades-title">
        <CardHeader
          titleId="grades-title"
          title="Grade levels"
          description="In order from youngest to oldest. Rename them to match your school (e.g. “K-1” or “10th Grade”)."
        />
        {grades.length === 0 ? (
          <EmptyState title="No grade levels" description="Add your first grade level below." />
        ) : (
          <ol className="divide-y divide-border">
            {grades.map((grade, index) => (
              <li key={grade.id} className="flex flex-wrap items-end gap-3 px-5 py-3">
                <span className="w-6 pb-3 text-right text-sm tabular-nums text-subtle" aria-hidden="true">
                  {index + 1}
                </span>
                <ActionForm action={updateGradeLevel} compact className="min-w-0 flex-1" aria-label={`Edit ${grade.name}`}>
                  <input type="hidden" name="id" value={grade.id} />
                  <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
                    <div>
                      <label htmlFor={`g-${grade.id}`} className="sr-only">
                        Name
                      </label>
                      <Input id={`g-${grade.id}`} name="name" defaultValue={grade.name} maxLength={40} required />
                    </div>
                    <div>
                      <label htmlFor={`st-${grade.id}`} className="sr-only">
                        Stage
                      </label>
                      <select
                        id={`st-${grade.id}`}
                        name="stage"
                        defaultValue={grade.stage}
                        className="block h-11 w-full rounded-lg border border-border bg-surface px-3 text-base sm:text-sm"
                      >
                        {STAGE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <SubmitButton variant="secondary" loadingText="Saving…" className="h-11">
                      Save
                    </SubmitButton>
                  </div>
                </ActionForm>
                <div className="flex items-center gap-1 pb-1">
                  <MoveButton id={grade.id} direction="up" disabled={index === 0} name={grade.name} />
                  <MoveButton id={grade.id} direction="down" disabled={index === grades.length - 1} name={grade.name} />
                  <ActionForm action={deleteGradeLevel} compact>
                    <input type="hidden" name="id" value={grade.id} />
                    <ConfirmButton question={`Remove ${grade.name}?`}>Remove</ConfirmButton>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card aria-labelledby="add-grade-title">
        <CardHeader titleId="add-grade-title" title="Add a grade level" description="New grade levels are added at the end of the list." />
        <CardBody>
          <ActionForm action={addGradeLevel} resetOnSuccess>
            <div className="grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_14rem_auto]">
              <TextField id="new-grade" name="name" label="Name" required maxLength={40} placeholder="e.g. Grade 13" />
              <SelectField id="new-stage" name="stage" label="Stage" options={STAGE_OPTIONS} defaultValue="senior_high" />
              <SubmitButton loadingText="Adding…" className="h-11">
                Add grade level
              </SubmitButton>
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}

function MoveButton({ id, direction, disabled, name }: { id: string; direction: "up" | "down"; disabled: boolean; name: string }) {
  if (disabled) {
    return (
      <Button variant="ghost" size="sm" disabled aria-label={`Move ${name} ${direction}`}>
        {direction === "up" ? "↑" : "↓"}
      </Button>
    );
  }
  return (
    <ActionForm action={moveGradeLevel} compact>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="direction" value={direction} />
      <SubmitButton variant="ghost" size="sm" aria-label={`Move ${name} ${direction}`}>
        {direction === "up" ? "↑" : "↓"}
      </SubmitButton>
    </ActionForm>
  );
}
