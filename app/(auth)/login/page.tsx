import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EduCoreLogo } from "@/components/brand/educore-logo";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { safeNextPath } from "@/lib/auth/safe-redirect";
import { getAuthContext, landingPathFor } from "@/services/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(params.next) ?? undefined;

  const context = await getAuthContext();
  if (context.status === "ok" || context.status === "platform") {
    redirect(landingPathFor(context));
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex justify-center">
          <EduCoreLogo />
        </Link>

        <Card>
          <CardBody className="space-y-6 p-6 sm:p-8">
            <div className="space-y-1 text-center">
              <h1 className="text-xl font-semibold text-foreground">Sign in</h1>
              <p className="text-sm text-muted">Use the account provided by your school.</p>
            </div>

            {context.status === "not_configured" ? (
              <Alert tone="warning" title="Sign-in unavailable">
                This deployment is not connected to its database yet. Please contact the platform administrator.
              </Alert>
            ) : (
              <LoginForm next={next} />
            )}
          </CardBody>
        </Card>

        <p className="mt-6 text-center text-xs text-subtle">
          Don’t have an account? Accounts are created by your school administrator.
        </p>
      </div>
    </div>
  );
}
