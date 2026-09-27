import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, TextField } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireCapability } from "@/services/auth";
import { getGradingSettings, listCategories } from "@/services/grades";
import { addCategory, updateCategory, updateExamWeight } from "../actions";

export const metadata: Metadata = { title: "Grading" };

export default async function GradingSettingsPage() {
  const { school } = await requireCapability("school.manage", "/academics/grading");
  const [categories, settings] = await Promise.all([listCategories(school.id), getGradingSettings(school.id)]);
  const activeTotal = categories.filter((c) => c.is_active).reduce((n, c) => n + c.weight, 0);

  return (
    <div className="space-y-6">
      <Card aria-labelledby="exam-title">
        <CardHeader
          titleId="exam-title"
          title="Semester average"
          description="Liberian standard: semester average = (average of the three marking periods + exam) ÷ 2, i.e. an exam weight of 50%."
        />
        <CardBody>
          <ActionForm action={updateExamWeight} aria-label="Exam weight">
            <div className="flex flex-wrap items-end gap-3">
              <TextField
                id="exam-weight"
                name="weight"
                label="Exam weight (%)"
                inputMode="decimal"
                defaultValue={String(settings.examWeight)}
                className="w-32"
                hint={`Marking periods count for the other ${100 - settings.examWeight}%.`}
              />
              <SubmitButton variant="secondary" loadingText="Saving…" className="mb-6 h-11">
                Save
              </SubmitButton>
            </div>
          </ActionForm>
        </CardBody>
      </Card>

      <Card aria-labelledby="categories-title">
        <CardHeader
          titleId="categories-title"
          title="Assessment categories"
          description="A marking-period grade is the weighted average of these categories. Only categories with scores in that period count, so weights are rescaled automatically."
        />
        {Math.round(activeTotal) !== 100 ? (
          <CardBody className="border-b border-border">
            <Alert tone="info" title={`Active weights add up to ${activeTotal}%`}>
              That’s fine — weights are relative — but most schools keep them at 100% so they are easy to explain.
            </Alert>
          </CardBody>
        ) : null}
        <ul className="divide-y divide-border">
          {categories.map((c) => (
            <li key={c.id} className="px-5 py-3">
              <ActionForm action={updateCategory} compact aria-label={`Edit ${c.name}`}>
                <input type="hidden" name="id" value={c.id} />
                <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto_auto]">
                  <div>
                    <label htmlFor={`cn-${c.id}`} className="sr-only">
                      Name
                    </label>
                    <Input id={`cn-${c.id}`} name="name" defaultValue={c.name} maxLength={40} required />
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor={`cw-${c.id}`} className="sr-only">
                      Weight for {c.name}
                    </label>
                    <Input id={`cw-${c.id}`} name="weight" inputMode="decimal" defaultValue={String(c.weight)} className="text-right tabular-nums" />
                    <span className="text-sm text-muted">%</span>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="is_active" defaultChecked={c.is_active} className="h-5 w-5 accent-[var(--brand)]" />
                    Active
                  </label>
                  <SubmitButton variant="secondary" size="sm" loadingText="Saving…">
                    Save
                  </SubmitButton>
                </div>
              </ActionForm>
            </li>
          ))}
        </ul>
        <CardBody className="border-t border-border">
          <ActionForm action={addCategory} resetOnSuccess aria-label="Add a category">
            <div className="grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
              <TextField id="new-cat" name="name" label="New category" maxLength={40} placeholder="e.g. Lab work" />
              <TextField id="new-weight" name="weight" label="Weight (%)" inputMode="decimal" defaultValue="10" />
              <SubmitButton loadingText="Adding…" className="h-11">
                Add category
              </SubmitButton>
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}
