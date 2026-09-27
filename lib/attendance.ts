/** Attendance helpers (pure — safe on server and client). */

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export const ATTENDANCE_STATUSES: readonly { value: AttendanceStatus; label: string; short: string }[] = [
  { value: "present", label: "Present", short: "P" },
  { value: "absent", label: "Absent", short: "A" },
  { value: "late", label: "Late", short: "L" },
  { value: "excused", label: "Excused", short: "E" },
];

export interface AttendanceSummary {
  present: number;
  absent: number;
  late: number;
  excused: number;
  /** Days with a mark. */
  days: number;
  /**
   * Attendance rate in % = (present + late) ÷ (present + late + absent).
   * Excused absences don't count against the student. Null when nothing counts.
   */
  rate: number | null;
}

export function summarize(statuses: Iterable<AttendanceStatus>): AttendanceSummary {
  const s = { present: 0, absent: 0, late: 0, excused: 0, days: 0 };
  for (const status of statuses) {
    s[status] += 1;
    s.days += 1;
  }
  const counted = s.present + s.late + s.absent;
  return { ...s, rate: counted ? ((s.present + s.late) / counted) * 100 : null };
}

/** Today's date (YYYY-MM-DD) in the school's time zone. */
export function todayIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Add days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function weekdayName(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
}
