import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { currentSiteUrl } from "@/lib/site-url";
import { requireSuperAdmin } from "@/services/auth";
import { NewSchoolForm } from "./new-school-form";

export const metadata: Metadata = { title: "New school" };

export default async function NewSchoolPage() {
  await requireSuperAdmin();
  const siteUrl = await currentSiteUrl();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="print:hidden">
        <Link href="/platform" className="text-sm font-medium text-muted hover:text-foreground">
          ← Schools
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Add a school</h1>
        <p className="mt-1 text-sm text-muted">Creates the school and its first administrator account.</p>
      </div>
      <Card>
        <CardBody className="p-5 sm:p-6">
          <NewSchoolForm siteUrl={siteUrl} />
        </CardBody>
      </Card>
    </div>
  );
}
