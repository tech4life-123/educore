import { cn } from "@/lib/cn";

/** EduCore platform wordmark (original mark — a stacked "core" of layers). */
export function EduCoreLogo({ className, showName = true }: { className?: string; showName?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" width={32} height={32} aria-hidden="true" focusable="false">
        <rect width="32" height="32" rx="8" fill="#1e3a8a" />
        <path d="M8 11.5 16 7l8 4.5-8 4.5-8-4.5Z" fill="#ffffff" />
        <path d="m8 16 8 4.5 8-4.5" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinejoin="round" />
        <path d="m8 20.5 8 4.5 8-4.5" fill="none" stroke="#93c5fd" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      {showName ? <span className="text-lg font-semibold tracking-tight text-foreground">EduCore</span> : <span className="sr-only">EduCore</span>}
    </span>
  );
}
