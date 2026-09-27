import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EduCoreLogo } from "@/components/brand/educore-logo";
import { Card, CardBody } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { getAuthContext, requireUser } from "@/services/auth";
import { signOut } from "@/app/(auth)/login/actions";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ChangePasswordPage() {
  await requireUser("/change-password");
  const context = await getAuthContext();
  if (context.status !== "ok" && context.status !== "platform") redirect("/account");

  const forced = context.profile.must_change_password;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <EduCoreLogo />
        </div>
        <Card>
          <CardBody className="space-y-6 p-6 sm:p-8">
            <div className="space-y-1 text-center">
              <h1 className="text-xl font-semibold text-foreground">
                {forced ? `Welcome, ${context.profile.first_name}` : "Change your password"}
              </h1>
              <p className="text-sm text-muted">
                {forced
                  ? "You signed in with a temporary password. Choose your own password to continue."
                  : "Choose a new password for your account."}
              </p>
            </div>
            <ChangePasswordForm />
          </CardBody>
        </Card>
        <form action={signOut} className="mt-6 flex justify-center">
          <SubmitButton variant="ghost" size="sm" loadingText="Signing out…">
            Sign out instead
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
