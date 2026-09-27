import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { currentSiteUrl } from "@/lib/site-url";
import { requireCapability } from "@/services/auth";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import users" };

// Creating up to 100 accounts can take a while.
export const maxDuration = 60;

export default async function ImportUsersPage() {
  const { school } = await requireCapability("users.manage", "/users/import");
  const siteUrl = await currentSiteUrl();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="print:hidden">
        <Link href="/users" className="text-sm font-medium text-muted hover:text-foreground">
          ← User accounts
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Import users from a spreadsheet</h1>
        <p className="mt-1 text-sm text-muted">Create many accounts at once — for example a whole class at the start of term.</p>
      </div>
      <Card>
        <CardBody className="p-5 sm:p-6">
          <ImportWizard schoolName={school.name} schoolCode={school.code} siteUrl={siteUrl} />
        </CardBody>
      </Card>
    </div>
  );
}
