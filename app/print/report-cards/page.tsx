import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportCard } from "@/components/report-cards/report-card";
import { requireSchoolMember } from "@/services/auth";
import { getIssuedCard, getPromotionDecisions, getRemarks, listIssuedCards, type IssuedCard } from "@/services/report-cards";
import { getSchoolProfile } from "@/services/school";
import { PrintToolbar } from "./print-toolbar";

export const metadata: Metadata = { title: "Print report cards" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Print one card (?card=) or a whole class for a semester (?class=&term=). RLS decides what is returned. */
export default async function PrintReportCards({ searchParams }: PageProps<"/print/report-cards">) {
  const { school } = await requireSchoolMember("/report-cards");
  const params = await searchParams;
  const cardId = typeof params.card === "string" && UUID.test(params.card) ? params.card : null;
  const classId = typeof params.class === "string" && UUID.test(params.class) ? params.class : null;
  const termId = typeof params.term === "string" && UUID.test(params.term) ? params.term : null;

  let cards: IssuedCard[] = [];
  let backHref = "/report-cards";
  if (cardId) {
    const card = await getIssuedCard(school.id, cardId);
    if (card) cards = [card];
    backHref = `/report-cards/${cardId}`;
  } else if (classId && termId) {
    cards = await listIssuedCards(school.id, { classId, termId });
    backHref = `/report-cards?class=${classId}&term=${termId}`;
  }
  if (cards.length === 0) notFound();

  // Alphabetical by surname (last word of the name).
  const surname = (n: string) => n.trim().split(/\s+/).slice(-1)[0] ?? n;
  cards.sort((a, b) => surname(a.data.student.name).localeCompare(surname(b.data.student.name)) || a.data.student.name.localeCompare(b.data.student.name));

  const termOf = cards[0].termId;
  const [profile, remarks, decisions] = await Promise.all([
    getSchoolProfile(school.id),
    getRemarks(school.id, termOf, cardId ? { studentId: cards[0].studentId } : { classId: cards[0].classId }),
    getPromotionDecisions(school.id, cards[0].academicYearId, cards.map((c) => c.studentId)),
  ]);
  if (!profile) notFound();

  return (
    <>
      <PrintToolbar count={cards.length} backHref={backHref} />
      <main className="space-y-6 py-6 print:space-y-0 print:py-0">
        {cards.map((c) => (
          <ReportCard
            key={c.id}
            data={c.data}
            school={profile}
            remark={remarks.get(c.studentId) ?? null}
            promotionOverride={decisions.get(c.studentId)?.decision ?? null}
            issuedAt={c.issuedAt}
          />
        ))}
      </main>
    </>
  );
}
