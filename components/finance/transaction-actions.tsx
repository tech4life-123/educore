"use client";

import Link from "next/link";
import { matchTransactionAction, rejectTransactionAction } from "@/app/(school)/finance/actions";
import { ActionForm } from "@/components/ui/action-form";
import { buttonClasses } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export interface Suggestion {
  paymentId: string;
  label: string;
}

/** Row actions for one unmatched statement line. Nothing is ever matched automatically: a person picks. */
export function TransactionActions({ transactionId, suggestions, reference }: { transactionId: string; suggestions: Suggestion[]; reference: string }) {
  return (
    <div className="space-y-3">
      {suggestions.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted">Possible matches</p>
          {suggestions.map((s) => (
            <ActionForm key={s.paymentId} action={matchTransactionAction} compact aria-label={`Match ${reference} to ${s.label}`}>
              <input type="hidden" name="transaction_id" value={transactionId} />
              <input type="hidden" name="payment_id" value={s.paymentId} />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">{s.label}</span>
                <SubmitButton size="sm" loadingText="Matching…">
                  Match
                </SubmitButton>
              </div>
            </ActionForm>
          ))}
        </div>
      ) : (
        <p className="text-xs text-subtle">No pending payment looks like this one.</p>
      )}
      <div className="flex flex-wrap items-start gap-3">
        <Link href={`/finance/reconciliation?assign=${transactionId}`} className={buttonClasses("secondary", "sm")}>
          Assign to a student
        </Link>
        <ActionForm action={rejectTransactionAction} compact aria-label={`Reject ${reference}`}>
          <input type="hidden" name="transaction_id" value={transactionId} />
          <div className="flex flex-wrap items-center gap-2">
            <Input name="reason" aria-label="Reason for rejecting" placeholder="Reason" maxLength={200} className="h-9 w-40 text-sm" />
            <ConfirmButton question="Reject it?" confirmLabel="Yes, reject" pendingLabel="Rejecting…">
              Reject
            </ConfirmButton>
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
