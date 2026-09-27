import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import {
  attendanceRate,
  femaleShare,
  passRate,
  percent,
  studentTeacherRatio,
  whole,
  type CountyStats,
  type StatCounts,
} from "@/lib/platform-stats";

/** A figure with a thin bar under it (for rates). Plain text when printing in black and white still reads. */
export function RateCell({ value }: { value: number | null }) {
  return (
    <span className="inline-flex min-w-16 flex-col items-end gap-1">
      <span className="tabular-nums">{percent(value)}</span>
      {value === null ? null : (
        <span className="h-1 w-16 overflow-hidden rounded-full bg-surface-muted print:bg-neutral-200" aria-hidden>
          <span className="block h-full rounded-full bg-brand print:bg-neutral-700" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
        </span>
      )}
    </span>
  );
}

const num = "text-right tabular-nums";

export function CountyTable({ counties, total, dense = false }: { counties: CountyStats[]; total: StatCounts & { schools: number }; dense?: boolean }) {
  const row = (label: string, c: StatCounts & { schools: number }, strong = false) => (
    <TR key={label} className={cn(strong && "font-semibold")}>
      <TD className={cn(!strong && "font-medium")}>{label}</TD>
      <TD className={num}>{whole(c.schools)}</TD>
      <TD className={num}>{whole(c.students)}</TD>
      <TD className={num}>{percent(femaleShare(c))}</TD>
      <TD className={num}>{whole(c.teachers)}</TD>
      <TD className={num}>{studentTeacherRatio(c)}</TD>
      <TD className={num}>{dense ? percent(attendanceRate(c)) : <RateCell value={attendanceRate(c)} />}</TD>
      <TD className={num}>{dense ? percent(passRate(c)) : <RateCell value={passRate(c)} />}</TD>
    </TR>
  );
  return (
    <Table caption="Statistics by county">
      <THead>
        <TR>
          <TH>County</TH>
          <TH className="text-right">Schools</TH>
          <TH className="text-right">Students</TH>
          <TH className="text-right">Girls</TH>
          <TH className="text-right">Teachers</TH>
          <TH className="text-right">Students per teacher</TH>
          <TH className="text-right">Attendance</TH>
          <TH className="text-right">Pass rate</TH>
        </TR>
      </THead>
      <TBody>
        {counties.map((c) => row(c.county, c))}
        {counties.length > 1 ? row("All counties", total, true) : null}
      </TBody>
    </Table>
  );
}

export interface SchoolStatRow extends StatCounts {
  school_id: string;
  name: string;
  code: string;
  county: string | null;
  current_year: string | null;
  is_demo?: boolean;
}

export function SchoolTable({ schools, linkSchools = true }: { schools: SchoolStatRow[]; linkSchools?: boolean }) {
  return (
    <Table caption="Statistics by school">
      <THead>
        <TR>
          <TH>School</TH>
          <TH>County</TH>
          <TH className="text-right">Students</TH>
          <TH className="text-right">Girls</TH>
          <TH className="text-right">Teachers</TH>
          <TH className="text-right">Classes</TH>
          <TH className="text-right">Attendance</TH>
          <TH className="text-right">Pass rate</TH>
        </TR>
      </THead>
      <TBody>
        {schools.map((s) => (
          <TR key={s.school_id}>
            <TD>
              {linkSchools ? (
                <Link href={`/platform/schools/${s.school_id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                  {s.name}
                </Link>
              ) : (
                <span className="font-medium">{s.name}</span>
              )}
              {s.is_demo ? (
                <Badge tone="warning" className="ml-2 print:border print:border-neutral-500">
                  Demo
                </Badge>
              ) : null}
              <span className="block text-xs text-muted">
                {s.code}
                {s.current_year ? ` · ${s.current_year}` : " · no current year"}
              </span>
            </TD>
            <TD className="text-sm">{s.county || "—"}</TD>
            <TD className={num}>{whole(s.students)}</TD>
            <TD className={num}>{percent(femaleShare(s))}</TD>
            <TD className={num}>{whole(s.teachers)}</TD>
            <TD className={num}>{whole(s.classes)}</TD>
            <TD className={num}>{percent(attendanceRate(s))}</TD>
            <TD className={num}>{percent(passRate(s))}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
