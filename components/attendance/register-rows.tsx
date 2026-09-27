import { Input } from "@/components/ui/input";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@/lib/attendance";
import { cn } from "@/lib/cn";

const TONE: Record<AttendanceStatus, string> = {
  present: "peer-checked:border-success peer-checked:bg-success-soft peer-checked:text-success",
  absent: "peer-checked:border-danger peer-checked:bg-danger-soft peer-checked:text-danger",
  late: "peer-checked:border-warning peer-checked:bg-warning-soft peer-checked:text-warning",
  excused: "peer-checked:border-info peer-checked:bg-info-soft peer-checked:text-info",
};

/** One row per student: segmented Present / Absent / Late / Excused and an optional note. */
export function RegisterRows({
  students,
  marks,
}: {
  students: { id: string; name: string }[];
  marks?: Map<string, { status: AttendanceStatus; note: string | null }>;
}) {
  return (
    <ul className="divide-y divide-border">
      {students.map((s, i) => {
        const mark = marks?.get(s.id);
        const current = mark?.status ?? "present";
        return (
          <li key={s.id} className="grid items-center gap-2 px-5 py-2.5 md:grid-cols-[minmax(0,1fr)_auto_14rem]">
            <span className="text-sm">
              <span className="mr-2 tabular-nums text-subtle">{i + 1}.</span>
              <span className="font-medium text-foreground">{s.name}</span>
            </span>
            <fieldset className="flex gap-1.5">
              <legend className="sr-only">Attendance for {s.name}</legend>
              {ATTENDANCE_STATUSES.map((opt) => (
                <label key={opt.value} className="cursor-pointer">
                  <input
                    type="radio"
                    name={`status:${s.id}`}
                    value={opt.value}
                    defaultChecked={current === opt.value}
                    className="peer sr-only"
                  />
                  <span
                    title={opt.label}
                    className={cn(
                      "inline-flex h-10 min-w-10 items-center justify-center rounded-lg border border-border px-2 text-sm font-semibold text-muted",
                      "peer-focus-visible:ring-2 peer-focus-visible:ring-brand",
                      TONE[opt.value],
                    )}
                  >
                    <span aria-hidden="true" className="sm:hidden">
                      {opt.short}
                    </span>
                    <span className="hidden sm:inline">{opt.label}</span>
                    <span className="sr-only sm:hidden">{opt.label}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="sr-only" htmlFor={`note-${s.id}`}>
              Note for {s.name}
            </label>
            <Input
              id={`note-${s.id}`}
              name={`note:${s.id}`}
              defaultValue={mark?.note ?? ""}
              maxLength={200}
              placeholder="Note (optional)"
              className="h-10"
            />
          </li>
        );
      })}
    </ul>
  );
}
