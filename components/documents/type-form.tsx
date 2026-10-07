"use client";

import { saveDocumentTypeAction, seedDocumentTypesAction } from "@/app/(school)/documents/actions";
import { ActionForm } from "@/components/ui/action-form";
import { TextField } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";

export interface TypeFormValues {
  id: string;
  code: string;
  name: string;
  description: string;
  fee: string;
  currency: string;
  requiresPayment: boolean;
  requiresClearance: boolean;
  requiresApproval: boolean;
  allowOverride: boolean;
  admissionsHandled: boolean;
  active: boolean;
}

export const EMPTY_TYPE: TypeFormValues = {
  id: "",
  code: "",
  name: "",
  description: "",
  fee: "",
  currency: "",
  requiresPayment: false,
  requiresClearance: false,
  requiresApproval: false,
  allowOverride: false,
  admissionsHandled: false,
  active: true,
};

function Check({ name, label, hint, defaultChecked }: { name: string; label: string; hint?: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 h-4 w-4" />
      <span>
        <span className="font-medium text-foreground">{label}</span>
        {hint ? <span className="block text-xs text-subtle">{hint}</span> : null}
      </span>
    </label>
  );
}

/** One document type: its fee and the rules that gate it. Used for editing and for adding a custom document. */
export function DocumentTypeForm({ values, defaultCurrency }: { values: TypeFormValues; defaultCurrency: string }) {
  const isNew = !values.id;
  return (
    <ActionForm action={saveDocumentTypeAction} resetOnSuccess={isNew} className="space-y-4">
      <input type="hidden" name="id" value={values.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id={`name-${values.id || "new"}`} name="name" label="Name" required maxLength={80} defaultValue={values.name} />
        {isNew ? (
          <TextField id="code-new" name="code" label="Code" required maxLength={40} defaultValue={values.code} hint="Lower-case, e.g. enrolment_proof. Cannot be changed later." />
        ) : (
          <input type="hidden" name="code" value={values.code} />
        )}
        <TextField id={`fee-${values.id || "new"}`} name="fee_amount" label="Fee" inputMode="decimal" placeholder="0.00" defaultValue={values.fee} hint="Leave blank for free." />
        <SelectField
          id={`cur-${values.id || "new"}`}
          name="currency"
          label="Fee currency"
          options={[{ value: "USD", label: "USD" }, { value: "LRD", label: "LRD" }]}
          placeholder={`School default (${defaultCurrency})`}
          defaultValue={values.currency}
        />
        <TextField id={`desc-${values.id || "new"}`} name="description" label="Description (optional)" maxLength={300} defaultValue={values.description} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Check name="requires_payment" label="Payment required" hint="The fee must be paid before the document can be generated." defaultChecked={values.requiresPayment} />
        <Check name="requires_clearance" label="Financial clearance required" hint="The student must owe the school nothing." defaultChecked={values.requiresClearance} />
        <Check name="requires_approval" label="Approval required" hint="A staff member must approve each request." defaultChecked={values.requiresApproval} />
        <Check name="allow_override" label="Administrator may override" hint="Only for payment/clearance; every override needs a reason and is audited." defaultChecked={values.allowOverride} />
        <Check name="admissions_handled" label="Handled by admissions officers" hint="Admissions officers can only process documents with this on." defaultChecked={values.admissionsHandled} />
        <Check name="active" label="Available to request" defaultChecked={values.active} />
      </div>
      <SubmitButton loadingText="Saving…">{isNew ? "Add document" : "Save"}</SubmitButton>
    </ActionForm>
  );
}

export function SeedTypesButton() {
  return (
    <ActionForm action={seedDocumentTypesAction} compact aria-label="Add the standard documents">
      <SubmitButton loadingText="Adding…">Add the standard documents</SubmitButton>
    </ActionForm>
  );
}
