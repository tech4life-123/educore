"use client";

import { cancelRequestAction, requestDocumentAction } from "@/app/(school)/documents/actions";
import { ActionForm } from "@/components/ui/action-form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { SubmitButton } from "@/components/ui/submit-button";

export function RequestDocumentButton({ studentId, typeId, label }: { studentId: string; typeId: string; label: string }) {
  return (
    <ActionForm action={requestDocumentAction} compact aria-label={`Request ${label}`}>
      <input type="hidden" name="student_id" value={studentId} />
      <input type="hidden" name="type_id" value={typeId} />
      <SubmitButton size="sm" loadingText="Requesting…">
        Request
      </SubmitButton>
    </ActionForm>
  );
}

export function CancelMyRequestButton({ requestId, label }: { requestId: string; label: string }) {
  return (
    <ActionForm action={cancelRequestAction} compact aria-label={`Cancel ${label}`}>
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="reason" value="Cancelled by the requester" />
      <ConfirmButton question="Cancel this request?" confirmLabel="Yes, cancel" pendingLabel="Cancelling…">
        Cancel
      </ConfirmButton>
    </ActionForm>
  );
}
