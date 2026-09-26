import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EduCoreLogo } from "@/components/brand/educore-logo";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { getAuthContext, landingPathFor, requireUser } from "@/services/auth";
import { signOut } from "@/app/(auth)/login/actions";

export const metadata: Metadata = { title: "Account status" };

/**
 * Explains why a signed-in user cannot enter the app (missing profile,
 * deactivated account, suspended school, temporary error). The status is
 * always recomputed on the server — never taken from the URL.
 */
export default async function AccountStatusPage() {
  await requireUser("/account");
  const context = await getAuthContext();

  if (context.status === "ok" || context.status === "platform") {
    redirect(landingPathFor(context));
  }

  const content = (() => {
    switch (context.status) {
      case "no_profile":
        return {
          tone: "warning" as const,
          title: "Your account isn’t set up yet",
          body: "You’re signed in, but your account hasn’t been linked to a school. Please contact your school administrator.",
        };
      case "profile_inactive":
        return {
          tone: "warning" as const,
          title: "Your account is not active",
          body: "Your account has been deactivated or is awaiting activation. Please contact your school administrator.",
        };
      case "school_unavailable":
        return {
          tone: "warning" as const,
          title: "Your school is currently unavailable",
          body: "Access to your school on EduCore is paused. Please contact your school administrator.",
        };
      default:
        return {
          tone: "danger" as const,
          title: "We couldn’t load your account",
          body: "This is usually temporary. Check your connection and try again.",
        };
    }
  })();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <EduCoreLogo />
        </div>
        <Card>
          <CardBody className="space-y-5 p-6">
            <Alert tone={content.tone} title={content.title}>
              {content.body}
            </Alert>
            <div className="flex flex-wrap gap-3">
              {context.status === "error" ? (
                <ButtonLink href="/account" variant="secondary">
                  Try again
                </ButtonLink>
              ) : null}
              <form action={signOut}>
                <SubmitButton variant="secondary" loadingText="Signing out…">
                  Sign out
                </SubmitButton>
              </form>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
