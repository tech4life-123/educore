/**
 * School report assembly (pure — no I/O).
 *
 * Inputs are what the school has already recorded: the year's students and
 * classes, the report cards issued for one semester, and attendance counts.
 *
 * Rules
 *   attendance rate   (present + late) ÷ (present + late + absent); excused days don't count
 *   student result    the report card's average (its ranking basis)
 *   subject result    the subject's semester average when the semester is complete,
 *                     otherwise its latest published period grade
 *   passing           round(result) ≥ the school's passing score (as on report cards)
 *   attendance watch  rate below the school's threshold, once at least
 *                     MIN_DAYS_FOR_WATCH days are counted (avoids flagging a
 *                     student over one absence in the first week)
 */

import { roundGrade } from "./grades/compute";

export const MIN_DAYS_FOR_WATCH = 5;

export interface ReportStudent {
  id: string;
  name: string;
  classId: string | null;
  className: string | null;
  gender: string | null;
  admissionNumber: string | null;
}

export interface ReportClass {
  id: string;
  name: string;
}

export interface CardSubject {
  name: string;
  code: string;
  grades: (number | null)[];
  semesterAverage: number | null;
}

export interface ReportCardInput {
  id: string;
  studentId: string;
  classId: string;
  average: number | null;
  subjects: CardSubject[];
}

export interface AttendanceCounts {
  present: number;
  late: number;
  absent: number;
  excused: number;
}

export interface MonthCounts extends AttendanceCounts {
  classId: string;
  month: string; // YYYY-MM-01
}

export interface Group {
  students: number;
  attendance: AttendanceCounts;
  attendanceRate: number | null;
  graded: number;
  passed: number;
  passRate: number | null;
  mean: number | null;
}

export interface ClassRow extends Group {
  id: string;
  name: string;
  top: { name: string; average: number } | null;
}

export interface SubjectRow {
  name: string;
  code: string;
  graded: number;
  passed: number;
  passRate: number | null;
  mean: number | null;
  highest: number | null;
  lowest: number | null;
}

export interface MonthRow extends AttendanceCounts {
  month: string;
  rate: number | null;
}

export interface WatchRow {
  student: ReportStudent;
  average: number | null;
  cardId: string | null;
  attendance: AttendanceCounts & { rate: number | null; days: number };
  failing: boolean;
  lowAttendance: boolean;
}

export interface SchoolReport {
  overall: Group;
  female: Group;
  male: Group;
  classes: ClassRow[];
  subjects: SubjectRow[];
  months: MonthRow[];
  watch: WatchRow[];
  perStudent: WatchRow[];
}

const zeroCounts = (): AttendanceCounts => ({ present: 0, late: 0, absent: 0, excused: 0 });

function addCounts(into: AttendanceCounts, c: AttendanceCounts | undefined) {
  if (!c) return;
  into.present += c.present;
  into.late += c.late;
  into.absent += c.absent;
  into.excused += c.excused;
}

export function rateOf(c: AttendanceCounts): number | null {
  const counted = c.present + c.late + c.absent;
  return counted === 0 ? null : ((c.present + c.late) / counted) * 100;
}

const passes = (value: number, passingScore: number) => roundGrade(value) >= passingScore;

/** The subject figure used for this semester (see header). */
export function subjectResult(s: CardSubject): number | null {
  if (s.semesterAverage !== null && s.semesterAverage !== undefined) return s.semesterAverage;
  for (let i = s.grades.length - 1; i >= 0; i--) if (s.grades[i] !== null && s.grades[i] !== undefined) return s.grades[i];
  return null;
}

function group(
  students: ReportStudent[],
  cardOf: Map<string, ReportCardInput>,
  attendanceOf: Map<string, AttendanceCounts>,
  passingScore: number,
): Group {
  const attendance = zeroCounts();
  let graded = 0;
  let passed = 0;
  let sum = 0;
  for (const s of students) {
    addCounts(attendance, attendanceOf.get(s.id));
    const avg = cardOf.get(s.id)?.average;
    if (avg !== null && avg !== undefined) {
      graded += 1;
      sum += avg;
      if (passes(avg, passingScore)) passed += 1;
    }
  }
  return {
    students: students.length,
    attendance,
    attendanceRate: rateOf(attendance),
    graded,
    passed,
    passRate: graded ? (passed / graded) * 100 : null,
    mean: graded ? sum / graded : null,
  };
}

export function buildSchoolReport(input: {
  students: ReportStudent[];
  classes: ReportClass[];
  cards: ReportCardInput[];
  attendanceByStudent: Map<string, AttendanceCounts>;
  attendanceByMonth: MonthCounts[];
  passingScore: number;
  attendanceThreshold: number;
}): SchoolReport {
  const { students, passingScore } = input;
  const cardOf = new Map(input.cards.map((c) => [c.studentId, c]));
  const att = input.attendanceByStudent;

  // Classes
  const classes: ClassRow[] = input.classes.map((c) => {
    const members = students.filter((s) => s.classId === c.id);
    let top: ClassRow["top"] = null;
    for (const m of members) {
      const avg = cardOf.get(m.id)?.average;
      if (avg !== null && avg !== undefined && (!top || avg > top.average)) top = { name: m.name, average: avg };
    }
    return { id: c.id, name: c.name, ...group(members, cardOf, att, passingScore), top };
  });

  // Subjects (from the semester's issued cards)
  const bySubject = new Map<string, { name: string; code: string; values: number[] }>();
  for (const card of input.cards) {
    for (const s of card.subjects) {
      const v = subjectResult(s);
      if (v === null) continue;
      const key = (s.code || s.name).toUpperCase();
      const entry = bySubject.get(key) ?? { name: s.name, code: s.code, values: [] };
      entry.values.push(v);
      bySubject.set(key, entry);
    }
  }
  const subjects: SubjectRow[] = [...bySubject.values()]
    .map((e) => {
      const passed = e.values.filter((v) => passes(v, passingScore)).length;
      return {
        name: e.name,
        code: e.code,
        graded: e.values.length,
        passed,
        passRate: (passed / e.values.length) * 100,
        mean: e.values.reduce((a, b) => a + b, 0) / e.values.length,
        highest: Math.max(...e.values),
        lowest: Math.min(...e.values),
      };
    })
    .sort((a, b) => (a.passRate ?? 0) - (b.passRate ?? 0) || a.name.localeCompare(b.name));

  // Months (whole school)
  const monthMap = new Map<string, AttendanceCounts>();
  for (const m of input.attendanceByMonth) {
    const key = m.month.slice(0, 7);
    const entry = monthMap.get(key) ?? zeroCounts();
    addCounts(entry, m);
    monthMap.set(key, entry);
  }
  const months: MonthRow[] = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, c]) => ({ month, ...c, rate: rateOf(c) }));

  // Per student, and the watch list
  const perStudent: WatchRow[] = students.map((s) => {
    const card = cardOf.get(s.id);
    const c = att.get(s.id) ?? zeroCounts();
    const days = c.present + c.late + c.absent;
    const rate = rateOf(c);
    const average = card?.average ?? null;
    return {
      student: s,
      average,
      cardId: card?.id ?? null,
      attendance: { ...c, rate, days },
      failing: average !== null && !passes(average, passingScore),
      lowAttendance: rate !== null && days >= MIN_DAYS_FOR_WATCH && roundGrade(rate) < input.attendanceThreshold,
    };
  });
  const severity = (w: WatchRow) => (w.failing && w.lowAttendance ? 0 : w.failing ? 1 : 2);
  const watch = perStudent
    .filter((w) => w.failing || w.lowAttendance)
    .sort(
      (a, b) =>
        severity(a) - severity(b) ||
        (a.average ?? 101) - (b.average ?? 101) ||
        (a.attendance.rate ?? 101) - (b.attendance.rate ?? 101) ||
        a.student.name.localeCompare(b.student.name),
    );

  return {
    overall: group(students, cardOf, att, passingScore),
    female: group(students.filter((s) => s.gender === "female"), cardOf, att, passingScore),
    male: group(students.filter((s) => s.gender === "male"), cardOf, att, passingScore),
    classes,
    subjects,
    months,
    watch,
    perStudent,
  };
}

/** "Sep 2026", or "Sep 26" when short. */
export function monthLabel(month: string, short = false): string {
  return new Date(`${month.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: short ? "2-digit" : "numeric",
    timeZone: "UTC",
  });
}
