import { percent, whole } from "@/lib/platform-stats";
import { monthLabel, type MonthRow } from "@/lib/reports";

/** Bars use this share of the plot height, leaving room for the value labels above them. */
const SCALE = 0.85;

/** Attendance rate per month (single series) with a dashed target line; values are labelled, a table backs it for screen readers. */
export function MonthChart({ months, target }: { months: MonthRow[]; target: number }) {
  return (
    <>
      <div
        className="relative flex h-48 items-end gap-2 border-b border-border sm:gap-3"
        role="img"
        aria-label="Attendance rate by month"
      >
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-muted"
          style={{ bottom: `${target * SCALE}%` }}
          aria-hidden
        />
        {months.map((m) => (
          <div
            key={m.month}
            className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end"
            title={`${monthLabel(m.month)}: ${percent(m.rate)} · ${whole(m.present)} present, ${whole(m.late)} late, ${whole(m.absent)} absent, ${whole(m.excused)} excused`}
          >
            <span className="mb-1 text-xs font-medium tabular-nums text-foreground">{percent(m.rate)}</span>
            <span
              className="w-full max-w-12 rounded-t bg-brand group-hover:opacity-80 print:bg-neutral-700"
              style={{ height: `${m.rate === null ? 0 : m.rate * SCALE}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2 sm:gap-3">
        {months.map((m) => (
          <span key={m.month} className="min-w-0 flex-1 truncate text-center text-xs text-muted">
            <span className="hidden sm:inline">{monthLabel(m.month)}</span>
            <span className="sm:hidden">{monthLabel(m.month, true)}</span>
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Attendance by month</caption>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <th scope="row">{monthLabel(m.month)}</th>
              <td>{percent(m.rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
