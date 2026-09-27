import { Badge } from "@/components/ui/badge";
import { AUDIENCE_LABELS, type Audience } from "@/lib/announcements";

export function AudienceBadge({ audience, className }: { audience: Audience; className: string | null }) {
  return <Badge tone="neutral">{audience === "class" ? `Class ${className ?? ""}`.trim() : AUDIENCE_LABELS[audience]}</Badge>;
}
