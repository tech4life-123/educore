export function fullName(person: { first_name: string; middle_name?: string | null; last_name: string }): string {
  return [person.first_name, person.middle_name, person.last_name].filter(Boolean).join(" ");
}

const SCHOOL_TYPE_LABELS: Record<string, string> = {
  high_school: "High school",
  junior_high: "Junior high school",
  elementary: "Elementary school",
  university: "University",
  college: "College",
  vocational: "Vocational institution",
  other: "Educational institution",
};

export function schoolTypeLabel(type: string): string {
  return SCHOOL_TYPE_LABELS[type] ?? SCHOOL_TYPE_LABELS.other;
}

export function locationLine(school: { city: string | null; county: string | null; country: string }): string {
  return [school.city, school.county, school.country].filter(Boolean).join(", ");
}

/** "2026-09-01" → "1 Sep 2026". Dates are calendar dates; format in UTC so they never shift by a day. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function dateRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start && !end) return "Dates not set";
  return `${formatDate(start)} – ${formatDate(end)}`;
}
