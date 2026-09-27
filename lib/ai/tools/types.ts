/**
 * EduCore AI data tools — shared types (pure).
 *
 * Every tool:
 *   1. is offered only to the roles listed in `roles`,
 *   2. re-checks the caller's role and scope itself before reading anything
 *      (a student → own records; a parent → linked children; a teacher →
 *      classes they teach; an admin → their school; super admin → platform
 *      totals only),
 *   3. reads through `EduCoreData`, whose production implementation uses the
 *      caller's OWN Supabase session — so Row Level Security applies as a
 *      second, independent lock — and never the service-role key,
 *   4. returns compact, minimal data (no usernames, emails, birth dates or
 *      addresses).
 */

import type { AttendanceSummary } from "@/lib/attendance";
import type { ReportCardData } from "@/lib/grades/report-card";
import type { ViewerRole } from "../prompt";

export interface ToolViewer {
  profileId: string;
  role: ViewerRole;
  schoolId: string | null;
  schoolName: string | null;
  firstName: string;
}

export interface PeriodInfo {
  id: string;
  name: string;
  kind: "marking_period" | "exam";
  startsOn: string | null;
  endsOn: string | null;
  published: boolean;
}

export interface TermInfo {
  id: string;
  name: string;
  sequence: number;
  startsOn: string | null;
  endsOn: string | null;
  periods: PeriodInfo[];
}

export interface YearInfo {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  terms: TermInfo[];
}

export interface PersonRef {
  id: string;
  name: string;
  classId: string | null;
  className: string | null;
}

export interface GradeSettings {
  passingScore: number;
  examWeight: number;
  attendanceThreshold: number;
}

/** Raw inputs for the grading engine (lib/grades/compute.ts). */
export interface RawResults {
  className: string | null;
  subjects: { classSubjectId: string; name: string; code: string; teacher: string | null }[];
  assessments: { id: string; category_id: string | null; max_score: number; grading_period_id: string; class_subject_id: string }[];
  scores: { assessment_id: string; student_id: string; score: number | null; is_excused: boolean }[];
  categories: { id: string; weight: number }[];
}

export interface GradebookRaw extends RawResults {
  classSubjectId: string;
  classId: string;
  subject: string;
  teacherId: string | null;
  students: { id: string; name: string }[];
}

export interface CardLite {
  term: string;
  year: string;
  className: string;
  average: number | null;
  rank: number | null;
  classSize: number;
  issuedAt: string;
  promotion: ReportCardData["promotion"] | null;
}

export interface ClassLite {
  id: string;
  name: string;
  grade: string | null;
  homeroom: string | null;
  studentCount: number;
}

export interface ClassFull {
  id: string;
  name: string;
  grade: string | null;
  homeroom: string | null;
  homeroomId: string | null;
  students: { id: string; name: string }[];
  subjects: { classSubjectId: string; subject: string; teacherId: string | null; teacher: string | null }[];
}

export interface Assignment {
  classSubjectId: string;
  classId: string;
  className: string;
  subject: string;
}

export interface AnnouncementLite {
  title: string;
  body: string;
  publishAt: string;
  audience: string;
  className: string | null;
  pinned: boolean;
}

export interface DayRow {
  classId: string;
  className: string;
  students: number;
  summary: AttendanceSummary | null;
}

export interface SchoolPerformance {
  term: string | null;
  cardsIssued: number;
  passingScore: number;
  attendanceThreshold: number;
  teachers: number;
  overall: { students: number; attendanceRate: number | null; graded: number; passed: number; passRate: number | null; mean: number | null };
  female: { students: number; attendanceRate: number | null; passRate: number | null; mean: number | null };
  male: { students: number; attendanceRate: number | null; passRate: number | null; mean: number | null };
  classes: { id: string; name: string; students: number; attendanceRate: number | null; mean: number | null; passRate: number | null }[];
  subjects: { name: string; graded: number; mean: number | null; passRate: number | null }[];
  months: { month: string; rate: number | null }[];
  watch: { id: string; name: string; className: string | null; average: number | null; attendanceRate: number | null; failing: boolean; lowAttendance: boolean }[];
}

export interface PlatformRow {
  name: string;
  county: string | null;
  status: string;
  isDemo: boolean;
  students: number;
  female: number;
  male: number;
  teachers: number;
  classes: number;
  attPresent: number;
  attLate: number;
  attAbsent: number;
  graded: number;
  passed: number;
}

/**
 * Everything the tools may read. Production: lib/ai/tools/data.ts (the
 * caller's own Supabase session). Tests: fakes.
 */
export interface EduCoreData {
  today(): Promise<string>;
  currentYear(): Promise<YearInfo | null>;
  settings(): Promise<GradeSettings>;
  childrenOf(parentId: string, yearId: string | null): Promise<PersonRef[]>;
  studentInfo(studentId: string, yearId: string): Promise<PersonRef | null>;
  studentResults(studentId: string, yearId: string): Promise<RawResults | null>;
  studentMarks(studentId: string, from: string, to: string): Promise<{ summary: AttendanceSummary; notable: { date: string; status: string }[] }>;
  reportCards(studentId: string): Promise<CardLite[]>;
  classIdsTaughtBy(teacherId: string, yearId: string): Promise<string[]>;
  assignments(yearId: string, teacherId?: string): Promise<Assignment[]>;
  classes(yearId: string): Promise<ClassLite[]>;
  classDetail(classId: string): Promise<ClassFull | null>;
  register(classId: string, date: string): Promise<{ studentId: string; status: string }[] | null>;
  classMarks(classId: string, from: string, to: string): Promise<{ days: number; byStudent: Map<string, AttendanceSummary> }>;
  gradebook(classSubjectId: string): Promise<GradebookRaw | null>;
  findStudents(yearId: string, query: string, onlyClassIds?: string[]): Promise<PersonRef[]>;
  announcements(profileId: string, today: string): Promise<AnnouncementLite[]>;
  dayOverview(yearId: string, date: string): Promise<DayRow[]>;
  schoolPerformance(yearId: string, termId: string | null): Promise<SchoolPerformance | null>;
  platformStats(): Promise<PlatformRow[]>;
}

export interface ToolContext {
  viewer: ToolViewer;
  data: EduCoreData;
}

/** A refusal or "can't answer" the model should relay; its message is safe to show. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

export interface EduCoreTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  roles: readonly ViewerRole[];
  run(ctx: ToolContext, input: Record<string, unknown>): Promise<unknown>;
}
