import assert from "node:assert/strict";
import { test } from "node:test";
import { feeReminderItems } from "@/lib/fee-reminders";
import type { FeeReminder } from "@/services/my-fees";

const base: FeeReminder = {
  studentId: "s1",
  invoiceId: "i1",
  invoiceNumber: "INV-2026-00001",
  installment: null,
  currency: "USD",
  dueDate: "2026-10-20",
  amountDue: 40,
  kind: "due_soon",
  daysOverdue: -2,
};
const people = [{ id: "s1", name: "Amos Kollie" }];

test("overdue reminders come before upcoming ones", () => {
  const items = feeReminderItems([base, { ...base, invoiceId: "i2", kind: "overdue", daysOverdue: 5, dueDate: "2026-10-01" }], people, false);
  assert.match(items[0].title, /overdue/);
  assert.match(items[1].title, /to pay/);
});

test("overdue wording and singular day", () => {
  const [one] = feeReminderItems([{ ...base, kind: "overdue", daysOverdue: 1 }], people, false);
  assert.equal(one.meta, "overdue by 1 day");
  const [many] = feeReminderItems([{ ...base, kind: "overdue", daysOverdue: 5 }], people, false);
  assert.equal(many.meta, "overdue by 5 days");
});

test("instalments are named by number, invoices by invoice number", () => {
  const [inst] = feeReminderItems([{ ...base, installment: 2 }], people, false);
  assert.match(inst.title, /Instalment 2/);
  const [inv] = feeReminderItems([base], people, false);
  assert.match(inv.title, /INV-2026-00001/);
});

test("due today reads as today; money keeps two decimals", () => {
  const [item] = feeReminderItems([{ ...base, daysOverdue: 0, amountDue: 12.5 }], people, false);
  assert.equal(item.meta, "due today");
  assert.match(item.title, /\$12\.50/);
});

test("parents see the child's name and a link that selects the child; students do not", () => {
  const [parent] = feeReminderItems([base], people, true);
  assert.match(parent.meta, /^Amos Kollie · /);
  assert.equal(parent.href, "/my-fees?child=s1");
  const [student] = feeReminderItems([base], people, false);
  assert.equal(student.href, "/my-fees");
  assert.ok(!student.meta.includes("Amos"));
});

test("two instalments of one invoice get distinct ids", () => {
  const items = feeReminderItems([{ ...base, installment: 1 }, { ...base, installment: 2 }], people, false);
  assert.notEqual(items[0].id, items[1].id);
});
