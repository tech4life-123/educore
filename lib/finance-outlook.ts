/** Pure helpers for the finance Outlook page: bucketing what is owed and summarising recent months. */

export interface Receivable {
  studentId: string;
  currency: string;
  dueDate: string; // YYYY-MM-DD
  amountDue: number;
}

export const BUCKETS = [
  { key: "overdue", label: "Overdue" },
  { key: "d7", label: "Next 7 days" },
  { key: "d30", label: "8–30 days" },
  { key: "d60", label: "31–60 days" },
  { key: "d90", label: "61–90 days" },
  { key: "later", label: "Later" },
] as const;
export type BucketKey = (typeof BUCKETS)[number]["key"];

const DAY = 86_400_000;
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function daysUntil(dueDate: string, today: string): number {
  return dayNumber(dueDate) - dayNumber(today);
}

export function bucketFor(dueDate: string, today: string): BucketKey {
  const d = daysUntil(dueDate, today);
  if (d < 0) return "overdue";
  if (d <= 7) return "d7";
  if (d <= 30) return "d30";
  if (d <= 60) return "d60";
  if (d <= 90) return "d90";
  return "later";
}

export interface CurrencyForecast {
  currency: string;
  buckets: { key: BucketKey; label: string; amount: number; count: number }[];
  total: number;
}

/** What is scheduled to fall due, per currency. No guessing: these are the dates on the invoices and plans. */
export function bucketReceivables(rows: Receivable[], today: string): CurrencyForecast[] {
  const by = new Map<string, Map<BucketKey, { amount: number; count: number }>>();
  for (const r of rows) {
    if (!(r.amountDue > 0)) continue;
    const m = by.get(r.currency) ?? new Map();
    const key = bucketFor(r.dueDate, today);
    const cur = m.get(key) ?? { amount: 0, count: 0 };
    cur.amount += r.amountDue;
    cur.count += 1;
    m.set(key, cur);
    by.set(r.currency, m);
  }
  return [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, m]) => {
      const buckets = BUCKETS.map((b) => ({ key: b.key, label: b.label, amount: round2(m.get(b.key)?.amount ?? 0), count: m.get(b.key)?.count ?? 0 }));
      return { currency, buckets, total: round2(buckets.reduce((s, b) => s + b.amount, 0)) };
    });
}

/**
 * Share of money that fell due in a past window which has since been paid.
 * Returns null when there is too little history to say anything (fewer than `minDue` currency units due).
 */
export function collectionRate(fellDue: number, paid: number, minDue = 100): number | null {
  if (!(fellDue >= minDue)) return null;
  return Math.min(1, Math.max(0, paid / fellDue));
}

/** Estimate for money not yet due: apply the school's own rate. Overdue money is excluded: past behaviour says little about it. */
export function estimateNotYetDue(f: CurrencyForecast, rate: number | null): number | null {
  if (rate === null) return null;
  const notDue = f.buckets.filter((b) => b.key !== "overdue").reduce((s, b) => s + b.amount, 0);
  return round2(notDue * rate);
}

/** The last `n` calendar months ending with the month of `today`, oldest first, as YYYY-MM. */
export function lastMonths(today: string, n: number): string[] {
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

export interface Dated {
  currency: string;
  date: string;
  amount: number;
}

/** Sum amounts into months for one currency. Months with nothing are 0 so the table has no gaps. */
export function monthlyTotals(rows: Dated[], currency: string, months: string[]): number[] {
  const sums = new Map(months.map((m) => [m, 0]));
  for (const r of rows) {
    if (r.currency !== currency) continue;
    const k = r.date.slice(0, 7);
    if (sums.has(k)) sums.set(k, (sums.get(k) ?? 0) + r.amount);
  }
  return months.map((m) => round2(sums.get(m) ?? 0));
}

/** Largest balances first, one row per student per currency. */
export function topDebtors(rows: Receivable[], limit: number): { studentId: string; currency: string; amount: number }[] {
  const by = new Map<string, { studentId: string; currency: string; amount: number }>();
  for (const r of rows) {
    const k = `${r.studentId}|${r.currency}`;
    const cur = by.get(k) ?? { studentId: r.studentId, currency: r.currency, amount: 0 };
    cur.amount += r.amountDue;
    by.set(k, cur);
  }
  return [...by.values()].map((d) => ({ ...d, amount: round2(d.amount) })).sort((a, b) => b.amount - a.amount).slice(0, limit);
}

/** Percentage shares of a set of totals, rounded to whole numbers. */
export function shares<T extends string>(totals: Map<T, number>): { key: T; amount: number; percent: number }[] {
  const sum = [...totals.values()].reduce((a, b) => a + b, 0);
  return [...totals.entries()]
    .map(([key, amount]) => ({ key, amount: round2(amount), percent: sum > 0 ? Math.round((amount / sum) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);
}
