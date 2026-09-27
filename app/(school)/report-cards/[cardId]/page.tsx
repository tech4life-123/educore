import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportCard } from "@/components/report-cards/report-card";
import { buttonClasses } from "@/components/ui/button";
import { requireSchoolMember } from "@/services/auth";
import { getPromotionDecisions, getIssuedCard, getRemarks } from "@/services/report-cards";
import { getSchoolProfile } from "@/services/school";

export const metadata: Metadata = { title: "Report card" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ReportCardPage({ params }: PageProps<"/report-cards/[cardId]">) {
  const { school } = await requireSchoolMember("/report-cards");
  const { cardId } = await params;
  if (!UUID.test(cardId)) notFound();
  // RLS returns the card only to admins, the homeroom teacher, the student and linked parents.
  const card = await getIssuedCard(school.id, cardId);
  if (!card) notFound();
  const [profile, remarks, decisions] = await Promise.all([
    getSchoolProfile(school.id),
    getRemarks(school.id, card.termId, { studentId: card.studentId }),
    getPromotionDecisions(school.id, card.academicYearId, [card.studentId]),
  ]);
  if (!profile) notFound();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/report-cards" className="text-sm font-medium text-muted hover:text-foreground">
          ← Report cards
        </Link>
        <a href={`/print/report-cards?card=${card.id}`} target="_blank" rel="noopener" className={buttonClasses("primary", "md")}>
          Print / save as PDF
        </a>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <ReportCard
          data={card.data}
          school={profile}
          remark={remarks.get(card.studentId) ?? null}
          promotionOverride={decisions.get(card.studentId)?.decision ?? null}
          issuedAt={card.issuedAt}
        />
      </div>
    </div>
  );
}
