import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { currentSiteUrl } from "@/lib/site-url";
import { getCurrentAcademicYear } from "@/services/academics";
import { requireCapability } from "@/services/auth";
import { listClasses } from "@/services/classes";
import { ResetWizard } from "./reset-wizard";

export const metadata: Metadata = { title: "Reset passwords" };

// Resetting up to 200 accounts can take a while.
export const maxDuration = 60;

export default async function BulkResetPage() {
  const { school } = await requireCapability("users.manage", "/users/reset");
  const [siteUrl, year] = await Promise.all([currentSiteUrl(), getCurrentAcademicYear(school.id)]);
  const classes = year ? await listClasses(school.id, year.id) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="print:hidden">
        <Link href="/users" className="text-sm font-medium text-muted hover:text-foreground">
          ← User accounts
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Reset passwords for a group</h1>
        <p className="mt-1 text-sm text-muted">
          Lost the login slips? Give a whole class or role new one-time passwords and print fresh slips.
        </p>
      </div>
      <Card>
        <CardBody className="p-5 sm:p-6">
          <ResetWizard
            classes={classes.map((c) => ({ id: c.id, name: c.name }))}
            schoolName={school.name}
            schoolCode={school.code}
            siteUrl={siteUrl}
          />
        </CardBody>
      </Card>
    </div>
  );
}
