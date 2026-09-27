import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { formatGrade, isPassing } from "@/lib/grades/compute";
import { ordinal, type ReportCardData } from "@/lib/grades/report-card";

export interface CardSchool {
  name: string;
  motto: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
}

/**
 * One report card, laid out for A4 paper. Used on screen and for printing
 * (each card starts on a new page). Grade values come from the card "as
 * issued"; the remark and any promotion override are current.
 */
export function ReportCard({
  data,
  school,
  remark,
  promotionOverride,
  issuedAt,
}: {
  data: ReportCardData;
  school: CardSchool;
  remark: string | null;
  promotionOverride: "promoted" | "not_promoted" | null;
  issuedAt: string;
}) {
  const { passingScore } = data;
  const promotion = promotionOverride ?? data.promotion ?? null;
  const place = [school.address, school.city, school.county].filter(Boolean).join(", ");
  const contact = [school.phone, school.email].filter(Boolean).join(" · ");
  const showYearly = data.term.isFinal;

  return (
    <article className="report-card mx-auto w-full max-w-[210mm] bg-white p-6 text-[13px] leading-snug text-neutral-900 shadow-sm print:max-w-none print:px-0.5 print:py-0 print:shadow-none sm:p-8">
      {/* Letterhead */}
      <header className="flex items-center gap-4 border-b-4 pb-3" style={{ borderColor: "var(--brand)" }}>
        {school.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- printed documents need the original image
          <img src={school.logo_url} alt="" className="h-16 w-16 shrink-0 object-contain" />
        ) : null}
        <div className="min-w-0 flex-1 text-center">
          <p className="text-lg font-bold uppercase tracking-wide">{school.name}</p>
          {school.motto ? <p className="text-xs italic">“{school.motto}”</p> : null}
          {place ? <p className="text-xs">{place}</p> : null}
          {contact ? <p className="text-xs">{contact}</p> : null}
        </div>
        {school.logo_url ? <div className="w-16 shrink-0" aria-hidden="true" /> : null}
      </header>

      <h2 className="mt-3 text-center text-base font-bold uppercase tracking-wider">
        Report Card — {data.term.name} · {data.yearName}
      </h2>

      {/* Student */}
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-4">
        <div className="col-span-2">
          <dt className="text-[11px] uppercase text-neutral-500">Student</dt>
          <dd className="font-semibold">{data.student.name}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase text-neutral-500">Class</dt>
          <dd className="font-semibold">
            {data.className}
            {data.gradeName ? ` (${data.gradeName})` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase text-neutral-500">Student ID</dt>
          <dd className="font-mono text-xs">{data.student.login}</dd>
        </div>
      </dl>

      {/* Grades */}
      <table className="mt-4 w-full border-collapse text-[12.5px]">
        <caption className="sr-only">Grades for {data.term.name}</caption>
        <thead>
          <tr className="bg-neutral-100">
            <th scope="col" className="border border-neutral-300 px-2 py-1.5 text-left">Subject</th>
            {data.periods.map((p) => (
              <th key={p.id} scope="col" className="border border-neutral-300 px-2 py-1.5 text-center">
                {p.kind === "exam" ? "Exam" : p.name.replace(/ Period$/, "")}
              </th>
            ))}
            <th scope="col" className="border border-neutral-300 px-2 py-1.5 text-center">Sem. Avg</th>
            {showYearly ? (
              <>
                <th scope="col" className="border border-neutral-300 px-2 py-1.5 text-center">{data.previousTermName ? "1st Sem." : "Prev."}</th>
                <th scope="col" className="border border-neutral-300 px-2 py-1.5 text-center">Yearly</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {data.subjects.map((s) => (
            <tr key={s.code || s.name}>
              <th scope="row" className="border border-neutral-300 px-2 py-1.5 text-left font-medium">
                {s.name}
              </th>
              {s.grades.map((g, i) => (
                <G passing={passingScore} key={data.periods[i]?.id ?? i} value={g} />
              ))}
              <G passing={passingScore} value={s.semesterAverage} strong />
              {showYearly ? (
                <>
                  <G passing={passingScore} value={s.previousSemesterAverage} />
                  <G passing={passingScore} value={s.yearlyAverage} strong />
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-neutral-100">
            <th scope="row" className="border border-neutral-300 px-2 py-1.5 text-left">Average</th>
            {data.overall.periods.map((g, i) => (
              <G passing={passingScore} key={data.periods[i]?.id ?? i} value={g} strong />
            ))}
            <G passing={passingScore} value={data.overall.semester} strong />
            {showYearly ? (
              <>
                <G passing={passingScore} value={data.overall.previousSemester} strong />
                <G passing={passingScore} value={data.overall.yearly} strong />
              </>
            ) : null}
          </tr>
        </tfoot>
      </table>
      {data.periods.some((p) => !p.published) ? (
        <p className="mt-1 text-[11px] text-neutral-500">“—” = not yet published or not graded.</p>
      ) : null}

      {/* Standing */}
      <div className={cn("mt-4 grid gap-3", data.attendance ? "grid-cols-2 sm:grid-cols-4" : "sm:grid-cols-3")}>
        <Box label={`Rank (${data.rank.basis})`}>
          {data.rank.position ? `${ordinal(data.rank.position)} of ${data.rank.of}` : "—"}
        </Box>
        {showYearly ? (
          <Box label="Yearly rank">{data.yearlyRank?.position ? `${ordinal(data.yearlyRank.position)} of ${data.yearlyRank.of}` : "—"}</Box>
        ) : (
          <Box label="Passing score">{passingScore}</Box>
        )}
        {showYearly ? (
          <Box label="Promotion">
            {promotion === "promoted" ? (
              <span className="font-bold text-green-800">PROMOTED</span>
            ) : promotion === "not_promoted" ? (
              <span className="font-bold text-red-700">NOT PROMOTED</span>
            ) : (
              "Pending"
            )}
          </Box>
        ) : (
          <Box label="Semester average">{formatGrade(data.overall.semester)}</Box>
        )}
        {data.attendance ? (
          <Box label="Attendance">
            <span className={cn(data.attendance.rate !== null && data.attendanceThreshold !== undefined && Math.round(data.attendance.rate) < data.attendanceThreshold && "text-red-700")}>
              {data.attendance.rate === null ? "—" : `${Math.round(data.attendance.rate)}%`}
            </span>
            <span className="block text-[11px] font-normal text-neutral-600">
              Absent {data.attendance.absent} · Late {data.attendance.late} · Excused {data.attendance.excused}
            </span>
          </Box>
        ) : null}
      </div>

      {/* Remark */}
      <div className="mt-4 rounded border border-neutral-300 p-3">
        <p className="text-[11px] font-semibold uppercase text-neutral-500">Homeroom teacher’s remark</p>
        <p className="mt-1 min-h-10 whitespace-pre-line">{remark || ""}</p>
      </div>

      {/* Signatures */}
      <div className="mt-8 grid grid-cols-3 gap-6 text-center text-[11px]">
        {["Homeroom teacher", "Principal", "Parent / guardian"].map((who) => (
          <div key={who}>
            <div className="h-8 border-b border-neutral-500" />
            <p className="mt-1 text-neutral-600">{who}</p>
          </div>
        ))}
      </div>

      <footer className="mt-6 flex flex-wrap justify-between gap-2 border-t border-neutral-200 pt-2 text-[10.5px] text-neutral-500">
        <span>
          Grades below {passingScore} are shown in red. Semester average = (average of the marking periods × {100 - data.examWeight}%) + (exam ×{" "}
          {data.examWeight}%).
        </span>
        <span>Issued {formatDate(issuedAt.slice(0, 10))} · EduCore</span>
      </footer>
    </article>
  );
}

function Box({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded border border-neutral-300 px-3 py-2">
      <p className="text-[11px] uppercase text-neutral-500">{label}</p>
      <p className="text-base font-semibold">{children}</p>
    </div>
  );
}

function G({ value, passing, strong = false }: { value: number | null | undefined; passing: number; strong?: boolean }) {
  const v = value ?? null;
  const pass = isPassing(v, passing);
  return (
    <td className={cn("border border-neutral-300 px-2 py-1.5 text-center tabular-nums", strong && "font-semibold", pass === false && "text-red-700")}>
      {formatGrade(v)}
      {pass === false ? <span className="sr-only"> (below passing)</span> : null}
    </td>
  );
}
