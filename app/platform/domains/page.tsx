import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { requireSuperAdmin } from "@/services/auth";
import { listDomainsForPlatform, type PlatformDomainRow } from "@/services/platform";
import { getSchoolDomainBase } from "@/lib/env";
import { getVercelConfig } from "@/lib/vercel-domains";
import { checkDomainAction, connectDomainAction, provisionMissingSubdomainsAction, setDomainVerificationAction } from "./actions";

export const metadata: Metadata = { title: "Domains" };

const VERIFICATION_LABEL = { pending: "Pending review", verified: "Approved", failed: "Rejected" } as const;
const VERIFICATION_TONE = { pending: "warning", verified: "success", failed: "danger" } as const;

export default async function PlatformDomainsPage() {
  await requireSuperAdmin();
  const result = await listDomainsForPlatform();

  if (result.status !== "ok") {
    return (
      <Alert tone={result.status === "not_configured" ? "warning" : "danger"} title="Couldn’t load domains">
        {result.status === "not_configured"
          ? "The server-side service key (SUPABASE_SERVICE_ROLE_KEY) is not set for this deployment."
          : "Please refresh the page."}
      </Alert>
    );
  }

  const custom = result.domains.filter((d) => d.domainType === "custom");
  const pending = custom.filter((d) => d.verificationStatus === "pending");
  const decided = custom.filter((d) => d.verificationStatus !== "pending");
  const vercel = getVercelConfig() !== null;
  const base = getSchoolDomainBase();
  const subdomains = result.domains.filter((d) => d.domainType === "subdomain");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Domains</h1>
        <p className="mt-1 text-sm text-muted">
          Custom-domain requests submitted by schools.{" "}
          {vercel
            ? "Connect a request to Vercel, give the school the DNS records shown, then check DNS. It becomes verified, and starts routing, once Vercel confirms the DNS."
            : "Vercel is not connected on this deployment, so approving a request only records a review decision; DNS and certificates are handled by hand."}
        </p>
      </div>

      <Card aria-labelledby="addresses-title">
        <CardHeader
          titleId="addresses-title"
          title="School addresses"
          description={
            base
              ? `Every school gets its own address, like yourschool.${base}. ${subdomains.length} created so far.`
              : "Automatic school addresses are off. Set EDUCORE_SCHOOL_DOMAIN to your platform domain to turn them on."
          }
        />
        {base ? (
          <CardBody className="space-y-3">
            <ActionForm action={provisionMissingSubdomainsAction} compact aria-label="Create missing school addresses">
              <SubmitButton size="sm" loadingText="Creating…">
                Create missing school addresses
              </SubmitButton>
            </ActionForm>
            {subdomains.length > 0 ? <DomainsTable rows={subdomains} caption="School addresses" showActions={false} vercel={vercel} /> : null}
          </CardBody>
        ) : null}
      </Card>

      <Card aria-labelledby="pending-title">
        <CardHeader
          titleId="pending-title"
          title="Awaiting review"
          description={pending.length === 0 ? undefined : `${pending.length} request${pending.length === 1 ? "" : "s"} waiting on a decision`}
        />
        {pending.length === 0 ? (
          <EmptyState icon="domains" title="Nothing waiting" description="New custom-domain requests from schools will show up here." />
        ) : (
          <DomainsTable rows={pending} caption="Custom-domain requests awaiting review" showActions vercel={vercel} />
        )}
      </Card>

      <Card aria-labelledby="decided-title">
        <CardHeader titleId="decided-title" title="Previously reviewed" />
        {decided.length === 0 ? (
          <EmptyState icon="domains" title="No reviewed requests yet" />
        ) : (
          <DomainsTable rows={decided} caption="Previously reviewed custom-domain requests" showActions={false} vercel={vercel} />
        )}
      </Card>
    </div>
  );
}

function DomainsTable({
  rows,
  caption,
  showActions,
  vercel,
}: {
  rows: PlatformDomainRow[];
  caption: string;
  showActions: boolean;
  vercel: boolean;
}) {
  return (
    <Table caption={caption}>
      <THead>
        <TR>
          <TH>Domain</TH>
          <TH>School</TH>
          <TH>Status</TH>
          <TH>Requested</TH>
          {showActions ? (
            <TH>
              <span className="sr-only">Actions</span>
            </TH>
          ) : null}
        </TR>
      </THead>
      <TBody>
        {rows.map((d) => (
          <TR key={d.id}>
            <TD className="font-mono text-sm">{d.domain}</TD>
            <TD>
              {d.schoolName} <span className="text-muted">({d.schoolCode})</span>
            </TD>
            <TD>
              <Badge tone={VERIFICATION_TONE[d.verificationStatus]}>
                {d.verificationStatus === "pending" && d.connected ? "Waiting for DNS" : VERIFICATION_LABEL[d.verificationStatus]}
              </Badge>
              {d.dnsInstructions ? <p className="mt-1 max-w-xs text-xs text-muted">Add: {d.dnsInstructions}</p> : null}
            </TD>
            <TD className="text-sm text-muted">{formatDate(d.createdAt.slice(0, 10))}</TD>
            {showActions ? (
              <TD>
                <div className="flex flex-wrap items-start gap-2">
                  {vercel ? (
                    d.connected ? (
                      <ActionForm action={checkDomainAction} compact aria-label={`Check DNS for ${d.domain}`}>
                        <input type="hidden" name="domain_id" value={d.id} />
                        <SubmitButton size="sm" loadingText="Checking…">
                          Check DNS
                        </SubmitButton>
                      </ActionForm>
                    ) : (
                      <ActionForm action={connectDomainAction} compact aria-label={`Connect ${d.domain} to Vercel`}>
                        <input type="hidden" name="domain_id" value={d.id} />
                        <SubmitButton size="sm" loadingText="Connecting…">
                          Connect to Vercel
                        </SubmitButton>
                      </ActionForm>
                    )
                  ) : (
                    <ActionForm action={setDomainVerificationAction} compact aria-label={`Review ${d.domain}`}>
                      <input type="hidden" name="domain_id" value={d.id} />
                      <input type="hidden" name="status" value="verified" />
                      <SubmitButton size="sm" loadingText="Saving…">
                        Approve
                      </SubmitButton>
                    </ActionForm>
                  )}
                  <ActionForm action={setDomainVerificationAction} compact aria-label={`Reject ${d.domain}`}>
                    <input type="hidden" name="domain_id" value={d.id} />
                    <input type="hidden" name="status" value="failed" />
                    <ConfirmButton question={`Reject ${d.domain}?`} confirmLabel="Yes, reject" pendingLabel="Saving…">
                      Reject
                    </ConfirmButton>
                  </ActionForm>
                </div>
              </TD>
            ) : null}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
