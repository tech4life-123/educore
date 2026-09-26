import { cn } from "@/lib/cn";

const sizes = { sm: "size-4 border-2", md: "size-6 border-2", lg: "size-10 border-[3px]" } as const;

export function Spinner({ size = "md", className, label }: { size?: keyof typeof sizes; className?: string; label?: string }) {
  return (
    <span role={label ? "status" : undefined} className="inline-flex items-center">
      <span
        aria-hidden="true"
        className={cn("animate-spin rounded-full border-current border-r-transparent", sizes[size], className)}
      />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
