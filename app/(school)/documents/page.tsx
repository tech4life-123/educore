import type { Metadata } from "next";
import Link from "next/link";
import { StaffRequestActions } from "@/components/documents/request-actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { DOC_STATUS_LABEL, DOC_STATUS_TONE } from "@/lib/documents";
import { formatMoney } from "@/lib/finance";
import { formatDate } from "@/lib/format";
import { requireCapability } from "@/services/auth";
import { listDocumentRequests, listDocumentTypes } from "@/services/documents";

export const metadata: Metadata = { title: "Documents" };

const FILTERS = ["open", "generated", "printed", "delivered", "rejected", "cancelled"] as const;
const FILTER_LABEL: Record<string, string> = {
  open: "In progress",
  generated: "Ready",
  printed: "Printed",
  delivered: "Delivered",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export default async function DocumentsPage({ searchParams }: PageProps<"/documents">) {
  const { profile } = await requireCapability("documents.manage", "/documents");
  const sp = await searchParams;
  const raw = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const filter = (FILTERS as readonly string[]).includes(raw ?? "") ? (raw as (typeof FILTERS)[number]) : "open";
  const isAdmin = profile.role === "school_admin";

  const [requests, types] = await Promise.all([listDocumentRequests({ status: filter }), listDocumentTypes()]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Documents</h1>
          <p className="mt-1 text-sm text-muted">
            Requests for admission letters, transcripts, certificates and more. Fees, clearance and approval follow the rules set for each document.
          </p>
        </div>
        {isAdmin ? (
          <Link href="/documents/settings" className={buttonClasses("secondary")}>
            Document fees &amp; rules
          </Link>
        ) : null}
      </div>

      {types.length === 0 ? (
        <Alert tone="info" title="No documents are set up yet">
          {isAdmin ? (
            <>
              Open <Link href="/documents/settings" className="underline">Document fees &amp; rules</Link> and add the standard documents to get started.
            </>
          ) : (
            "A school administrator needs to set up the documents first."
          )}
        </Alert>
      ) : null}

      <nav aria-label="Filter requests" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "open" ? "/documents" : `/documents?status=${f}`}
            aria-current={f === filter ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1 text-sm", f === filter ? "border-brand bg-brand-soft font-medium text-foreground" : "border-border text-muted hover:bg-surface-muted")}
          >
            {FILTER_LABEL[f]}
          </Link>
        ))}
      </nav>

      <Card>
        {requests.length === 0 ? (
          <EmptyState icon="reportCards" title="No requests here" description="Requests from students and parents appear here as they come in." />
        ) : (
          <Table caption="Document requests">
            <THead>
              <TR>
                <TH>Requested</TH>
                <TH>Student</TH>
                <TH>Document</TH>
                <TH>Requirements</TH>
                <TH>Status</TH>
                <TH>
                  <span className="sr-only">Actions</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {requests.map((r) => (
                <TR key={r.id}>
                  <TD className="text-sm text-muted">{formatDate(r.createdAt)}</TD>
                  <TD>
                    <div>{r.studentName}</div>
                    {r.admissionNumber ? <div className="text-xs text-muted">{r.admissionNumber}</div> : null}
                  </TD>
                  <TD>
                    <div>{r.typeName}</div>
                    {r.documentNumber ? (
                      <div className="font-mono text-xs text-muted">
                        {r.documentNumber}
                        {r.documentRevoked ? " · revoked" : ""}
                      </div>
                    ) : null}
                    {r.note ? <div className="max-w-xs text-xs text-subtle">{r.note}</div> : null}
                  </TD>
                  <TD className="text-sm">
                    <ul className="space-y-0.5">
                      {r.requiresPayment ? (
                        <li>
                          Fee {formatMoney(r.feeAmount, r.invoiceCurrency ?? r.typeCurrency ?? "USD")}{" "}
                          <Badge tone={r.invoiceStatus === "paid" ? "success" : "warning"}>{r.invoiceStatus === "paid" ? "paid" : "unpaid"}</Badge>
                        </li>
                      ) : null}
                      {r.requiresClearance ? <li>Financial clearance</li> : null}
                      {r.requiresApproval ? (
                        <li>
                          Approval <Badge tone={r.reviewDecision === "approved" ? "success" : r.reviewDecision === "rejected" ? "danger" : "warning"}>{r.reviewDecision ?? "pending"}</Badge>
                        </li>
                      ) : null}
                      {!r.requiresPayment && !r.requiresClearance && !r.requiresApproval ? <li className="text-muted">None</li> : null}
                    </ul>
                    {r.overrideReason ? <p className="mt-1 max-w-xs text-xs text-subtle">Overridden: {r.overrideReason}</p> : null}
                  </TD>
                  <TD>
                    <Badge tone={DOC_STATUS_TONE[r.status]}>{DOC_STATUS_LABEL[r.status]}</Badge>
                    {r.reviewNote ? <div className="mt-1 max-w-[12rem] text-xs text-subtle">{r.reviewNote}</div> : null}
                  </TD>
                  <TD>
                    <StaffRequestActions
                      requestId={r.id}
                      label={`${r.typeName} for ${r.studentName}`}
                      status={r.status}
                      requiresApproval={r.requiresApproval}
                      approved={r.reviewDecision === "approved"}
                      allowOverride={r.allowOverride}
                      isAdmin={isAdmin}
                      documentId={r.documentId}
                      documentRevoked={r.documentRevoked}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
