import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { currentSiteUrl } from "@/lib/site-url";
import { requireCapability } from "@/services/auth";
import { getSchoolSettings } from "@/services/school";
import { NewUserForm } from "./new-user-form";

export const metadata: Metadata = { title: "Add user" };

export default async function NewUserPage() {
  const { school } = await requireCapability("users.manage", "/users/new");
  const [settings, siteUrl] = await Promise.all([getSchoolSettings(school.id), currentSiteUrl()]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/users" className="text-sm font-medium text-muted hover:text-foreground print:hidden">
          ← User accounts
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Add a user</h1>
        <p className="mt-1 text-sm text-muted">
          Creates a login for {school.name}. You’ll get a one-time password to hand over.
        </p>
      </div>
      <Card>
        <CardBody className="p-5 sm:p-6">
          <NewUserForm
            schoolCode={school.code}
            schoolName={school.name}
            siteUrl={siteUrl}
            parentsAllowed={settings?.allow_parent_accounts ?? false}
          />
        </CardBody>
      </Card>
    </div>
  );
}
