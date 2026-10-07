import { SectionTabs } from "@/components/ui/section-tabs";
import { requireCapability } from "@/services/auth";

const TABS = [
  { href: "/finance", label: "Overview", exact: true },
  { href: "/finance/invoices", label: "Invoices" },
  { href: "/finance/payments", label: "Payments" },
  { href: "/finance/reconciliation", label: "Reconciliation" },
  { href: "/finance/reports", label: "Reports" },
  { href: "/finance/fees", label: "Fees" },
] as const;

export default async function FinanceLayout({ children }: LayoutProps<"/finance">) {
  // Layouts don't re-run on client navigation, so every page guards itself too.
  await requireCapability("finance.manage", "/finance");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Finance</h1>
        <p className="mt-1 text-sm text-muted">Fees, invoices and payments. Balances come from the ledger; every change is audited.</p>
      </div>
      <SectionTabs label="Finance sections" tabs={TABS} />
      {children}
    </div>
  );
}
