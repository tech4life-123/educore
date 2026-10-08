import type { Metadata } from "next";
import Link from "next/link";
import { CreateProviderForm, ProviderAccountActions } from "@/components/payments/provider-forms";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getAdapter, isImplemented } from "@/lib/payments/adapters";
import { PROVIDER_CODES } from "@/lib/payments/types";
import { hasCapability } from "@/lib/auth/roles";
import { currentSiteUrl } from "@/lib/site-url";
import { requireCapability } from "@/services/auth";
import { listProviderAccounts, listProviderEvents } from "@/services/providers";

export const metadata: Metadata = { title: "Payment providers" };

const OUTCOME: Record<string, { label: string; tone: "success" | "neutral" | "warning" }> = {
  ingested: { label: "Added to reconciliation", tone: "success" },
  ignored: { label: "Not a completed payment", tone: "neutral" },
  conflict: { label: "Already logged", tone: "warning" },
};

export default async function ProvidersPage() {
  const { profile } = await requireCapability("finance.manage", "/finance/providers");
  const canManage = hasCapability(profile.role, "school.manage");
  const [accounts, events, origin] = await Promise.all([listProviderAccounts(), listProviderEvents(), currentSiteUrl()]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/finance/reconciliation" className="text-sm underline">
          ← Reconciliation
        </Link>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Payment providers</h2>
        <p className="mt-1 text-sm text-muted">
          A provider tells EduCore that money arrived. Each message is checked against a secret only you and the provider know, then appears under
          <strong> Reconciliation → To match</strong> for a finance officer to match to a student. A provider message never marks a fee as paid by itself.
        </p>
      </div>

      <Alert tone="info" title="Orange Money and MTN MoMo are not connected yet">
        They need a merchant account and the provider’s official integration details. Until then only the <strong>Sandbox</strong> provider works — it lets you
        test the whole flow without real money.
      </Alert>

      {accounts.length === 0 ? (
        <EmptyState title="No provider accounts yet" description={canManage ? "Add one below." : "Ask your school administrator to add one."} />
      ) : (
        accounts.map((a) => {
          const adapter = getAdapter(a.provider as (typeof PROVIDER_CODES)[number]);
          return (
            <Card key={a.id}>
              <CardHeader
                title={a.label}
                description={`${adapter.label} · ${a.environment === "live" ? "Live" : "Sandbox"}`}
                action={<Badge tone={a.status === "active" ? "success" : "neutral"}>{a.status === "active" ? "On" : "Off"}</Badge>}
              />
              <CardBody className="space-y-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted">Callback URL (give this to the provider)</p>
                  <code className="block break-all rounded-md bg-surface-muted px-3 py-2 text-xs">{`${origin}/api/payments/webhook/${a.provider}/${a.id}`}</code>
                </div>
                {!isImplemented(a.provider as (typeof PROVIDER_CODES)[number]) ? (
                  <p className="text-sm text-muted">This provider’s integration is not built yet, so messages to this URL are refused.</p>
                ) : null}
                {canManage ? <ProviderAccountActions accountId={a.id} status={a.status as "active" | "disabled"} sandboxTest={a.provider === "mock" && a.environment === "sandbox"} /> : null}
              </CardBody>
            </Card>
          );
        })
      )}

      {canManage ? (
        <Card>
          <CardHeader title="Add a provider account" description="You’ll be shown the signing secret once. Keep it private." />
          <CardBody>
            <CreateProviderForm
              options={PROVIDER_CODES.map((c) => ({
                value: c,
                label: isImplemented(c) ? getAdapter(c).label : `${getAdapter(c).label} (not available yet)`,
              }))}
            />
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Recent messages from providers" description="The latest 30. Newest first." />
        <CardBody>
          {events.length === 0 ? (
            <p className="text-sm text-muted">Nothing received yet.</p>
          ) : (
            <Table caption="Recent provider messages">
              <THead>
                <TR>
                  <TH>Received</TH>
                  <TH>Account</TH>
                  <TH>Provider reference</TH>
                  <TH>What happened</TH>
                </TR>
              </THead>
              <TBody>
                {events.map((e) => {
                  const o = OUTCOME[e.outcome] ?? { label: e.outcome, tone: "neutral" as const };
                  return (
                    <TR key={e.id}>
                      <TD>{new Date(e.receivedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</TD>
                      <TD>{e.accountLabel}</TD>
                      <TD className="font-mono text-xs">{e.externalId}</TD>
                      <TD>
                        <Badge tone={o.tone}>{o.label}</Badge>
                        {e.detail ? <span className="ml-2 text-xs text-muted">{e.detail}</span> : null}
                        {e.deliveryCount > 1 ? <span className="ml-2 text-xs text-subtle">sent {e.deliveryCount}×</span> : null}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
