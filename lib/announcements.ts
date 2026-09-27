/** Announcement helpers (pure). */

export type Audience = "everyone" | "staff" | "students" | "parents" | "class";

export const AUDIENCE_LABELS: Record<Audience, string> = {
  everyone: "Everyone",
  staff: "Staff",
  students: "Students",
  parents: "Parents & guardians",
  class: "One class",
};

/** Minutes the time zone is ahead of UTC at a given instant. */
function offsetMinutes(timeZone: string, at: Date): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    return Math.round((asUtc - at.getTime()) / 60000);
  } catch {
    return 0;
  }
}

/** "2026-10-01T08:30" in the school's time zone → ISO instant. */
export function zonedLocalToIso(local: string, timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const guess = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  if (Number.isNaN(guess.getTime())) return null;
  return new Date(guess.getTime() - offsetMinutes(timeZone, guess) * 60000).toISOString();
}

/** ISO instant → "2026-10-01T08:30" in the school's time zone (for datetime-local inputs). */
export function isoToZonedLocal(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const shifted = new Date(d.getTime() + offsetMinutes(timeZone, d) * 60000);
  return shifted.toISOString().slice(0, 16);
}

export function formatDateTime(iso: string, timeZone: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      timeZone,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}
