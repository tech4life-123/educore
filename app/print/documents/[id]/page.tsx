import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { DocumentView } from "@/components/documents/document-view";
import { currentSiteUrl } from "@/lib/site-url";
import { requireSchoolMember } from "@/services/auth";
import { getIssuedDocument } from "@/services/documents";
import { getSchoolProfile } from "@/services/school";
import { DocumentToolbar } from "./toolbar";

export const metadata: Metadata = { title: "Document" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Document staff, and the student or linked parent, can open an issued document — RLS decides. */
export default async function PrintDocumentPage({ params }: PageProps<"/print/documents/[id]">) {
  const { id } = await params;
  const { school, profile } = await requireSchoolMember(`/print/documents/${id}`);
  if (!UUID.test(id)) notFound();
  const doc = await getIssuedDocument(id);
  if (!doc) notFound();
  const schoolProfile = await getSchoolProfile(school.id);
  if (!schoolProfile) notFound();

  const verifyUrl = `${await currentSiteUrl()}/verify/document/${doc.verificationToken}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 240, errorCorrectionLevel: "M" });
  const isStaff = profile.role === "school_admin" || profile.role === "finance_officer" || profile.role === "admissions_officer";

  return (
    <>
      <DocumentToolbar backHref={isStaff ? "/documents" : "/my-documents"} number={doc.documentNumber} />
      <main className="py-6 print:py-0">
        <DocumentView doc={doc} school={schoolProfile} qrDataUrl={qrDataUrl} verifyUrl={verifyUrl} />
      </main>
    </>
  );
}
