"use client";

import { useState } from "react";
import { applyAdjustmentAction, refundPaymentAction, voidAdjustmentAction } from "@/app/(school)/finance/actions";
import { ActionForm } from "@/components/ui/action-form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatMoney, MANUAL_METHOD_OPTIONS } from "@/lib/finance";

const select = "h-9 rounded-md border border-border bg-surface px-2 text-sm";

/** Admin only (the page decides who sees it; the database decides who may). */
export function ApplyAdjustmentForm({ invoiceId, balanceDue, currency }: { invoiceId: string; balanceDue: number; currency: string }) {
  const [amount, setAmount] = useState("");
  const percent = (p: number) => setAmount((Math.round(balanceDue * p) / 100).toFixed(2));
  return (
    <ActionForm action={applyAdjustmentAction} aria-label="Apply a discount, scholarship or waiver">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted">Type</span>
          <select name="kind" className={select} defaultValue="discount">
            <option value="discount">Discount</option>
            <option value="scholarship">Scholarship</option>
            <option value="waiver">Waiver</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted">Amount ({currency})</span>
          <Input name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-9 w-32 text-sm" />
        </label>
        <div className="flex gap-1" aria-label="Quick amounts">
          {[10, 25, 50, 100].map((p) => (
            <button key={p} type="button" onClick={() => percent(p)} className="h-9 rounded-md border border-border px-2 text-xs text-muted hover:bg-surface-muted">
              {p}%
            </button>
          ))}
        </div>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted">Reason</span>
          <Input name="reason" maxLength={300} placeholder="e.g. Sibling discount" className="h-9 w-56 text-sm" />
        </label>
        <SubmitButton loadingText="Applying…">Apply</SubmitButton>
      </div>
      <p className="mt-2 text-xs text-subtle">Percent buttons are of the balance now due ({formatMoney(balanceDue, currency)}). The amount can’t exceed it.</p>
    </ActionForm>
  );
}

export function VoidAdjustmentForm({ adjustmentId }: { adjustmentId: string }) {
  return (
    <ActionForm action={voidAdjustmentAction} compact aria-label="Void adjustment">
      <input type="hidden" name="adjustment_id" value={adjustmentId} />
      <div className="flex flex-wrap items-center gap-2">
        <Input name="reason" aria-label="Reason for voiding" placeholder="Reason" maxLength={300} className="h-9 w-40 text-sm" />
        <ConfirmButton question="Void it?" confirmLabel="Yes, void" pendingLabel="Voiding…">
          Void
        </ConfirmButton>
      </div>
    </ActionForm>
  );
}

export function RefundForm({ paymentId, maxAmount, currency }: { paymentId: string; maxAmount: number; currency: string }) {
  return (
    <ActionForm action={refundPaymentAction} compact aria-label="Refund payment">
      <input type="hidden" name="payment_id" value={paymentId} />
      <div className="flex flex-wrap items-center gap-2">
        <Input name="amount" inputMode="decimal" aria-label={`Refund amount in ${currency}`} defaultValue={maxAmount.toFixed(2)} className="h-9 w-24 text-sm" />
        <select name="method" aria-label="How it was returned" className={select} defaultValue="cash">
          {MANUAL_METHOD_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <Input name="reference" aria-label="Reference" placeholder="Reference" maxLength={100} className="h-9 w-28 text-sm" />
        <Input name="reason" aria-label="Reason for refund" placeholder="Reason" maxLength={300} className="h-9 w-36 text-sm" />
        <ConfirmButton question="Refund it?" confirmLabel="Yes, refund" pendingLabel="Refunding…">
          Refund
        </ConfirmButton>
      </div>
    </ActionForm>
  );
}
