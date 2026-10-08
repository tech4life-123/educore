"use client";

import {
  createProviderAccountAction,
  rotateProviderSecretAction,
  sendTestPaymentAction,
  setProviderStatusAction,
} from "@/app/(school)/finance/providers/actions";
import { ActionForm } from "@/components/ui/action-form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { TextField } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";

export function CreateProviderForm({ options }: { options: { value: string; label: string }[] }) {
  return (
    <ActionForm action={createProviderAccountAction} resetOnSuccess aria-label="Add a payment provider account" className="grid gap-4 sm:grid-cols-2">
      <SelectField id="provider" name="provider" label="Provider" options={options} required />
      <SelectField
        id="environment"
        name="environment"
        label="Environment"
        hint="Start with sandbox. Live stays unavailable until that provider’s integration is finished and certified."
        options={[
          { value: "sandbox", label: "Sandbox (testing)" },
          { value: "live", label: "Live (real money)" },
        ]}
        defaultValue="sandbox"
      />
      <div className="sm:col-span-2">
        <TextField id="label" name="label" label="Name" hint="Only you see this, e.g. “Orange Money — main shortcode”." maxLength={80} required />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton loadingText="Creating…">Create account</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ProviderAccountActions({ accountId, status, sandboxTest = false }: { accountId: string; status: "active" | "disabled"; sandboxTest?: boolean }) {
  return (
    <div className="space-y-4">
    <div className="flex flex-wrap items-start gap-4">
      <ActionForm action={setProviderStatusAction} compact aria-label="Switch account on or off">
        <input type="hidden" name="account_id" value={accountId} />
        <input type="hidden" name="status" value={status === "active" ? "disabled" : "active"} />
        <SubmitButton variant="secondary" size="sm" loadingText="Saving…">
          {status === "active" ? "Switch off" : "Switch on"}
        </SubmitButton>
      </ActionForm>
      <ActionForm action={rotateProviderSecretAction} aria-label="Change the signing secret" className="max-w-xl">
        <input type="hidden" name="account_id" value={accountId} />
        <ConfirmButton
          question="Change the secret? The provider must be updated too."
          confirmLabel="Yes, change it"
          pendingLabel="Changing…"
        >
          Change signing secret
        </ConfirmButton>
      </ActionForm>
    </div>
      {sandboxTest && status === "active" ? (
        <ActionForm action={sendTestPaymentAction} aria-label="Send a test payment" className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-3">
          <input type="hidden" name="account_id" value={accountId} />
          <TextField id={`amount-${accountId}`} name="amount" label="Test amount" defaultValue="25.50" inputMode="decimal" />
          <SelectField id={`currency-${accountId}`} name="currency" label="Currency" options={[{ value: "USD", label: "USD" }, { value: "LRD", label: "LRD" }]} defaultValue="USD" />
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" name="twice" className="h-4 w-4" />
            <span>Send it twice (tests duplicates)</span>
          </label>
          <div className="sm:col-span-3">
            <SubmitButton variant="secondary" size="sm" loadingText="Sending…">Send test payment</SubmitButton>
          </div>
        </ActionForm>
      ) : null}
    </div>
  );
}
