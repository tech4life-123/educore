import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CancelMyRequestButton, RequestDocumentButton } from "@/components/documents/family-actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { DOC_STATUS_LABEL, DOC_STATUS_TONE, OPEN_STATUSES } from "@/lib/documents";
import { formatMoney } from "@/lib/finance";
import { formatDate, fullName } from "@/lib/format";
import { requireSchoolMember } from "@/services/auth";
import { listGuardianLinks } from "@/services/classes";
import { getClearance, listDocumentRequests, listDocumentTypes } from "@/services/documents";

export const metadata: Metadata = { title: "My documents" };

export default async function MyDocumentsPage({ searchParams }: PageProps<"/my-documents">) {
  const { school, profile } = await requireSchoolMember("/my-documents");
  if (profile.role !== "student" && profile.role !== "parent") redirect("/documents");

  const isParent = profile.role === "parent";
  const people = isParent
    ? (await listGuardianLinks(school.id, profile.id, "children"))
        .map((l) => l.person)
        .filter((p) => p !== null)
        .map((p) => ({ id: p.id, name: fullName(p) }))
    : [{ id: profile.id, name: fullName(profile) }];

  const header = (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">My documents</h1>
      <p className="mt-1 text-sm text-muted">Request an official document. If it has a fee, the invoice appears under My fees; once it is paid and any checks are done, the document is ready to open and print.</p>
    </div>
  );

  if (people.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <EmptyState icon="students" title="No children linked to your account" description="The school links each parent or guardian to their children. Ask the school office to link your account." />
        </Card>
      </div>
    );
  }

  const params = await searchParams;
  const requested = Array.isArray(params.child) ? params.child[0] : params.child;
  const selected = people.find((p) => p.id === requested) ?? people[0];

  const [types, requests, clearance] = await Promise.all([
    listDocumentTypes({ activeOnly: true }),
    listDocumentRequests({ studentIds: [selected.id] }),
    getClearance(selected.id),
  ]);
  const openTypeIds = new Set(requests.filter((r) => OPEN_STATUSES.includes(r.status)).map((r) => r.typeId));

  return (
    <div className="space-y-6">
      {header}

      {people.length > 1 ? (
        <nav aria-label="Child" className="flex flex-wrap gap-2">
          {people.map((p) => (
            <Link
              key={p.id}
              href={`/my-documents?child=${p.id}`}
              aria-current={p.id === selected.id ? "page" : undefined}
              className={cn("rounded-full border px-3 py-1 text-sm", p.id === selected.id ? "border-brand bg-brand-soft font-medium text-foreground" : "border-border text-muted hover:bg-surface-muted")}
            >
              {p.name}
            </Link>
          ))}
        </nav>
      ) : null}
      {isParent ? <h2 className="text-lg font-semibold text-foreground">{selected.name}</h2> : null}

      {clearance ? (
        clearance.cleared ? (
          <Alert tone="success" title="Financially cleared">
            Nothing is owed to the school, so documents that need clearance can be released.
          </Alert>
        ) : (
          <Alert tone="warning" title="Financial hold">
            An outstanding balance ({clearance.holds.map((h) => formatMoney(h.balance, h.currency)).join(" + ")}) means documents that need clearance can’t be released yet. Your records
            are not affected. See <Link href="/my-fees" className="underline">My fees</Link>.
          </Alert>
        )
      ) : null}

      <Card>
        <CardHeader title="Available documents" />
        {types.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">The school hasn’t set up any documents to request yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {types.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{t.name}</p>
                  <p className="text-sm text-muted">
                    {t.requires_payment ? `Fee ${formatMoney(t.fee_amount, t.currency ?? "USD")}` : "No fee"}
                    {t.requires_clearance ? " · needs financial clearance" : ""}
                    {t.requires_approval ? " · needs approval" : ""}
                  </p>
                  {t.description ? <p className="text-xs text-subtle">{t.description}</p> : null}
                </div>
                {openTypeIds.has(t.id) ? <Badge tone="brand">Already requested</Badge> : <RequestDocumentButton studentId={selected.id} typeId={t.id} label={t.name} />}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="My requests" />
        {requests.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No requests yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{r.typeName}</p>
                  <p className="text-sm text-muted">Requested {formatDate(r.createdAt)}</p>
                  {r.status === "payment_pending" && r.invoiceNumber ? (
                    <p className="text-sm">
                      Pay <strong>{formatMoney(r.invoiceBalanceDue, r.invoiceCurrency ?? "USD")}</strong> (invoice {r.invoiceNumber}) at the school to continue — see{" "}
                      <Link href="/my-fees" className="underline">My fees</Link>.
                    </p>
                  ) : null}
                  {r.status === "rejected" && r.reviewNote ? <p className="text-sm text-subtle">Reason: {r.reviewNote}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone={DOC_STATUS_TONE[r.status]}>{DOC_STATUS_LABEL[r.status]}</Badge>
                  {r.documentId && !r.documentRevoked ? (
                    <Link href={`/print/documents/${r.documentId}`} className={buttonClasses("secondary", "sm")}>
                      Open / print
                    </Link>
                  ) : null}
                  {r.documentRevoked ? <Badge tone="danger">Withdrawn by the school</Badge> : null}
                  {OPEN_STATUSES.includes(r.status) ? <CancelMyRequestButton requestId={r.id} label={r.typeName} /> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
