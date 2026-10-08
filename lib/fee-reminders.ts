import { formatMoney } from "@/lib/finance";
import { formatDate } from "@/lib/format";
import type { FeeReminder } from "@/services/my-fees";

export interface FeeReminderItem {
  id: string;
  title: string;
  href: string;
  meta: string;
  unread: boolean;
}

/** Plain-words wording for one reminder. Overdue ones come first, then by due date. */
export function feeReminderItems(reminders: FeeReminder[], people: { id: string; name: string }[], showNames: boolean): FeeReminderItem[] {
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  return [...reminders]
    .sort((a, b) => (a.kind === b.kind ? a.dueDate.localeCompare(b.dueDate) : a.kind === "overdue" ? -1 : 1))
    .map((r) => {
      const what = r.installment ? `Instalment ${r.installment}` : (r.invoiceNumber ?? "Fees");
      const money = formatMoney(r.amountDue, r.currency);
      const when =
        r.kind === "overdue"
          ? `overdue by ${r.daysOverdue} day${r.daysOverdue === 1 ? "" : "s"}`
          : r.daysOverdue === 0
            ? "due today"
            : `due ${formatDate(r.dueDate)}`;
      const who = showNames ? nameOf.get(r.studentId) : undefined;
      return {
        id: `fee-${r.invoiceId}-${r.installment ?? 0}`,
        title: `${money} ${r.kind === "overdue" ? "overdue" : "to pay"}: ${what}`,
        href: showNames ? `/my-fees?child=${r.studentId}` : "/my-fees",
        meta: `${who ? `${who} · ` : ""}${when}`,
        unread: true,
      };
    });
}
