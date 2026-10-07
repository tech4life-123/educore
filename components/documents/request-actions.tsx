"use client";

import Link from "next/link";
import {
  cancelRequestAction,
  generateDocumentAction,
  markDocumentAction,
  reviewRequestAction,
  revokeDocumentAction,
} from "@/app/(school)/documents/actions";
import { ActionForm } from "@/components/ui/action-form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { OPEN_STATUSES, type DocumentStatus } from "@/lib/documents";

export interface StaffRequestActionProps {
  requestId: string;
  label: string;
  status: DocumentStatus;
  requiresApproval: boolean;
  approved: boolean;
  allowOverride: boolean;
  /** The viewer is a school administrator (the only role that may override or revoke). */
  isAdmin: boolean;
  documentId: string | null;
  documentRevoked: boolean;
}

/** Row actions for one document request. Which ones show depends only on its state; the database re-checks everything. */
export function StaffRequestActions(p: StaffRequestActionProps) {
  const open = OPEN_STATUSES.includes(p.status);
  const needsReview = open && p.requiresApproval && !p.approved;

  return (
    <div className="space-y-3">
      {needsReview ? (
        <div className="flex flex-wrap items-start gap-3">
          <ActionForm action={reviewRequestAction} compact aria-label={`Approve ${p.label}`}>
            <input type="hidden" name="request_id" value={p.requestId} />
            <input type="hidden" name="decision" value="approve" />
            <SubmitButton size="sm" loadingText="Approving…">
              Approve
            </SubmitButton>
          </ActionForm>
          <ActionForm action={reviewRequestAction} compact aria-label={`Reject ${p.label}`}>
            <input type="hidden" name="request_id" value={p.requestId} />
            <input type="hidden" name="decision" value="reject" />
            <div className="flex flex-wrap items-center gap-2">
              <Input name="note" aria-label="Reason for rejecting" placeholder="Reason" maxLength={200} className="h-9 w-40 text-sm" />
              <ConfirmButton question="Reject it?" confirmLabel="Yes, reject" pendingLabel="Rejecting…">
                Reject
              </ConfirmButton>
            </div>
          </ActionForm>
        </div>
      ) : null}

      {open && !needsReview ? (
        <ActionForm action={generateDocumentAction} compact aria-label={`Generate ${p.label}`}>
          <input type="hidden" name="request_id" value={p.requestId} />
          <div className="flex flex-wrap items-center gap-2">
            {p.isAdmin && p.allowOverride ? (
              <Input name="override_reason" aria-label="Reason, only if overriding a payment or clearance hold" placeholder="Override reason (only if on hold)" maxLength={300} className="h-9 w-56 text-sm" />
            ) : null}
            <SubmitButton size="sm" loadingText="Generating…">
              Generate
            </SubmitButton>
          </div>
        </ActionForm>
      ) : null}

      {p.documentId && !p.documentRevoked && (p.status === "generated" || p.status === "printed" || p.status === "delivered") ? (
        <div className="flex flex-wrap items-start gap-3">
          <Link href={`/print/documents/${p.documentId}`} className="text-sm underline">
            Open / print
          </Link>
          {p.status === "generated" ? (
            <ActionForm action={markDocumentAction} compact aria-label={`Mark ${p.label} printed`}>
              <input type="hidden" name="request_id" value={p.requestId} />
              <input type="hidden" name="status" value="printed" />
              <SubmitButton size="sm" variant="secondary" loadingText="Saving…">
                Mark printed
              </SubmitButton>
            </ActionForm>
          ) : null}
          {p.status === "generated" || p.status === "printed" ? (
            <ActionForm action={markDocumentAction} compact aria-label={`Mark ${p.label} delivered`}>
              <input type="hidden" name="request_id" value={p.requestId} />
              <input type="hidden" name="status" value="delivered" />
              <SubmitButton size="sm" variant="secondary" loadingText="Saving…">
                Mark delivered
              </SubmitButton>
            </ActionForm>
          ) : null}
          {p.isAdmin ? (
            <ActionForm action={revokeDocumentAction} compact aria-label={`Revoke ${p.label}`}>
              <input type="hidden" name="document_id" value={p.documentId} />
              <div className="flex flex-wrap items-center gap-2">
                <Input name="reason" aria-label="Reason for revoking" placeholder="Reason" maxLength={200} className="h-9 w-40 text-sm" />
                <ConfirmButton question="Revoke it?" confirmLabel="Yes, revoke" pendingLabel="Revoking…">
                  Revoke
                </ConfirmButton>
              </div>
            </ActionForm>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <ActionForm action={cancelRequestAction} compact aria-label={`Cancel ${p.label}`}>
          <input type="hidden" name="request_id" value={p.requestId} />
          <input type="hidden" name="reason" value="Cancelled by the school" />
          <ConfirmButton question="Cancel the request?" confirmLabel="Yes, cancel" pendingLabel="Cancelling…">
            Cancel request
          </ConfirmButton>
        </ActionForm>
      ) : null}
    </div>
  );
}
