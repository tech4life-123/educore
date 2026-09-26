import Image from "next/image";
import { cn } from "@/lib/cn";
import { initialsFor } from "@/lib/branding";

const sizes = { sm: 32, md: 40, lg: 56 } as const;

function isOptimizableHost(url: string): boolean {
  try {
    const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : null;
    return new URL(url).hostname === supabaseHost;
  } catch {
    return false;
  }
}

/**
 * School logo with a professional fallback (initials on the school's brand
 * colour) when no logo is configured. Logos stored in Supabase Storage are
 * optimised by next/image.
 */
export function SchoolLogo({
  name,
  logoUrl,
  size = "md",
  className,
}: {
  name: string;
  logoUrl: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const px = sizes[size];

  if (logoUrl && isOptimizableHost(logoUrl)) {
    return (
      <Image
        src={logoUrl}
        alt={`${name} logo`}
        width={px}
        height={px}
        className={cn("shrink-0 rounded-lg bg-surface object-contain", className)}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={`${name} logo`}
      style={{ width: px, height: px }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-brand font-semibold text-brand-foreground",
        size === "lg" ? "text-lg" : "text-sm",
        className,
      )}
    >
      {initialsFor(name)}
    </span>
  );
}
