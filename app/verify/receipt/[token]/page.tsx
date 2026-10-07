import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/finance";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Verify a receipt", robots: { index: false, follow: false } };

/**
 * Public page the receipt's QR code opens. No sign-in. It asks the database
 * (verify_receipt) and shows only what is needed to check a paper receipt:
 * number, school, date, amount, the student's first name + initial, and
 * whether the payment still stands.
 */
export default async function VerifyReceiptPage({ params }: PageProps<"/verify/receipt/[token]">) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = /^[0-9a-f]{32,128}$/i.test(token) ? await supabase.rpc("verify_receipt", { p_token: token }) : { data: null };
  const r = data?.[0] ?? null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-center text-2xl font-semibold tracking-tight text-foreground">Receipt verification</h1>
      {r ? (
        <section
          aria-live="polite"
          className={`rounded-xl border p-5 shadow-sm ${r.is_valid ? "border-success/40 bg-success-soft" : "border-danger/40 bg-danger-soft"}`}
        >
          <p className={`text-lg font-semibold ${r.is_valid ? "text-success" : "text-danger"}`}>
            {r.is_valid ? "✓ Valid receipt" : "✗ This payment was reversed — the receipt is no longer valid"}
          </p>
          <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted">Receipt no.</dt>
            <dd className="font-medium text-foreground">{r.receipt_number}</dd>
            <dt className="text-muted">School</dt>
            <dd className="font-medium text-foreground">{r.school_name}</dd>
            <dt className="text-muted">Issued</dt>
            <dd className="font-medium text-foreground">{formatDate(r.issued_on)}</dd>
            <dt className="text-muted">Amount</dt>
            <dd className="font-medium text-foreground">{formatMoney(r.amount, r.currency)}</dd>
            <dt className="text-muted">Student</dt>
            <dd className="font-medium text-foreground">{r.student_label}</dd>
          </dl>
        </section>
      ) : (
        <section aria-live="polite" className="rounded-xl border border-danger/40 bg-danger-soft p-5 shadow-sm">
          <p className="text-lg font-semibold text-danger">We couldn’t verify this receipt</p>
          <p className="mt-2 text-sm text-foreground">The code isn’t recognised. If you were given this receipt on paper, contact the school’s finance office.</p>
        </section>
      )}
      <p className="text-center text-xs text-subtle">EduCore never shows more than this to someone who isn’t signed in.</p>
    </main>
  );
}
