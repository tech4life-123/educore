"use client";

import { useMemo, useState } from "react";
import { cancelPaymentPlanAction, createPaymentPlanAction } from "@/app/(school)/finance/actions";
import { ActionForm } from "@/components/ui/action-form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatMoney } from "@/lib/finance";
import { formatDate } from "@/lib/format";

/** "N instalments, first due on X, every Y days": shows the split before it is saved. */
export function CreatePlanForm({ invoiceId, balanceDue, currency, today }: { invoiceId: string; balanceDue: number; currency: string; today: string }) {
  const [count, setCount] = useState(3);
  const [first, setFirst] = useState(today);
  const [every, setEvery] = useState(30);

  const preview = useMemo(() => {
    const cents = Math.round(balanceDue * 100);
    if (!Number.isInteger(count) || count < 2 || count > 12 || cents < count || !/^\d{4}-\d{2}-\d{2}$/.test(first) || !(every >= 1)) return [];
    const base = Math.floor(cents / count);
    const extra = cents - base * count;
    const start = new Date(`${first}T00:00:00Z`).getTime();
    return Array.from({ length: count }, (_, i) => ({
      due: new Date(start + i * every * 86_400_000).toISOString().slice(0, 10),
      amount: (base + (i < extra ? 1 : 0)) / 100,
    }));
  }, [balanceDue, count, first, every]);

  return (
    <ActionForm action={createPaymentPlanAction} aria-label="Create a payment plan">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted">Instalments</span>
          <Input name="count" type="number" min={2} max={12} value={count} onChange={(e) => setCount(Number(e.target.value))} className="h-9 w-20 text-sm" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted">First due</span>
          <Input name="first_due" type="date" min={today} value={first} onChange={(e) => setFirst(e.target.value)} className="h-9 w-40 text-sm" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted">Days apart</span>
          <Input name="every_days" type="number" min={1} max={366} value={every} onChange={(e) => setEvery(Number(e.target.value))} className="h-9 w-24 text-sm" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted">Note (optional)</span>
          <Input name="note" maxLength={300} placeholder="e.g. Agreed with parent" className="h-9 w-52 text-sm" />
        </label>
        <SubmitButton loadingText="Creating…">Create plan</SubmitButton>
      </div>
      {preview.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2 text-xs text-muted" aria-label="Preview of the instalments">
          {preview.map((p, i) => (
            <li key={p.due + i} className="rounded-md border border-border px-2 py-1">
              {i + 1}. {formatMoney(p.amount, currency)} · {formatDate(p.due)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-subtle">Choose 2–12 instalments and a first due date to see the split.</p>
      )}
    </ActionForm>
  );
}

export function CancelPlanForm({ planId }: { planId: string }) {
  return (
    <ActionForm action={cancelPaymentPlanAction} compact aria-label="Cancel payment plan">
      <input type="hidden" name="plan_id" value={planId} />
      <div className="flex flex-wrap items-center gap-2">
        <Input name="reason" aria-label="Reason for cancelling the plan" placeholder="Reason" maxLength={300} className="h-9 w-48 text-sm" />
        <ConfirmButton question="Cancel the plan?" confirmLabel="Yes, cancel plan" pendingLabel="Cancelling…">
          Cancel plan
        </ConfirmButton>
      </div>
    </ActionForm>
  );
}
