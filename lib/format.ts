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
