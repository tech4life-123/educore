import type { ReceiptSchool } from "@/components/finance/receipt-document";
import { formatDate } from "@/lib/format";
import type { IssuedDocument, TranscriptRecord } from "@/services/documents";

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : (Math.round(Number(n) * 100) / 100).toString());

function Body({ doc }: { doc: IssuedDocument }) {
  const { payload } = doc;
  const name = payload.student?.name ?? "the student";
  const school = payload.school?.name ?? "the school";
  const adm = payload.student?.admission_number;
  const who = (
    <>
      <strong>{name}</strong>
      {adm ? <> (admission number {adm})</> : null}
    </>
  );

  switch (doc.typeCode) {
    case "admission_letter":
      return (
        <div className="space-y-3 text-[14px] leading-relaxed">
          <p>Dear Parent / Guardian,</p>
          <p>
            We are pleased to confirm that {who} has been admitted to <strong>{school}</strong>
            {payload.student?.admission_date ? <> with effect from {formatDate(payload.student.admission_date)}</> : null}
            {payload.class ? <>, in {payload.class}</> : null}
            {payload.academic_year ? <> for the {payload.academic_year} academic year</> : null}.
          </p>
          <p>Please keep this letter safe. Its authenticity can be checked at any time by scanning the QR code below.</p>
        </div>
      );
    case "clearance": {
      const s = payload.financial_standing;
      return (
        <div className="space-y-3 text-[14px] leading-relaxed">
          <p>
            This is to certify that, as at {formatDate(doc.issuedAt.slice(0, 10))}, {who} of <strong>{school}</strong>{" "}
            {s?.cleared ? (
              <>
                <strong>has no outstanding financial obligation</strong> to the school and is financially cleared.
              </>
            ) : (
              <>
                <strong>is not financially cleared</strong>: an outstanding balance remains.
              </>
            )}
          </p>
        </div>
      );
    }
    case "certificate":
      return (
        <div className="space-y-3 text-[14px] leading-relaxed">
          <p>
            This is to certify that {who} is a student of <strong>{school}</strong>
            {payload.class ? <>, {payload.class}</> : null}
            {payload.academic_year ? <> ({payload.academic_year})</> : null}.
          </p>
        </div>
      );
    case "id_card":
      return (
        <dl className="grid max-w-md grid-cols-[9rem_1fr] gap-x-4 gap-y-1.5 text-[14px]">
          <dt className="text-neutral-600">Name</dt>
          <dd className="font-medium">{name}</dd>
          <dt className="text-neutral-600">Admission no.</dt>
          <dd className="font-medium">{adm ?? "—"}</dd>
          <dt className="text-neutral-600">Class</dt>
          <dd className="font-medium">{payload.class ?? "—"}</dd>
          <dt className="text-neutral-600">Year</dt>
          <dd className="font-medium">{payload.academic_year ?? "—"}</dd>
        </dl>
      );
    case "transcript":
    case "replacement_transcript":
    case "report_card_copy":
      return <Transcript doc={doc} who={who} />;
    default:
      return (
        <div className="space-y-3 text-[14px] leading-relaxed">
          <p>
            This document is issued by <strong>{school}</strong> for {who}.
          </p>
        </div>
      );
  }
}

function Transcript({ doc, who }: { doc: IssuedDocument; who: React.ReactNode }) {
  const records: TranscriptRecord[] = doc.payload.records ?? [];
  return (
    <div className="space-y-4 text-[13px]">
      <p>
        Academic record of {who}, as published by the school. Only report cards the school has issued are included.
      </p>
      {records.length === 0 ? (
        <p className="rounded border border-neutral-300 px-3 py-2 text-neutral-600">No published report cards were on file when this document was issued.</p>
      ) : (
        records.map((r, i) => (
          <section key={i} className="break-inside-avoid">
            <h2 className="border-b border-neutral-400 pb-1 text-sm font-semibold">
              {r.academic_year} · {r.term} · {r.class}
            </h2>
            {r.data?.subjects?.length ? (
              <table className="mt-1 w-full border-collapse text-xs">
                <caption className="sr-only">
                  Subjects for {r.academic_year}, {r.term}
                </caption>
                <thead>
                  <tr className="text-left text-neutral-600">
                    <th className="py-1 font-medium">Subject</th>
                    <th className="py-1 text-right font-medium">Semester average</th>
                  </tr>
                </thead>
                <tbody>
                  {r.data.subjects.map((s) => (
                    <tr key={s.name} className="border-t border-neutral-200">
                      <td className="py-1">{s.name}</td>
                      <td className="py-1 text-right">{fmt(s.semesterAverage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            <p className="mt-1 text-xs">
              Overall average: <strong>{fmt(r.average)}</strong>
              {r.rank ? <> · Position {r.rank} of {r.class_size}</> : null}
              {r.data?.promotion ? <> · {r.data.promotion === "promoted" ? "Promoted" : "Not promoted"}</> : null}
            </p>
          </section>
        ))
      )}
    </div>
  );
}

/** An official school document, laid out for A4 (screen + print). The content is the frozen snapshot taken when it was issued. */
export function DocumentView({ doc, school, qrDataUrl, verifyUrl }: { doc: IssuedDocument; school: ReceiptSchool; qrDataUrl: string; verifyUrl: string }) {
  const place = [school.address, school.city, school.county].filter(Boolean).join(", ");
  const contact = [school.phone, school.email].filter(Boolean).join(" · ");
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

      <h1 className="mt-4 text-center text-xl font-bold uppercase tracking-widest">{doc.typeName}</h1>
      {doc.revoked ? (
        <p className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-center text-sm font-semibold text-red-700">
          This document has been withdrawn by the school and is no longer valid.
        </p>
      ) : null}
      <p className="mt-1 text-center text-xs text-neutral-600">
        No. {doc.documentNumber} · Issued {formatDate(doc.issuedAt.slice(0, 10))}
      </p>

      <div className="mt-6">
        <Body doc={doc} />
      </div>

      <footer className="mt-12 grid grid-cols-[1fr_auto] items-end gap-8 text-xs">
        <div>
          <div className="w-56 border-t border-neutral-400 pt-1">Authorised signatory</div>
          <p className="mt-3 text-[10px] text-neutral-500">Issued electronically by EduCore on behalf of {school.name}. Valid without a handwritten signature when the QR code confirms it.</p>
        </div>
        <div className="flex flex-col items-center gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated on the server */}
          <img src={qrDataUrl} alt="QR code to verify this document" width={110} height={110} className="h-[110px] w-[110px]" />
          <p className="text-[9px] text-neutral-500">Scan to verify</p>
        </div>
      </footer>
      <p className="mt-4 break-all text-[9px] text-neutral-400">Verify: {verifyUrl}</p>
    </article>
  );
}
