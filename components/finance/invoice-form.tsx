"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Input, TextField } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { CURRENCIES, FEE_TYPE_OPTIONS } from "@/lib/finance";
import type { InvoiceFormState } from "@/app/(school)/finance/actions";

export interface InvoiceLineDefault {
  feeItemId?: string;
  feeType: string;
  description: string;
  amount: string;
}

const ROWS = 6;

export function InvoiceForm({
  action,
  students,
  years,
  terms,
  defaults,
  lines,
}: {
  action: (state: InvoiceFormState, formData: FormData) => Promise<InvoiceFormState>;
  students: { value: string; label: string }[];
  years: { value: string; label: string }[];
  terms: { value: string; label: string }[];
  defaults: { studentId: string; yearId: string; termId: string; currency: string; dueDate: string };
  lines: InvoiceLineDefault[];
}) {
  const [state, formAction] = useActionState(action, {});
  const v = state.values;
  const rows = Array.from({ length: Math.max(ROWS, lines.length) }, (_, i) => lines[i]);

  return (
    <form action={formAction} noValidate className="space-y-5">
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="student_id" name="student_id" label="Student" required placeholder="Choose…" options={students} defaultValue={v?.student_id ?? defaults.studentId} />
        <SelectField
          id="currency"
          name="currency"
          label="Currency"
          required
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          defaultValue={v?.currency ?? defaults.currency}
          hint="An invoice has exactly one currency. There is no conversion."
        />
        <SelectField id="academic_year_id" name="academic_year_id" label="Academic year" required placeholder="Choose…" options={years} defaultValue={v?.academic_year_id ?? defaults.yearId} />
        <SelectField id="term_id" name="term_id" label="Term (optional)" placeholder="Whole year" options={terms} defaultValue={v?.term_id ?? defaults.termId} />
        <TextField id="due_date" name="due_date" type="date" label="Due date" required defaultValue={v?.due_date ?? defaults.dueDate} />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">Fee lines</legend>
        <p className="text-xs text-subtle">Leave unused rows blank. Amounts are fixed on the invoice once it is issued.</p>
        <div className="space-y-2">
          {rows.map((line, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[12rem_1fr_9rem]">
              <input type="hidden" name="line_fee_item_id" value={line?.feeItemId ?? ""} />
              <select
                name="line_type"
                aria-label={`Line ${i + 1} fee type`}
                defaultValue={line?.feeType ?? "tuition"}
                className="block h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-foreground sm:text-sm"
              >
                {FEE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <Input name="line_description" aria-label={`Line ${i + 1} description`} placeholder="Description (optional)" maxLength={200} defaultValue={line?.description ?? ""} />
              <Input name="line_amount" aria-label={`Line ${i + 1} amount`} inputMode="decimal" placeholder="0.00" defaultValue={line?.amount ?? ""} />
            </div>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="notes" className="block text-sm font-medium text-foreground">
          Notes (optional)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          maxLength={1000}
          defaultValue={v?.notes ?? ""}
          className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-foreground sm:text-sm"
        />
      </div>
      <SubmitButton loadingText="Creating…">Create draft invoice</SubmitButton>
    </form>
  );
}
