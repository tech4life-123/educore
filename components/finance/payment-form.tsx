"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { TextField } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { CURRENCIES, MANUAL_METHOD_OPTIONS } from "@/lib/finance";
import type { PaymentFormState } from "@/app/(school)/finance/actions";

export function PaymentForm({
  action,
  students,
  invoices,
  defaults,
  idempotencyKey,
}: {
  action: (state: PaymentFormState, formData: FormData) => Promise<PaymentFormState>;
  students: { value: string; label: string }[];
  /** Open invoices for the chosen student, with their currency (shown in the label). */
  invoices: { value: string; label: string; currency: string; balance: string }[];
  defaults: { studentId: string; invoiceId: string; currency: string; paidOn: string };
  idempotencyKey: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const v = state.values;
  const [method, setMethod] = useState(v?.method ?? "bank");
  const needsExplanation = method === "cash" || method === "other";

  return (
    <form action={formAction} noValidate className="space-y-5">
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="student_id" name="student_id" label="Student" required placeholder="Choose…" options={students} defaultValue={v?.student_id ?? defaults.studentId} />
        <SelectField
          id="invoice_id"
          name="invoice_id"
          label="Invoice (optional)"
          placeholder="Not linked to an invoice"
          options={invoices.map((i) => ({ value: i.value, label: `${i.label} — owes ${i.balance}` }))}
          defaultValue={v?.invoice_id ?? defaults.invoiceId}
          hint="Link it so the invoice shows as paid. The currency must match the invoice."
        />
        <TextField id="amount" name="amount" label="Amount" required inputMode="decimal" placeholder="0.00" defaultValue={v?.amount ?? ""} />
        <SelectField id="currency" name="currency" label="Currency" required options={CURRENCIES.map((c) => ({ value: c, label: c }))} defaultValue={v?.currency ?? defaults.currency} />
        <SelectField id="method" name="method" label="How was it paid?" required options={MANUAL_METHOD_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} value={method} onChange={(e) => setMethod(e.target.value)} />
        <TextField id="paid_on" name="paid_on" type="date" label="Date paid" required defaultValue={v?.paid_on ?? defaults.paidOn} />
        <TextField
          id="reference"
          name="reference"
          label="Reference"
          required
          maxLength={100}
          defaultValue={v?.reference ?? ""}
          hint="Receipt number, bank deposit slip or the mobile-money transaction ID."
        />
        <TextField id="payer_name" name="payer_name" label="Paid by (optional)" maxLength={120} defaultValue={v?.payer_name ?? ""} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="explanation" className="block text-sm font-medium text-foreground">
          Explanation{needsExplanation ? <span className="text-danger" aria-hidden="true"> *</span> : " (optional)"}
        </label>
        <textarea
          id="explanation"
          name="explanation"
          rows={2}
          maxLength={500}
          required={needsExplanation}
          defaultValue={v?.explanation ?? ""}
          className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-foreground sm:text-sm"
        />
        {needsExplanation ? <p className="text-xs text-subtle">Required for cash and other manual payments, e.g. “Paid in person at the bursar’s desk”.</p> : null}
      </div>
      <p className="text-xs text-subtle">
        Recording a payment does not change any balance. It stays <strong>Pending</strong> until a finance officer or administrator confirms it.
      </p>
      <SubmitButton loadingText="Recording…">Record payment</SubmitButton>
    </form>
  );
}
