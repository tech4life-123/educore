import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { schoolTypeLabel } from "@/lib/format";
import { requireSuperAdmin } from "@/services/auth";
import { listSchoolsForPlatform } from "@/services/platform";
import type { Enums } from "@/types/database";

export const metadata: Metadata = { title: "Platform" };

const STATUS_TONE: Record<Enums<"school_status">, "success" | "warning" | "danger" | "neutral"> = {
  active: "success",
  pending: "warning",
  suspended: "danger",
  archived: "neutral",
};

export default async function PlatformPage() {
  const { profile } = await requireSuperAdmin();
  const result = await listSchoolsForPlatform();

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
                    <TD className="font-medium">{school.name}</TD>
                    <TD>{school.code}</TD>
                    <TD>{schoolTypeLabel(school.school_type)}</TD>
                    <TD>{school.county ?? "—"}</TD>
                    <TD>
                      <Badge tone={STATUS_TONE[school.status]}>
                        {school.status.charAt(0).toUpperCase() + school.status.slice(1)}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      ) : null}
    </div>
  );
}
