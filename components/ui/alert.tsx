import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icons } from "./icons";

type Tone = "info" | "success" | "warning" | "danger";

const tones: Record<Tone, { box: string; icon: keyof typeof Icons; label: string }> = {
  info: { box: "border-info/30 bg-info-soft text-info", icon: "info", label: "Information" },
  success: { box: "border-success/30 bg-success-soft text-success", icon: "check", label: "Success" },
  warning: { box: "border-warning/30 bg-warning-soft text-warning", icon: "alert", label: "Warning" },
  danger: { box: "border-danger/30 bg-danger-soft text-danger", icon: "alert", label: "Error" },
};

/**
 * Status message. Meaning is conveyed by icon + title + text, never colour alone.
 * Errors use role="alert" so screen readers announce them immediately.
 */
export function Alert({
  tone = "info",
  title,
  children,
  className,
  id,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  id?: string;
}) {
  const t = tones[tone];
  const Icon = Icons[t.icon];
  return (
    <div
      id={id}
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-lg border px-4 py-3 text-sm", t.box, className)}
    >
      <Icon className="mt-0.5 shrink-0" />
      <div className="min-w-0 space-y-1">
        <p className="font-semibold">
          <span className="sr-only">{t.label}: </span>
          {title ?? t.label}
        </p>
        {children ? <div className="text-foreground/80">{children}</div> : null}
      </div>
    </div>
  );
}
