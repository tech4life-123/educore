import { formatMoney, METHOD_LABEL } from "@/lib/finance";
import { formatDate } from "@/lib/format";
import type { ReceiptDetail } from "@/services/finance";

export interface ReceiptSchool {
  name: string;
  motto: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
}

/** An official payment receipt, laid out for A4 (screen + print). */
export function ReceiptDocument({ detail, school, qrDataUrl, verifyUrl }: { detail: ReceiptDetail; school: ReceiptSchool; qrDataUrl: string; verifyUrl: string }) {
  const { receipt, student, payment, invoiceNumber, officerName, isValid } = detail;
  const cur = receipt.currency;
  const place = [school.address, school.city, school.county].filter(Boolean).join(", ");
  const contact = [school.phone, school.email].filter(Boolean).join(" · ");

  const rows: [string, string][] = [
    ["Receipt number", receipt.receipt_number],
    ["Date paid", formatDate(payment?.paid_on)],
    ["Student", student?.name ?? "—"],
    ["Admission number", student?.admissionNumber ?? "—"],
    ["Invoice", invoiceNumber ?? "Not linked to an invoice"],
    ["Payment method", payment ? METHOD_LABEL[payment.method] : "—"],
    ...(payment?.provider ? ([["Provider", payment.provider]] as [string, string][]) : []),
    ["Reference", payment?.reference ?? "—"],
    ...(payment?.payer_name ? ([["Paid by", payment.payer_name]] as [string, string][]) : []),
  ];

  return (
    <article className="receipt mx-auto w-full max-w-[210mm] bg-white p-6 text-[13px] leading-snug text-neutral-900 shadow-sm print:max-w-none print:p-0 print:shadow-none sm:p-8">
      <header className="flex items-center gap-4 border-b-4 pb-3" style={{ borderColor: "var(--brand)" }}>
        {school.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- printed documents need the original image
          <img src={school.logo_url} alt="" className="h-16 w-16 shrink-0 object-contain" />
        ) : null}
        <div className="min-w-0 flex-1 text-center">
          <p className="text-lg font-bold uppercase tracking-wide">{school.name}</p>
          {school.motto ? <p className="text-xs italic">“{school.motto}”</p> : null}
          {place ? <p className="text-xs">{place}</p> : null}
          {contact ? <p className="text-xs">{contact}</p> : null}
        </div>
        {school.logo_url ? <div className="w-16 shrink-0" aria-hidden="true" /> : null}
      </header>

      <h1 className="mt-4 text-center text-xl font-bold uppercase tracking-widest">Official receipt</h1>
      {!isValid ? (
        <p className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-center text-sm font-semibold text-red-700">
          This payment has been reversed. This receipt is no longer valid.
        </p>
      ) : null}

      <div className="mt-4 grid gap-6 sm:grid-cols-[1fr_auto]">
        <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-1.5">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-neutral-600">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-col items-center gap-1 self-start">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated on the server */}
          <img src={qrDataUrl} alt="QR code to verify this receipt" width={120} height={120} className="h-[120px] w-[120px]" />
          <p className="max-w-[120px] break-words text-center text-[9px] text-neutral-500">Scan to verify</p>
        </div>
      </div>

      <table className="mt-6 w-full border-collapse text-sm">
        <caption className="sr-only">Amounts</caption>
        <tbody>
          <tr className="border-y border-neutral-300">
            <th scope="row" className="py-2 text-left font-normal text-neutral-600">Balance before this payment</th>
            <td className="py-2 text-right">{formatMoney(receipt.previous_balance, cur)}</td>
          </tr>
          <tr className="border-b border-neutral-300">
            <th scope="row" className="py-2 text-left font-semibold">Amount paid</th>
            <td className="py-2 text-right text-lg font-bold">{formatMoney(receipt.amount, cur)}</td>
          </tr>
          <tr className="border-b border-neutral-300">
            <th scope="row" className="py-2 text-left font-normal text-neutral-600">Remaining balance</th>
            <td className="py-2 text-right font-semibold">{formatMoney(receipt.remaining_balance, cur)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-1 text-xs text-neutral-500">All amounts are in {cur}. Balances are as at the time this receipt was issued.</p>

      <footer className="mt-10 grid grid-cols-2 gap-8 text-xs">
        <div>
          <div className="border-t border-neutral-400 pt-1">Authorised officer</div>
          <p className="font-medium">{officerName ?? "—"}</p>
        </div>
        <div className="text-right">
          <div className="border-t border-neutral-400 pt-1">Issued</div>
          <p className="font-medium">{formatDate(receipt.issued_at.slice(0, 10))}</p>
        </div>
      </footer>
      <p className="mt-6 break-all text-[9px] text-neutral-400">Verify: {verifyUrl}</p>
    </article>
  );
}
