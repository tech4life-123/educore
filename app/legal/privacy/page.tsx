import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Privacy Policy — EduCore" };

const CONTACT_EMAIL = "wmopolu@gmail.com";
const UPDATED = "27 September 2026";

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={UPDATED}>
      <Section title="Who this policy covers">
        <p>
          EduCore is a school management platform. A school that signs up (the “School”) is the one who decides what student, staff and
          parent information to put into EduCore and why — in privacy terms, the School is the <strong>data controller</strong>. EduCore
          acts as the School’s <strong>data processor</strong>: we store and process the information the School and its staff, students and
          parents (“Users”) put in, on the School’s instructions and only to run the platform.
        </p>
        <p>
          If you are a student, parent or teacher with questions about your own records, the fastest route is your school’s
          administrator — they control the account and can see, correct or remove your information directly. Contact details for the team
          operating EduCore itself are at the bottom of this page.
        </p>
      </Section>

      <Section title="What information we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Account information:</strong> name, role, school, and an email or username used to sign in.</li>
          <li>
            <strong>Academic records a school chooses to enter:</strong> enrolment, classes, assessment scores, computed grades, report
            cards, attendance marks, and announcements.
          </li>
          <li><strong>Guardian links:</strong> which parent/guardian accounts are linked to which student accounts.</li>
          <li>
            <strong>Usage and security information:</strong> sign-in activity and basic technical logs (e.g. errors), kept to operate and
            secure the service.
          </li>
          <li>
            <strong>EduCore AI usage (only where a school has it switched on):</strong> when a question was asked, by which role, at which
            school, which of the assistant’s built-in tools it used, and token/cost counts — kept to enforce fair-use limits and to debug
            problems. <strong>The words of the question and the assistant’s answer are never stored</strong> — that conversation exists only
            in the person’s browser while the panel is open, and is gone when it’s closed or the page is reloaded.
          </li>
        </ul>
        <p>We do not collect government ID numbers, payment details, or precise location, and we do not use advertising or tracking cookies.</p>
      </Section>

      <Section title="Children’s and students’ information">
        <p>
          Much of what EduCore stores is about students, some of whom are minors. Because the School is the data controller, the School is
          responsible for having a lawful basis to hold this information (for example, its role as the young person’s school) and for
          meeting any parental-consent or notice requirements that apply where it operates. EduCore’s role is to store what the School
          enters securely and to enforce, in software, that each person can only see the records their role allows.
        </p>
      </Section>

      <Section title="Who can see what">
        <p>
          Access is restricted by role and enforced by the database itself, not only by the app’s screens: a student sees only their own
          records; a parent sees only their linked children’s; a teacher sees only the classes and students they teach; a school
          administrator sees their own school; and EduCore’s own platform administrators see school-level totals for support and billing
          purposes, not individual student records, unless a school administrator grants access for support.
        </p>
      </Section>

      <Section title="Where information is stored">
        <p>
          EduCore’s database is hosted by Supabase (built on cloud infrastructure in the European Union) and the application itself runs on
          Vercel’s hosting network. This means information is stored and processed outside Liberia. If your school is bound by rules about
          where student information may be stored, please confirm this arrangement works before entering real student data.
        </p>
      </Section>

      <Section title="Sharing with others">
        <p>
          We do not sell information or share it for advertising. Information is shared only with the infrastructure providers above (to
          run the service) and, where a school switches on the AI assistant, with the AI provider that powers it (Anthropic) — which
          receives only the current question, the minimum data the assistant’s tools fetch to answer it, and never a stored conversation
          history, since none is kept.
        </p>
      </Section>

      <Section title="How long we keep information">
        <p>
          Academic records are kept for as long as the School’s account is active, so students, parents and staff can see current and past
          results. A School can ask us to export or delete its data when it leaves the platform. We have not yet set a fixed retention
          schedule for closed accounts or graduated students — this is one of the items still to be defined before this policy is finalised.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Every school’s data is isolated from every other school’s at the database level, not only by the application’s screens.
          Connections are encrypted in transit, and production secrets are kept out of the code the browser ever sees. No system is
          perfectly secure, and we will tell affected schools promptly if we learn of a security incident involving their data.
        </p>
      </Section>

      <Section title="Your choices and requests">
        <p>
          To see, correct, export or delete information about yourself or your child, please start with your school administrator, who
          controls the account. If you are a school administrator and need help doing this, or have a question we haven’t answered here,
          contact us at the email below.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>We may update this policy as the product changes. Material changes will be reflected here with an updated date.</p>
      </Section>

      <Section title="Contact">
        <p>{CONTACT_EMAIL}</p>
      </Section>
    </LegalPage>
  );
}
