"use client";

import { assignTransactionAction, logTransactionAction } from "@/app/(school)/finance/actions";
import { ActionForm } from "@/components/ui/action-form";
import { TextField } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { CURRENCIES } from "@/lib/finance";

const SOURCES = [
  { value: "bank", label: "Bank" },
  { value: "orange_money", label: "Orange Money" },
  { value: "mtn_momo", label: "MTN MoMo" },
  { value: "other", label: "Other" },
];

/** Log one line from a bank or mobile-money statement. It changes no balance until it is matched. */
export function LogTransactionForm({ defaultCurrency, today }: { defaultCurrency: string; today: string }) {
  return (
    <ActionForm action={logTransactionAction} resetOnSuccess className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField id="method" name="method" label="Arrived via" required options={SOURCES} defaultValue="bank" />
        <TextField id="amount" name="amount" label="Amount" required inputMode="decimal" placeholder="0.00" />
        <SelectField id="currency" name="currency" label="Currency" required options={CURRENCIES.map((c) => ({ value: c, label: c }))} defaultValue={defaultCurrency} />
        <TextField id="reference" name="reference" label="Reference" required maxLength={100} hint="Bank reference or mobile-money transaction ID." />
        <TextField id="transaction_date" name="transaction_date" type="date" label="Statement date" required defaultValue={today} />
        <TextField id="payer_name" name="payer_name" label="Sender name (optional)" maxLength={120} />
        <TextField id="payer_phone" name="payer_phone" label="Sender phone (optional)" maxLength={30} />
        <TextField id="notes" name="notes" label="Notes (optional)" maxLength={300} />
      </div>
      <SubmitButton loadingText="Logging…">Log transaction</SubmitButton>
    </ActionForm>
  );
}

/** Create a payment from an unmatched transaction by assigning it to a student (and optionally an invoice). */
export function AssignTransactionForm({
  transactionId,
  students,
  invoices,
  studentId,
}: {
  transactionId: string;
  students: { value: string; label: string }[];
  invoices: { value: string; label: string }[];
  studentId: string;
}) {
  return (
    <ActionForm action={assignTransactionAction} className="space-y-4">
      <input type="hidden" name="transaction_id" value={transactionId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="student_id" name="student_id" label="Student" required placeholder="Choose…" options={students} defaultValue={studentId} />
        <SelectField id="invoice_id" name="invoice_id" label="Invoice (optional)" placeholder="Not linked to an invoice" options={invoices} />
        <TextField id="note" name="note" label="Note (optional)" maxLength={300} />
      </div>
      <p className="text-xs text-subtle">This records a payment for the student and confirms it, because the money is already on the statement.</p>
      <SubmitButton loadingText="Assigning…">Assign and post</SubmitButton>
    </ActionForm>
  );
}
