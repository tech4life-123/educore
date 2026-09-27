/**
 * Report card assembly (pure — no I/O).
 *
 * Builds each student's card for one semester from the class's raw grade
 * data, using ONLY published grading periods, then ranks the class.
 *
 * Ranking ("5th of 42"):
 *   basis = the semester average once every period of the semester is
 *           published, otherwise the overall average of the latest published
 *           period. Students with no grade on that basis are not ranked.
 *   Standard competition ranking on values rounded to 2 decimals (ties share
 *   a place: 1, 2, 2, 4).
 *
 * Promotion (final semester only, once a yearly average exists):
 *   promoted when the overall yearly average ≥ the passing score.
 */

import {
  roundGrade,
  semesterAverage,
  studentPeriodGrade,
  yearlyAverage,
  type GradeCategory,
  type RawAssessment,
  type RawScore,
} from "./compute";

export interface CardPeriod {
  id: string;
  name: string;
  kind: "marking_period" | "exam";
  published: boolean;
}
export interface CardTerm {
  id: string;
  name: string;
  sequence: number;
  periods: CardPeriod[];
  startsOn?: string | null;
  endsOn?: string | null;
}
export interface CardSubjectInput {
  classSubjectId: string;
  name: string;
  code: string;
  teacher: string | null;
}

export interface ReportCardData {
  version: 1;
  student: { name: string; login: string };
  className: string;
  gradeName: string | null;
  yearName: string;
  term: { id: string; name: string; sequence: number; isFinal: boolean };
  periods: CardPeriod[];
  subjects: {
    name: string;
    code: string;
    teacher: string | null;
    grades: (number | null)[];
    semesterAverage: number | null;
    previousSemesterAverage?: number | null;
    yearlyAverage?: number | null;
  }[];
  overall: {
    periods: (number | null)[];
    semester: number | null;
    previousSemester?: number | null;
    yearly?: number | null;
  };
  previousTermName?: string;
  rank: { basis: string; position: number | null; of: number };
  yearlyRank?: { position: number | null; of: number };
  promotion?: "promoted" | "not_promoted" | null;
  passingScore: number;
  examWeight: number;
  /** Attendance over the semester's dates (added when issuing). */
  attendance?: { present: number; absent: number; late: number; excused: number; days: number; rate: number | null };
  attendanceThreshold?: number;
}

const round2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

function mean(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null).map(roundGrade);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Standard competition ranking; null values are unranked. */
export function competitionRank(values: Map<string, number | null>): Map<string, number | null> {
  const ranked = [...values.entries()]
    .filter((e): e is [string, number] => e[1] !== null)
    .map(([id, v]) => [id, Math.round(v * 100) / 100] as const)
    .sort((a, b) => b[1] - a[1]);
  const result = new Map<string, number | null>();
  ranked.forEach(([id, v], i) => {
    const prev = ranked[i - 1];
    result.set(id, prev && prev[1] === v ? result.get(prev[0])! : i + 1);
  });
  for (const id of values.keys()) if (!result.has(id)) result.set(id, null);
  return result;
}

function termGrades(
  term: CardTerm,
  studentId: string,
  assessments: RawAssessment[],
  scores: RawScore[],
  categories: GradeCategory[],
  examWeight: number,
) {
  const grades = term.periods.map((p) =>
    p.published ? studentPeriodGrade({ id: p.id, kind: p.kind }, studentId, assessments, scores, categories) : null,
  );
  const marking = term.periods.map((p, i) => (p.kind === "marking_period" ? grades[i] : undefined)).filter((g) => g !== undefined);
  const examIndex = term.periods.map((p) => p.kind).lastIndexOf("exam");
  const exam = examIndex >= 0 ? grades[examIndex] : null;
  const allPublished = term.periods.length > 0 && term.periods.every((p) => p.published);
  return { grades, average: allPublished ? semesterAverage(marking as (number | null)[], exam, examWeight) : null };
}

export interface BuildInput {
  className: string;
  gradeName: string | null;
  yearName: string;
  terms: CardTerm[]; // all semesters of the year, in order
  termId: string; // the semester being issued
  subjects: CardSubjectInput[];
  students: { id: string; name: string; login: string }[];
  assessments: (RawAssessment & { class_subject_id: string })[];
  scores: RawScore[];
  categories: GradeCategory[];
  passingScore: number;
  examWeight: number;
}

export function buildReportCards(input: BuildInput): Map<string, ReportCardData> {
  const termIndex = input.terms.findIndex((t) => t.id === input.termId);
  const term = input.terms[termIndex];
  if (!term) throw new Error("Unknown semester");
  const isFinal = termIndex === input.terms.length - 1 && input.terms.length > 1;
  const previous = isFinal ? input.terms[termIndex - 1] : undefined;

  const bySubject = new Map(input.subjects.map((s) => [s.classSubjectId, input.assessments.filter((a) => a.class_subject_id === s.classSubjectId)]));
  const allPublished = term.periods.length > 0 && term.periods.every((p) => p.published);
  const lastPublishedIndex = term.periods.map((p) => p.published).lastIndexOf(true);
  const basis = allPublished ? `${term.name} average` : lastPublishedIndex >= 0 ? term.periods[lastPublishedIndex].name : term.name;

  const cards = new Map<string, ReportCardData>();
  const basisValues = new Map<string, number | null>();
  const yearlyValues = new Map<string, number | null>();

  for (const student of input.students) {
    const subjects = input.subjects.map((s) => {
      const assessments = bySubject.get(s.classSubjectId) ?? [];
      const current = termGrades(term, student.id, assessments, input.scores, input.categories, input.examWeight);
      const row: ReportCardData["subjects"][number] = {
        name: s.name,
        code: s.code,
        teacher: s.teacher,
        grades: current.grades.map(round2),
        semesterAverage: round2(current.average),
      };
      if (previous) {
        const prev = termGrades(previous, student.id, assessments, input.scores, input.categories, input.examWeight);
        row.previousSemesterAverage = round2(prev.average);
        row.yearlyAverage = round2(yearlyAverage([prev.average, current.average]));
      }
      return row;
    });

    const overall: ReportCardData["overall"] = {
      periods: term.periods.map((_, i) => round2(mean(subjects.map((s) => s.grades[i])))),
      semester: round2(allPublished && subjects.every((s) => s.semesterAverage !== null) ? mean(subjects.map((s) => s.semesterAverage)) : null),
    };
    if (previous) {
      overall.previousSemester = round2(
        subjects.length && subjects.every((s) => s.previousSemesterAverage != null) ? mean(subjects.map((s) => s.previousSemesterAverage ?? null)) : null,
      );
      overall.yearly = round2(
        subjects.length && subjects.every((s) => s.yearlyAverage != null) ? mean(subjects.map((s) => s.yearlyAverage ?? null)) : null,
      );
    }

    basisValues.set(student.id, allPublished ? overall.semester : lastPublishedIndex >= 0 ? overall.periods[lastPublishedIndex] : null);
    if (previous) yearlyValues.set(student.id, overall.yearly ?? null);

    cards.set(student.id, {
      version: 1,
      student: { name: student.name, login: student.login },
      className: input.className,
      gradeName: input.gradeName,
      yearName: input.yearName,
      term: { id: term.id, name: term.name, sequence: term.sequence, isFinal },
      periods: term.periods,
      subjects,
      overall,
      previousTermName: previous?.name,
      rank: { basis, position: null, of: 0 },
      promotion: previous
        ? overall.yearly == null
          ? null
          : roundGrade(overall.yearly) >= input.passingScore
            ? "promoted"
            : "not_promoted"
        : undefined,
      passingScore: input.passingScore,
      examWeight: input.examWeight,
    });
  }

  const ranks = competitionRank(basisValues);
  const rankedCount = [...ranks.values()].filter((r) => r !== null).length;
  const yearlyRanks = previous ? competitionRank(yearlyValues) : null;
  const yearlyCount = yearlyRanks ? [...yearlyRanks.values()].filter((r) => r !== null).length : 0;
  for (const [id, card] of cards) {
    card.rank = { basis, position: ranks.get(id) ?? null, of: rankedCount };
    if (yearlyRanks) card.yearlyRank = { position: yearlyRanks.get(id) ?? null, of: yearlyCount };
  }
  return cards;
}

/** The value stored in report_cards.average (the ranking basis). */
export function cardAverage(card: ReportCardData): number | null {
  if (card.overall.semester !== null) return card.overall.semester;
  const lastPublished = card.periods.map((p) => p.published).lastIndexOf(true);
  return lastPublished >= 0 ? card.overall.periods[lastPublished] : null;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
