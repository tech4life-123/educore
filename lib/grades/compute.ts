/**
 * Grade calculations (pure functions — no I/O, safe on server and client).
 *
 * Marking period grade
 *   Scores are grouped by category. Each category's percentage is
 *   (points earned ÷ points possible) × 100. The period grade is the average
 *   of those percentages weighted by the categories' weights, using only the
 *   categories that have at least one scored assessment — so a period with
 *   no project yet isn't dragged down by an empty "Projects" category.
 *   If every category in use has weight 0, all points count equally.
 *
 * Exam grade
 *   Points earned ÷ points possible across the exam period's assessments.
 *
 * Liberian semester average (school_settings.exam_weight, default 50%)
 *   (average of the marking-period grades) × (1 − w) + exam × w
 *   Period grades are rounded to whole numbers first, as on a report card.
 *
 * Yearly average: average of the two semester averages.
 *
 * Missing scores are "not graded yet" and are left out; excused scores are
 * left out; a score of 0 counts.
 */

export interface GradeCategory {
  id: string;
  weight: number;
}
export interface GradeAssessment {
  id: string;
  categoryId: string | null;
  maxScore: number;
}
export interface GradeScore {
  assessmentId: string;
  score: number | null;
  isExcused: boolean;
}

/** Round half up to a whole number (tolerant of floating-point noise). */
export function roundGrade(value: number): number {
  return Math.round(value + 1e-9);
}

function scoredPairs(assessments: GradeAssessment[], scores: GradeScore[]) {
  const byAssessment = new Map(scores.map((s) => [s.assessmentId, s]));
  const pairs: { assessment: GradeAssessment; score: number }[] = [];
  for (const assessment of assessments) {
    const s = byAssessment.get(assessment.id);
    if (!s || s.isExcused || s.score === null || !(assessment.maxScore > 0)) continue;
    pairs.push({ assessment, score: s.score });
  }
  return pairs;
}

/** Exam (points-based) grade, or null when nothing is scored. */
export function examGrade(assessments: GradeAssessment[], scores: GradeScore[]): number | null {
  const pairs = scoredPairs(assessments, scores);
  const possible = pairs.reduce((n, p) => n + p.assessment.maxScore, 0);
  if (possible === 0) return null;
  const earned = pairs.reduce((n, p) => n + p.score, 0);
  return (earned / possible) * 100;
}

/** Category-weighted marking-period grade, or null when nothing is scored. */
export function markingPeriodGrade(
  assessments: GradeAssessment[],
  scores: GradeScore[],
  categories: GradeCategory[],
): number | null {
  const pairs = scoredPairs(assessments, scores);
  if (pairs.length === 0) return null;

  const weights = new Map(categories.map((c) => [c.id, Math.max(0, c.weight)]));
  const buckets = new Map<string, { earned: number; possible: number }>();
  for (const { assessment, score } of pairs) {
    const key = assessment.categoryId ?? "__none__";
    const b = buckets.get(key) ?? { earned: 0, possible: 0 };
    b.earned += score;
    b.possible += assessment.maxScore;
    buckets.set(key, b);
  }

  let weighted = 0;
  let totalWeight = 0;
  for (const [key, b] of buckets) {
    const w = weights.get(key) ?? 0;
    if (w <= 0) continue;
    weighted += w * ((b.earned / b.possible) * 100);
    totalWeight += w;
  }
  if (totalWeight > 0) return weighted / totalWeight;

  // No weighted category in use: fall back to all points counting equally.
  return examGrade(pairs.map((p) => p.assessment), pairs.map((p) => ({ assessmentId: p.assessment.id, score: p.score, isExcused: false })));
}

/**
 * Liberian semester average. Needs at least one marking-period grade and the
 * exam grade; otherwise null (shown as "—" until complete).
 */
export function semesterAverage(periodGrades: (number | null)[], exam: number | null, examWeightPercent: number): number | null {
  const graded = periodGrades.filter((g): g is number => g !== null).map(roundGrade);
  if (graded.length === 0 || exam === null) return null;
  const w = Math.min(Math.max(examWeightPercent, 0), 100) / 100;
  const periodsAvg = graded.reduce((n, g) => n + g, 0) / graded.length;
  return periodsAvg * (1 - w) + roundGrade(exam) * w;
}

/** Yearly average: mean of the semester averages, only when all are available. */
export function yearlyAverage(semesterAverages: (number | null)[]): number | null {
  if (semesterAverages.length === 0 || semesterAverages.some((s) => s === null)) return null;
  const values = (semesterAverages as number[]).map(roundGrade);
  return values.reduce((n, g) => n + g, 0) / values.length;
}

export function isPassing(grade: number | null, passingScore: number): boolean | null {
  if (grade === null) return null;
  return roundGrade(grade) >= passingScore;
}

/** "84" or "—". */
export function formatGrade(grade: number | null): string {
  return grade === null ? "—" : String(roundGrade(grade));
}

// ---------------------------------------------------------------------------
// Helpers over raw rows
// ---------------------------------------------------------------------------

export interface RawAssessment {
  id: string;
  category_id: string | null;
  max_score: number;
  grading_period_id: string;
}
export interface RawScore {
  assessment_id: string;
  student_id: string;
  score: number | null;
  is_excused: boolean;
}

/** One student's grade for one grading period (marking period or exam). */
export function studentPeriodGrade(
  period: { id: string; kind: "marking_period" | "exam" },
  studentId: string,
  assessments: RawAssessment[],
  scores: RawScore[],
  categories: GradeCategory[],
): number | null {
  const inPeriod = assessments
    .filter((a) => a.grading_period_id === period.id)
    .map((a) => ({ id: a.id, categoryId: a.category_id, maxScore: a.max_score }));
  if (inPeriod.length === 0) return null;
  const ids = new Set(inPeriod.map((a) => a.id));
  const own = scores
    .filter((s) => s.student_id === studentId && ids.has(s.assessment_id))
    .map((s) => ({ assessmentId: s.assessment_id, score: s.score, isExcused: s.is_excused }));
  return period.kind === "exam" ? examGrade(inPeriod, own) : markingPeriodGrade(inPeriod, own, categories);
}

/** Period grades, exam and semester average for one term (semester). */
export function studentTermSummary(
  term: { grading_periods: { id: string; kind: "marking_period" | "exam" }[] },
  studentId: string,
  assessments: RawAssessment[],
  scores: RawScore[],
  categories: GradeCategory[],
  examWeight: number,
) {
  const periods = term.grading_periods.map((p) => ({
    periodId: p.id,
    kind: p.kind,
    grade: studentPeriodGrade(p, studentId, assessments, scores, categories),
  }));
  const marking = periods.filter((p) => p.kind === "marking_period").map((p) => p.grade);
  const exams = periods.filter((p) => p.kind === "exam").map((p) => p.grade);
  const exam = exams.length ? exams[exams.length - 1] : null;
  return { periods, average: semesterAverage(marking, exam, examWeight) };
}
