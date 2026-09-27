import "server-only";

import { todayIn } from "@/lib/attendance";
import { fullName } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getAcademicYear, getCurrentAcademicYear } from "@/services/academics";
import { getClassAttendance, getDayOverview, getRegister, getStudentAttendance } from "@/services/attendance";
import { getClass, listClasses, listGuardianLinks } from "@/services/classes";
import { getGradebook, getGradingSettings, getPublishedPeriods, getStudentResults, listClassSubjectsForYear } from "@/services/grades";
import { listAnnouncements } from "@/services/announcements";
import { getPlatformStatistics } from "@/services/platform";
import { listIssuedCards } from "@/services/report-cards";
import { getSchoolReport } from "@/services/reports";
import { getSchoolProfile, getSchoolSettings } from "@/services/school";
import { classesTaughtBy, listStudents } from "@/services/students";
import type { EduCoreData, PersonRef, YearInfo } from "./types";

/**
 * Production data access for the AI tools. Every read goes through the
 * existing EduCore services, which use the signed-in person's OWN Supabase
 * session (createClient) — Row Level Security decides what comes back, exactly
 * as on the EduCore pages. No service-role access here, except that
 * getPlatformStatistics calls a database function that itself refuses anyone
 * but a platform administrator.
 */
export function createEduCoreData(schoolId: string | null): EduCoreData {
  const school = () => {
    if (!schoolId) throw new Error("No school for this account");
    return schoolId;
  };

  let yearPromise: Promise<YearInfo | null> | null = null;

  const name = (p: { first_name: string; middle_name?: string | null; last_name: string } | null) => (p ? fullName(p) : "Unknown");

  async function classOf(studentIds: string[], yearId: string | null) {
    if (!yearId || studentIds.length === 0) return new Map<string, { id: string; name: string }>();
    const supabase = await createClient();
    const { data } = await supabase
      .from("enrollments")
      .select("student_id, class:classes!enrollments_class_fkey(id, name)")
      .eq("school_id", school())
      .eq("academic_year_id", yearId)
      .in("student_id", studentIds);
    return new Map((data ?? []).filter((e) => e.class).map((e) => [e.student_id, { id: e.class!.id, name: e.class!.name }]));
  }

  return {
    async today() {
      const profile = await getSchoolProfile(school());
      return todayIn(profile?.timezone ?? "Africa/Monrovia");
    },

    currentYear() {
      yearPromise ??= (async () => {
        const current = await getCurrentAcademicYear(school());
        if (!current) return null;
        const [detail, published] = await Promise.all([getAcademicYear(school(), current.id), getPublishedPeriods(school(), current.id)]);
        if (!detail) return null;
        return {
          id: detail.id,
          name: detail.name,
          startsOn: detail.starts_on,
          endsOn: detail.ends_on,
          terms: detail.academic_terms.map((t) => ({
            id: t.id,
            name: t.name,
            sequence: t.sequence,
            startsOn: t.starts_on,
            endsOn: t.ends_on,
            periods: t.grading_periods.map((p) => ({ id: p.id, name: p.name, kind: p.kind, startsOn: p.starts_on, endsOn: p.ends_on, published: Boolean(published[p.id]) })),
          })),
        };
      })();
      return yearPromise;
    },

    async settings() {
      const [s, g] = await Promise.all([getSchoolSettings(school()), getGradingSettings(school())]);
      return { passingScore: g.passingScore, examWeight: g.examWeight, attendanceThreshold: Number(s?.attendance_threshold ?? 75) };
    },

    async childrenOf(parentId, yearId) {
      const links = await listGuardianLinks(school(), parentId, "children");
      const people = links.map((l) => l.person).filter((p) => p !== null);
      const classes = await classOf(people.map((p) => p.id), yearId);
      return people.map((p): PersonRef => ({ id: p.id, name: name(p), classId: classes.get(p.id)?.id ?? null, className: classes.get(p.id)?.name ?? null }));
    },

    async studentInfo(studentId, yearId) {
      const supabase = await createClient();
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, middle_name, last_name")
        .eq("school_id", school())
        .eq("id", studentId)
        .eq("role", "student")
        .maybeSingle();
      if (!data) return null;
      const cls = (await classOf([studentId], yearId)).get(studentId);
      return { id: data.id, name: name(data), classId: cls?.id ?? null, className: cls?.name ?? null };
    },

    async studentResults(studentId, yearId) {
      const r = await getStudentResults(school(), studentId, yearId, "");
      return {
        className: r.className,
        subjects: r.subjects.map((s) => ({ classSubjectId: s.classSubjectId, name: s.name, code: s.code, teacher: s.teacher ? name(s.teacher) : null })),
        assessments: r.assessments.map((a) => ({ id: a.id, category_id: a.category_id, max_score: Number(a.max_score), grading_period_id: a.grading_period_id, class_subject_id: a.class_subject_id })),
        scores: r.scores,
        categories: r.categories.map((c) => ({ id: c.id, weight: Number(c.weight) })),
      };
    },

    async studentMarks(studentId, from, to) {
      const { summary, notable } = await getStudentAttendance(school(), studentId, from, to);
      return { summary, notable: notable.map((n) => ({ date: n.date, status: n.status })) };
    },

    async reportCards(studentId) {
      const cards = await listIssuedCards(school(), { studentIds: [studentId] });
      return cards.map((c) => ({
        term: c.data.term.name,
        year: c.data.yearName,
        className: c.data.className,
        average: c.average,
        rank: c.rank,
        classSize: c.classSize,
        issuedAt: c.issuedAt,
        promotion: c.data.promotion ?? null,
      }));
    },

    classIdsTaughtBy(teacherId, yearId) {
      return classesTaughtBy(school(), yearId, teacherId);
    },

    async assignments(yearId, teacherId) {
      const rows = await listClassSubjectsForYear(school(), yearId, teacherId);
      return rows
        .filter((r) => r.class)
        .map((r) => ({ classSubjectId: r.id, classId: r.class!.id, className: r.class!.name, subject: r.subject?.name ?? "—" }));
    },

    async classes(yearId) {
      const rows = await listClasses(school(), yearId);
      return rows.map((c) => ({ id: c.id, name: c.name, grade: c.grade?.name ?? null, homeroom: c.homeroom ? name(c.homeroom) : null, studentCount: c.studentCount }));
    },

    async classDetail(classId) {
      const c = await getClass(school(), classId);
      if (!c) return null;
      return {
        id: c.id,
        name: c.name,
        grade: c.grade?.name ?? null,
        homeroom: c.homeroom ? name(c.homeroom) : null,
        homeroomId: c.homeroom?.id ?? null,
        students: c.students.filter((e) => e.status === "active" && e.student).map((e) => ({ id: e.student!.id, name: name(e.student) })),
        subjects: c.subjects.map((s) => ({ classSubjectId: s.id, subject: s.subject?.name ?? "—", teacherId: s.teacher?.id ?? null, teacher: s.teacher ? name(s.teacher) : null })),
      };
    },

    async register(classId, date) {
      const r = await getRegister(school(), classId, date);
      if (!r) return null;
      return [...r.marks.entries()].map(([studentId, m]) => ({ studentId, status: m.status }));
    },

    classMarks(classId, from, to) {
      return getClassAttendance(school(), classId, from, to);
    },

    async gradebook(classSubjectId) {
      const gb = await getGradebook(school(), classSubjectId);
      if (!gb || !gb.classSubject.class) return null;
      return {
        classSubjectId,
        classId: gb.classSubject.class.id,
        subject: gb.classSubject.subject?.name ?? "—",
        teacherId: gb.classSubject.teacherId,
        className: gb.classSubject.class.name,
        subjects: [],
        students: gb.students.map((s) => ({ id: s.id, name: name(s) })),
        assessments: gb.assessments.map((a) => ({ id: a.id, category_id: a.category_id, max_score: Number(a.max_score), grading_period_id: a.grading_period_id, class_subject_id: a.class_subject_id })),
        scores: gb.scores,
        categories: gb.categories.map((c) => ({ id: c.id, weight: Number(c.weight) })),
      };
    },

    async findStudents(yearId, query, onlyClassIds) {
      const rows = await listStudents(school(), { yearId, search: query, onlyClassIds });
      return rows.map((r) => ({
        id: r.id,
        name: fullName({ first_name: r.firstName, middle_name: r.middleName, last_name: r.lastName }),
        classId: r.classId,
        className: r.className,
      }));
    },

    async announcements(profileId, today) {
      const rows = await listAnnouncements(school(), profileId, today, 20);
      return rows
        .filter((a) => a.isLive)
        .map((a) => ({ title: a.title, body: a.body, publishAt: a.publishAt, audience: a.audience, className: a.className, pinned: a.pinned }));
    },

    async dayOverview(yearId, date) {
      const rows = await getDayOverview(school(), yearId, date);
      return rows.map((r) => ({ classId: r.classId, className: r.className, students: r.students, summary: r.summary }));
    },

    async schoolPerformance(yearId, termId) {
      const detail = await getAcademicYear(school(), yearId);
      if (!detail) return null;
      const d = await getSchoolReport(school(), detail, termId);
      const r = d.report;
      const g = (x: typeof r.overall) => ({ students: x.students, attendanceRate: x.attendanceRate, passRate: x.passRate, mean: x.mean });
      return {
        term: d.term?.name ?? null,
        cardsIssued: d.cardsIssued,
        passingScore: d.passingScore,
        attendanceThreshold: d.attendanceThreshold,
        teachers: d.teachers,
        overall: { ...g(r.overall), graded: r.overall.graded, passed: r.overall.passed },
        female: g(r.female),
        male: g(r.male),
        classes: r.classes.map((c) => ({ id: c.id, name: c.name, students: c.students, attendanceRate: c.attendanceRate, mean: c.mean, passRate: c.passRate })),
        subjects: r.subjects.map((s) => ({ name: s.name, graded: s.graded, mean: s.mean, passRate: s.passRate })),
        months: r.months.map((m) => ({ month: m.month, rate: m.rate })),
        watch: r.watch.map((w) => ({
          id: w.student.id,
          name: w.student.name,
          className: w.student.className,
          average: w.average,
          attendanceRate: w.attendance.rate,
          failing: w.failing,
          lowAttendance: w.lowAttendance,
        })),
      };
    },

    async platformStats() {
      const rows = await getPlatformStatistics();
      return rows.map((r) => ({
        name: r.name,
        county: r.county,
        status: r.status,
        isDemo: r.is_demo,
        students: r.students,
        female: r.female,
        male: r.male,
        teachers: r.teachers,
        classes: r.classes,
        attPresent: r.att_present,
        attLate: r.att_late,
        attAbsent: r.att_absent,
        graded: r.graded_students,
        passed: r.passed,
      }));
    },
  };
}
