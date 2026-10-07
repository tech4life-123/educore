import type { Metadata } from "next";
import Link from "next/link";
import { DocumentTypeForm, EMPTY_TYPE, SeedTypesButton } from "@/components/documents/type-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { requireCapability } from "@/services/auth";
import { listDocumentTypes } from "@/services/documents";
import { getFinanceSettings } from "@/services/finance";

export const metadata: Metadata = { title: "Document fees & rules" };

export default async function DocumentSettingsPage() {
  await requireCapability("school.manage", "/documents/settings");
  const [types, settings] = await Promise.all([listDocumentTypes(), getFinanceSettings()]);
  const defaultCurrency = settings?.default_currency ?? "USD";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/documents" className="text-sm underline">
          ← Documents
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Document fees &amp; rules</h1>
        <p className="mt-1 text-sm text-muted">
          You decide, for each document, whether it has a fee, needs financial clearance, needs approval, and whether you may override a hold. Nothing is fixed in
          the system. A student’s academic records are never hidden because of unpaid fees — only the documents you mark here are held.
        </p>
      </div>

      {types.length === 0 ? (
        <Card>
          <CardBody className="space-y-3">
            <p className="text-sm text-muted">Start with the standard set: admission letter, transcript, replacement transcript, certificate, clearance letter, ID card and report card copy. They are added free with no rules, so you can set each one.</p>
            <SeedTypesButton />
          </CardBody>
        </Card>
      ) : null}

      {types.map((t) => (
        <Card key={t.id}>
          <CardHeader
            title={t.name}
            description={<span className="font-mono text-xs">{t.code}</span>}
            action={<Badge tone={t.active ? "success" : "neutral"}>{t.active ? "Available" : "Switched off"}</Badge>}
          />
          <CardBody>
            <DocumentTypeForm
              defaultCurrency={defaultCurrency}
              values={{
                id: t.id,
                code: t.code,
                name: t.name,
                description: t.description ?? "",
                fee: t.fee_amount ? String(t.fee_amount) : "",
                currency: t.currency ?? "",
                requiresPayment: t.requires_payment,
                requiresClearance: t.requires_clearance,
                requiresApproval: t.requires_approval,
                allowOverride: t.allow_override,
                admissionsHandled: t.admissions_handled,
                active: t.active,
              }}
            />
          </CardBody>
        </Card>
      ))}

      <Card>
        <CardHeader title="Add another document" description="For anything the school issues that isn’t in the list above." />
        <CardBody>
          <DocumentTypeForm values={EMPTY_TYPE} defaultCurrency={defaultCurrency} />
        </CardBody>
      </Card>
    </div>
  );
}
