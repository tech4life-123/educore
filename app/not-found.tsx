import { EduCoreLogo } from "@/components/brand/educore-logo";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <EduCoreLogo />
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Page not found</h1>
        <p className="mt-2 text-sm text-muted">The page you’re looking for doesn’t exist or has moved.</p>
      </div>
      <ButtonLink href="/" variant="secondary">
        Go to home page
      </ButtonLink>
    </div>
  );
}
