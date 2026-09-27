/**
 * Cross-school statistics helpers (pure — no I/O).
 *
 * The database returns one row of counts per school. Rates are always
 * recomputed from summed counts (never averaged across schools), so a large
 * school weighs more than a small one — the figure a Ministry expects.
 *
 *   attendance rate = (present + late) ÷ (present + late + absent); excused days don't count
 *   pass rate       = students passing on their latest report card ÷ students with one
 */

export type SchoolStatus = "pending" | "active" | "suspended" | "archived";

export const STATUS_LABEL: Record<SchoolStatus, string> = {
  active: "Active",
  pending: "Pending",
  suspended: "Suspended",
  archived: "Archived",
};

export const STATUS_TONE: Record<SchoolStatus, "success" | "warning" | "danger" | "neutral"> = {
  active: "success",
  pending: "warning",
  suspended: "danger",
  archived: "neutral",
};

export interface StatCounts {
  students: number;
  female: number;
  male: number;
  enrolled: number;
  teachers: number;
  admins: number;
  classes: number;
  att_present: number;
  att_late: number;
  att_absent: number;
  att_excused: number;
  graded_students: number;
  passed: number;
}

export interface StatRow extends StatCounts {
  county: string | null;
  status: SchoolStatus;
}

export interface CountyStats extends StatCounts {
  county: string;
  schools: number;
}

const COUNT_KEYS: (keyof StatCounts)[] = [
  "students",
  "female",
  "male",
  "enrolled",
  "teachers",
  "admins",
  "classes",
  "att_present",
  "att_late",
  "att_absent",
  "att_excused",
  "graded_students",
  "passed",
];

export const NO_COUNTY = "County not set";

function zero(): StatCounts {
  return Object.fromEntries(COUNT_KEYS.map((k) => [k, 0])) as unknown as StatCounts;
}

function add(into: StatCounts, row: StatCounts) {
  for (const k of COUNT_KEYS) into[k] += Number(row[k]) || 0;
}

/** Sum of every count over the given rows. */
export function totals(rows: StatCounts[]): StatCounts {
  const t = zero();
  rows.forEach((r) => add(t, r));
  return t;
}

/** One entry per county (alphabetical, "County not set" last). */
export function byCounty(rows: StatRow[]): CountyStats[] {
  const map = new Map<string, CountyStats>();
  for (const r of rows) {
    const county = r.county?.trim() || NO_COUNTY;
    const entry = map.get(county) ?? { county, schools: 0, ...zero() };
    entry.schools += 1;
    add(entry, r);
    map.set(county, entry);
  }
  return [...map.values()].sort((a, b) =>
    a.county === NO_COUNTY ? 1 : b.county === NO_COUNTY ? -1 : a.county.localeCompare(b.county),
  );
}

/** Percentage 0–100, or null when there is nothing recorded yet. */
export function attendanceRate(c: Pick<StatCounts, "att_present" | "att_late" | "att_absent">): number | null {
  const attended = c.att_present + c.att_late;
  const days = attended + c.att_absent;
  return days === 0 ? null : (attended / days) * 100;
}

export function passRate(c: Pick<StatCounts, "graded_students" | "passed">): number | null {
  return c.graded_students === 0 ? null : (c.passed / c.graded_students) * 100;
}

/** Share of girls among students whose gender is recorded. */
export function femaleShare(c: Pick<StatCounts, "female" | "male">): number | null {
  const known = c.female + c.male;
  return known === 0 ? null : (c.female / known) * 100;
}

/** Students per teacher, one decimal. */
export function studentTeacherRatio(c: Pick<StatCounts, "students" | "teachers">): string {
  return c.teachers === 0 ? "—" : `${(c.students / c.teachers).toFixed(1)} : 1`;
}

export function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

export function whole(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Schools counted in the statistics: active ones, with demonstration schools
 * (fictional data) included unless `includeDemo` is false.
 */
export function countedSchools<T extends { status: SchoolStatus; is_demo: boolean }>(rows: T[], includeDemo: boolean): T[] {
  return rows.filter((r) => r.status === "active" && (includeDemo || !r.is_demo));
}

/** `?demo=exclude` leaves demonstration schools out. */
export function includeDemoParam(value: string | string[] | undefined | null): boolean {
  return (Array.isArray(value) ? value[0] : value) !== "exclude";
}
