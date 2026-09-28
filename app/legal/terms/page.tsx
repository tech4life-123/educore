import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Terms of Service — EduCore" };

const CONTACT_EMAIL = "wmopolu@gmail.com";
const UPDATED = "27 September 2026";

export default function TermsOfServicePage() {
  return (
    <LegalPage title="Terms of Service" updated={UPDATED}>
      <Section title="Agreement">
        <p>
          These terms apply to a school (the “School”) that creates an EduCore account, and to the staff, students and parents the School
          invites as Users. By using EduCore, the School and its Users agree to these terms. If you are accepting on behalf of a school,
          you confirm you have the authority to do so.
        </p>
      </Section>

      <Section title="The service is provided as-is, at an early stage">
        <p>
          EduCore is actively being developed and has not yet been used by a real school in day-to-day operation. It is provided “as is”
          and “as available”, without warranty of any kind, express or implied, including any warranty of fitness for a particular purpose
          or of uninterrupted, error-free operation. There is currently no guaranteed uptime (service-level agreement). Schools should keep
          their own backups or exports of critical records where practical, until the platform has a track record.
        </p>
      </Section>

      <Section title="Accounts and responsibility">
        <p>
          Each User is responsible for keeping their own sign-in credentials confidential and for activity under their account. A School
          administrator is responsible for creating and deactivating accounts for its own staff, students and parents promptly (for
          example, when someone leaves the school), and for the accuracy of the records it enters.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>Users agree not to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Access, or attempt to access, records or accounts they are not authorised to see;</li>
          <li>Attempt to bypass, disable, or probe the platform’s access controls or security;</li>
          <li>Enter false academic records, or alter grades or attendance outside EduCore’s own grading and record-keeping rules;</li>
          <li>Use the EduCore AI assistant to attempt to extract other students’ information beyond what their own role is allowed to see, or to have it generate content that is abusive, discriminatory, or otherwise inappropriate for a school setting;</li>
          <li>Use the platform to store or transmit content unrelated to its purpose as a school management tool, or that is unlawful.</li>
        </ul>
      </Section>

      <Section title="The EduCore AI assistant">
        <p>
          Where a school switches it on, the AI assistant is a convenience for explaining EduCore, answering general questions, and (for
          data it is authorised to read) summarising a person’s own records. It is not a substitute for EduCore’s own grading engine or
          official report cards, and it can make mistakes. Grades, attendance and report cards shown on EduCore’s own pages are always the
          authoritative record, not anything the assistant says.
        </p>
      </Section>

      <Section title="Ownership of School data">
        <p>
          As between EduCore and the School, the School owns the academic and administrative information it enters. We use it only to
          provide the service to that School, not for any other purpose, and will help a School export its data on reasonable request,
          including on account closure.
        </p>
      </Section>

      <Section title="Fees">
        <p>
          EduCore is currently provided at no charge. If this changes in the future, Schools already using the platform will be given
          advance notice before any fee applies to their account.
        </p>
      </Section>

      <Section title="Suspension and termination">
        <p>
          We may suspend or terminate an account that violates these terms, poses a security risk to other Schools on the platform, or
          where required by law, and will give notice where reasonably possible. A School may stop using EduCore at any time and request
          deletion of its data, subject to any legal requirement to retain particular records.
        </p>
      </Section>

      <Section title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, EduCore and the individuals and organisations operating it are not liable for indirect,
          incidental, or consequential damages arising from use of the service, and our total liability for any claim is limited to the
          fees paid for the service in the preceding twelve months (currently none, per the Fees section above). This section, and the
          rest of these terms, should be reviewed against the law that actually applies before being relied on — see the notice at the top
          of this page.
        </p>
      </Section>

      <Section title="Changes to these terms">
        <p>We may update these terms as the product changes. Material changes will be reflected here with an updated date.</p>
      </Section>

      <Section title="Contact">
        <p>{CONTACT_EMAIL}</p>
      </Section>
    </LegalPage>
  );
}
