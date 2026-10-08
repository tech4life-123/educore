import assert from "node:assert/strict";
import { test } from "node:test";
import { bucketFor, bucketReceivables, collectionRate, estimateNotYetDue, lastMonths, monthlyTotals, shares, topDebtors } from "@/lib/finance-outlook";

const today = "2026-10-12";

test("bucket boundaries", () => {
  assert.equal(bucketFor("2026-10-11", today), "overdue");
  assert.equal(bucketFor("2026-10-12", today), "d7");
  assert.equal(bucketFor("2026-10-19", today), "d7");
  assert.equal(bucketFor("2026-10-20", today), "d30");
  assert.equal(bucketFor("2026-11-11", today), "d30");
  assert.equal(bucketFor("2026-11-12", today), "d60");
  assert.equal(bucketFor("2026-12-11", today), "d60");
  assert.equal(bucketFor("2026-12-12", today), "d90");
  assert.equal(bucketFor("2027-01-10", today), "d90");
  assert.equal(bucketFor("2027-01-11", today), "later");
});

test("buckets are kept per currency and never mixed", () => {
  const f = bucketReceivables(
    [
      { studentId: "a", currency: "USD", dueDate: "2026-10-01", amountDue: 10.1 },
      { studentId: "a", currency: "USD", dueDate: "2026-10-13", amountDue: 20.2 },
      { studentId: "b", currency: "LRD", dueDate: "2026-10-13", amountDue: 500 },
      { studentId: "b", currency: "USD", dueDate: "2026-10-13", amountDue: 0 },
    ],
    today,
  );
  assert.deepEqual(f.map((x) => x.currency), ["LRD", "USD"]);
  const usd = f[1];
  assert.equal(usd.total, 30.3);
  assert.equal(usd.buckets[0].amount, 10.1);
  assert.equal(usd.buckets[1].count, 1);
  assert.equal(f[0].total, 500);
});

test("collection rate needs enough history and is capped", () => {
  assert.equal(collectionRate(50, 50), null);
  assert.equal(collectionRate(200, 150), 0.75);
  assert.equal(collectionRate(200, 250), 1);
});

test("estimate skips overdue and needs a rate", () => {
  const [f] = bucketReceivables(
    [
      { studentId: "a", currency: "USD", dueDate: "2026-10-01", amountDue: 100 },
      { studentId: "a", currency: "USD", dueDate: "2026-10-20", amountDue: 200 },
    ],
    today,
  );
  assert.equal(estimateNotYetDue(f, 0.5), 100);
  assert.equal(estimateNotYetDue(f, null), null);
});

test("last months wrap the year and sums have no gaps", () => {
  const months = lastMonths("2026-02-10", 4);
  assert.deepEqual(months, ["2025-11", "2025-12", "2026-01", "2026-02"]);
  const out = monthlyTotals(
    [
      { currency: "USD", date: "2025-12-03", amount: 5.5 },
      { currency: "USD", date: "2025-12-20", amount: 4.5 },
      { currency: "LRD", date: "2026-01-02", amount: 99 },
      { currency: "USD", date: "2024-01-01", amount: 7 },
    ],
    "USD",
    months,
  );
  assert.deepEqual(out, [0, 10, 0, 0]);
});

test("top debtors add a student's items together and sort", () => {
  const d = topDebtors(
    [
      { studentId: "a", currency: "USD", dueDate: "2026-10-20", amountDue: 30 },
      { studentId: "b", currency: "USD", dueDate: "2026-10-20", amountDue: 50 },
      { studentId: "a", currency: "USD", dueDate: "2026-11-20", amountDue: 40 },
    ],
    1,
  );
  assert.deepEqual(d, [{ studentId: "a", currency: "USD", amount: 70 }]);
});

test("shares add to the right percentages", () => {
  const s = shares(new Map([["cash", 75], ["bank", 25]]));
  assert.deepEqual(s.map((x) => [x.key, x.percent]), [["cash", 75], ["bank", 25]]);
  assert.deepEqual(shares(new Map()), []);
});
