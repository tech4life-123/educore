"use client";

import { ActionForm } from "@/components/ui/action-form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import type { PaymentStatus } from "@/lib/finance";
import { confirmPaymentAction, rejectPaymentAction, reversePaymentAction } from "@/app/(school)/finance/actions";

/** Row actions for one payment. Which ones appear depends only on its status; the database re-checks everything. */
export function PaymentActions({ paymentId, status, label }: { paymentId: string; status: PaymentStatus; label: string }) {
  if (status === "pending" || status === "processing") {
    return (
      <div className="flex flex-wrap items-start gap-3">
        <ActionForm action={confirmPaymentAction} compact aria-label={`Confirm ${label}`}>
          <input type="hidden" name="payment_id" value={paymentId} />
          <SubmitButton size="sm" loadingText="Confirming…">
            Confirm
          </SubmitButton>
        </ActionForm>
        <ActionForm action={rejectPaymentAction} compact aria-label={`Reject ${label}`}>
          <input type="hidden" name="payment_id" value={paymentId} />
          <div className="flex flex-wrap items-center gap-2">
            <Input name="reason" aria-label="Reason for rejecting" placeholder="Reason" maxLength={200} className="h-9 w-40 text-sm" />
            <ConfirmButton question="Reject it?" confirmLabel="Yes, reject" pendingLabel="Rejecting…">
              Reject
            </ConfirmButton>
          </div>
        </ActionForm>
      </div>
    );
  }
  if (status === "posted") {
    return (
      <ActionForm action={reversePaymentAction} compact aria-label={`Reverse ${label}`}>
        <input type="hidden" name="payment_id" value={paymentId} />
        <div className="flex flex-wrap items-center gap-2">
          <Input name="reason" aria-label="Reason for reversing" placeholder="Reason" maxLength={200} className="h-9 w-40 text-sm" />
          <ConfirmButton question="Reverse it?" confirmLabel="Yes, reverse" pendingLabel="Reversing…">
            Reverse
          </ConfirmButton>
        </div>
      </ActionForm>
    );
  }
  return null;
}
