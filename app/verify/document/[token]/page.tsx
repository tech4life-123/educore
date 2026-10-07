import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Verify a document", robots: { index: false, follow: false } };

/**
 * Public page a document's QR code opens. No sign-in. It asks the database
 * (verify_document) and shows only what is needed to check a paper document:
 * number, school, type, date, the student's first name + initial, and whether
 * the school still stands behind it. Never grades or full names.
 */
export default async function VerifyDocumentPage({ params }: PageProps<"/verify/document/[token]">) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = /^[0-9a-f]{64}$/i.test(token) ? await supabase.rpc("verify_document", { p_token: token }) : { data: null };
  const d = data?.[0] ?? null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-center text-2xl font-semibold tracking-tight text-foreground">Document verification</h1>
      {d ? (
        <section
          aria-live="polite"
          className={`rounded-xl border p-5 shadow-sm ${d.is_valid ? "border-success/40 bg-success-soft" : "border-danger/40 bg-danger-soft"}`}
        >
          <p className={`text-lg font-semibold ${d.is_valid ? "text-success" : "text-danger"}`}>
            {d.is_valid ? "✓ Genuine document" : "✗ This document was withdrawn by the school and is no longer valid"}
          </p>
          <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted">Document</dt>
            <dd className="font-medium text-foreground">{d.document_type}</dd>
            <dt className="text-muted">Number</dt>
            <dd className="font-medium text-foreground">{d.document_number}</dd>
            <dt className="text-muted">School</dt>
            <dd className="font-medium text-foreground">{d.school_name}</dd>
            <dt className="text-muted">Issued</dt>
            <dd className="font-medium text-foreground">{formatDate(d.issued_on)}</dd>
            <dt className="text-muted">Student</dt>
            <dd className="font-medium text-foreground">{d.student_label}</dd>
          </dl>
        </section>
      ) : (
        <section aria-live="polite" className="rounded-xl border border-danger/40 bg-danger-soft p-5 shadow-sm">
          <p className="text-lg font-semibold text-danger">We couldn’t verify this document</p>
          <p className="mt-2 text-sm text-foreground">The code isn’t recognised. If you were given this document on paper, contact the school’s office.</p>
        </section>
      )}
      <p className="text-center text-xs text-subtle">EduCore never shows more than this to someone who isn’t signed in.</p>
    </main>
  );
}
