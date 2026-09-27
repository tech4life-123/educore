import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { AttendanceSummary } from "@/lib/attendance";

export function RateBadge({ summary, threshold }: { summary: AttendanceSummary; threshold: number }) {
  if (summary.rate === null) return <Badge>No records yet</Badge>;
  const rate = Math.round(summary.rate);
  return <Badge tone={rate >= threshold ? "success" : "danger"}>{rate}% attendance</Badge>;
}

function Tile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

export function SummaryTiles({ summary }: { summary: AttendanceSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 px-5 py-4 sm:grid-cols-5">
      <Tile label="Days recorded" value={summary.days} />
      <Tile label="Present" value={summary.present} />
      <Tile label="Absent" value={summary.absent} />
      <Tile label="Late" value={summary.late} />
      <Tile label="Excused" value={summary.excused} />
    </div>
  );
}
