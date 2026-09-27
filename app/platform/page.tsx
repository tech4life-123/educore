import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { schoolTypeLabel } from "@/lib/format";
import { requireSuperAdmin } from "@/services/auth";
import { listSchoolsForPlatform } from "@/services/platform";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/platform-stats";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { getAiConfig } from "@/lib/ai/config";
import { testAiConnection } from "./ai-actions";

export const metadata: Metadata = { title: "Platform" };

export default async function PlatformPage() {
  const { profile } = await requireSuperAdmin();
  const result = await listSchoolsForPlatform();
  const ai = getAiConfig();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Platform overview</h1>
          <p className="mt-1 text-sm text-muted">Welcome, {profile.first_name}. Schools running on this EduCore deployment.</p>
        </div>
        <ButtonLink href="/platform/schools/new">Add school</ButtonLink>
      </div>

      {result.status === "not_configured" ? (
        <Alert tone="warning" title="Platform access not configured">
          The server-side service key (SUPABASE_SERVICE_ROLE_KEY) is not set for this deployment, so cross-school
          data can’t be loaded. See the README section “Super Admin”.
        </Alert>
      ) : null}

      {result.status === "error" ? (
        <Alert tone="danger" title="Couldn’t load schools">
          Please refresh the page. If the problem continues, check the server logs.
        </Alert>
      ) : null}

      {result.status === "ok" ? (
        <Card aria-labelledby="schools-title">
          <CardHeader
            titleId="schools-title"
            title="Schools"
            description={`${result.schools.length} ${result.schools.length === 1 ? "school" : "schools"}`}
          />
          {result.schools.length === 0 ? (
            <EmptyState
              icon="classes"
              title="No schools yet"
              description="Add the first school and its administrator to get started."
              action={<ButtonLink href="/platform/schools/new">Add school</ButtonLink>}
            />
          ) : (
            <Table caption="Schools on this platform">
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Code</TH>
                  <TH>Type</TH>
                  <TH>County</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {result.schools.map((school) => (
                  <TR key={school.id}>
                    <TD>
                      <Link href={`/platform/schools/${school.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                        {school.name}
                      </Link>
                      {school.is_demo ? (
                        <Badge tone="warning" className="ml-2">
                          Demo
                        </Badge>
                      ) : null}
                    </TD>
                    <TD>{school.code}</TD>
                    <TD>{schoolTypeLabel(school.school_type)}</TD>
                    <TD>{school.county ?? "—"}</TD>
                    <TD>
                      <Badge tone={STATUS_TONE[school.status]}>{STATUS_LABEL[school.status]}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      ) : null}

      <Card aria-labelledby="ai-title">
        <CardHeader
          titleId="ai-title"
          title="EduCore AI"
          description={
            ai.enabled
              ? `On · ${ai.provider} · ${ai.model} · up to ${ai.maxOutputTokens} tokens per reply`
              : `Off · ${ai.disabledReason}`
          }
          action={<Badge tone={ai.enabled ? "success" : "neutral"}>{ai.enabled ? "Configured" : "Not configured"}</Badge>}
        />
        <CardBody className="space-y-3 text-sm text-muted">
          <p>
            Limits: {ai.limits.userPerMinute} questions per person per minute, {ai.limits.userPerDay} per person per day,{" "}
            {ai.limits.schoolPerDay} per school per day. Only request details (who, when, model, tokens) are logged — never
            questions or answers.
          </p>
          {ai.enabled ? (
            <ActionForm action={testAiConnection} compact>
              <SubmitButton size="sm" variant="secondary" loadingText="Testing…">
                Test connection
              </SubmitButton>
            </ActionForm>
          ) : (
            <p>Set the AI environment variables on the server (see README, “EduCore AI”) and redeploy.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
