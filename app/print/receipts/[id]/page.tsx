import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { ReceiptDocument } from "@/components/finance/receipt-document";
import { currentSiteUrl } from "@/lib/site-url";
import { requireSchoolMember } from "@/services/auth";
import { getReceipt } from "@/services/finance";
import { getSchoolProfile } from "@/services/school";
import { ReceiptToolbar } from "./toolbar";

export const metadata: Metadata = { title: "Receipt" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Finance staff, and the student or linked parent, can open a receipt — RLS decides. */
export default async function PrintReceiptPage({ params }: PageProps<"/print/receipts/[id]">) {
  const { id } = await params;
  const { school, profile } = await requireSchoolMember(`/print/receipts/${id}`);
  if (!UUID.test(id)) notFound();
  const detail = await getReceipt(id);
  if (!detail) notFound();
  const schoolProfile = await getSchoolProfile(school.id);
  if (!schoolProfile) notFound();

  const verifyUrl = `${await currentSiteUrl()}/verify/receipt/${detail.receipt.verification_token}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 240, errorCorrectionLevel: "M" });
  const backHref = profile.role === "school_admin" || profile.role === "finance_officer" ? "/finance/payments" : "/dashboard";

  return (
    <>
      <ReceiptToolbar backHref={backHref} number={detail.receipt.receipt_number} />
      <main className="py-6 print:py-0">
        <ReceiptDocument detail={detail} school={schoolProfile} qrDataUrl={qrDataUrl} verifyUrl={verifyUrl} />
      </main>
    </>
  );
}
