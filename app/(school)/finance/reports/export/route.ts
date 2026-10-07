import { NextResponse, type NextRequest } from "next/server";
import { todayIn } from "@/lib/attendance";
import { toCsv } from "@/lib/csv";
import { METHOD_LABEL } from "@/lib/finance";
import { requireCapability } from "@/services/auth";
import { getFinanceReport } from "@/services/finance";
import { getSchoolProfile } from "@/services/school";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** CSV exports of the finance report: ?kind=collections|outstanding&from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(request: NextRequest) {
  const { school } = await requireCapability("finance.manage", "/finance/reports");
  const sp = request.nextUrl.searchParams;
  const profile = await getSchoolProfile(school.id);
  const today = todayIn(profile?.timezone ?? "Africa/Monrovia");
  const from = DATE.test(sp.get("from") ?? "") ? (sp.get("from") as string) : `${today.slice(0, 8)}01`;
  const to = DATE.test(sp.get("to") ?? "") ? (sp.get("to") as string) : today;
  const kind = sp.get("kind") === "outstanding" ? "outstanding" : "collections";

  const report = await getFinanceReport(from, to, today);
  const csv =
    kind === "collections"
      ? toCsv(
          ["Date paid", "Student", "Method", "Reference", "Invoice", "Currency", "Amount"],
          report.collections.map((c) => [c.paidOn, c.studentName, METHOD_LABEL[c.method], c.reference, c.invoiceNumber, c.currency, c.amount.toFixed(2)]),
        )
      : toCsv(
          ["Invoice", "Student", "Due date", "Days overdue", "Currency", "Total", "Paid", "Balance due"],
          report.outstanding.map((i) => [i.invoiceNumber, i.studentName, i.dueDate, i.daysOverdue, i.currency, i.totalAmount.toFixed(2), i.amountPaid.toFixed(2), i.balanceDue.toFixed(2)]),
        );
  const slug = school.code.replace(/[^A-Za-z0-9-]+/g, "-");
  const name = kind === "collections" ? `${slug}-collections-${from}-to-${to}.csv` : `${slug}-outstanding-${today}.csv`;
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
