import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectField } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { displayLoginId } from "@/lib/auth/login-id";
import { fullName } from "@/lib/format";
import type { GuardianLink, PersonWithLogin } from "@/services/classes";
import { linkGuardian, unlinkGuardian } from "../guardian-actions";

const RELATIONSHIP_OPTIONS = [
  { value: "mother", label: "Mother" },
  { value: "father", label: "Father" },
  { value: "guardian", label: "Guardian" },
  { value: "grandparent", label: "Grandparent" },
  { value: "sibling", label: "Older sibling" },
  { value: "other", label: "Other" },
];
const RELATIONSHIP_LABEL = Object.fromEntries(RELATIONSHIP_OPTIONS.map((o) => [o.value, o.label]));

/**
 * "Children" on a parent's page, or "Parents & guardians" on a student's page.
 * Linking gives the parent read access to that child's records (enforced by RLS).
 */
export function FamilyCard({
  side,
  profileId,
  links,
  candidates,
  schoolCode,
}: {
  side: "children" | "parents";
  profileId: string;
  links: GuardianLink[];
  candidates: PersonWithLogin[];
  schoolCode: string;
}) {
  const linked = new Set(links.map((l) => l.person?.id));
  const options = candidates.filter((c) => !linked.has(c.id) && c.id !== profileId);
  const isParentPage = side === "children";

  return (
    <Card aria-labelledby="family-title">
      <CardHeader
        titleId="family-title"
        title={isParentPage ? "Children" : "Parents & guardians"}
        description={
          isParentPage
            ? "Linked children’s class and, later, attendance and grades are visible to this parent."
            : "Linked parents can see this student’s class and, later, attendance and grades."
        }
      />
      {links.length === 0 ? (
        <EmptyState title={isParentPage ? "No children linked yet" : "No parents linked yet"} />
      ) : (
        <ul className="divide-y divide-border">
          {links.map((link) => (
            <li key={link.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                {link.person ? (
                  <Link href={`/users/${link.person.id}`} className="font-medium text-brand underline-offset-4 hover:underline">
                    {fullName(link.person)}
                  </Link>
                ) : (
                  "—"
                )}
                <p className="text-xs text-muted">
                  {RELATIONSHIP_LABEL[link.relationship] ?? link.relationship}
                  {link.person ? ` · ${displayLoginId(link.person, schoolCode)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {link.is_primary ? <Badge tone="brand">Primary contact</Badge> : null}
                <ActionForm action={unlinkGuardian} compact>
                  <input type="hidden" name="id" value={link.id} />
                  <input type="hidden" name="profile_id" value={profileId} />
                  <ConfirmButton question="Unlink?" confirmLabel="Yes, unlink" pendingLabel="Unlinking…">
                    Unlink
                  </ConfirmButton>
                </ActionForm>
              </div>
            </li>
          ))}
        </ul>
      )}
      <CardBody className="border-t border-border">
        {options.length === 0 ? (
          <p className="text-sm text-muted">
            {isParentPage ? "There are no other student accounts to link." : "There are no other parent accounts to link."}{" "}
            <Link href="/users/new" className="font-medium text-brand underline-offset-4 hover:underline">
              Add a user
            </Link>
          </p>
        ) : (
          <LinkForm side={side} profileId={profileId} options={options} />
        )}
      </CardBody>
    </Card>
  );
}

function LinkForm({ side, profileId, options }: { side: "children" | "parents"; profileId: string; options: PersonWithLogin[] }) {
  const isParentPage = side === "children";
  // One link per submit, so each link gets its own relationship.
  return (
    <ActionForm action={linkGuardian} resetOnSuccess aria-label={isParentPage ? "Link a child" : "Link a parent"}>
      <p className="text-sm font-semibold text-foreground">{isParentPage ? "Link a child" : "Link a parent or guardian"}</p>
      {isParentPage ? <input type="hidden" name="parent_id" value={profileId} /> : <input type="hidden" name="student_id" value={profileId} />}
      <div className="grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <SelectField
          id="link-person"
          name={isParentPage ? "student_id" : "parent_id"}
          label={isParentPage ? "Student" : "Parent / guardian"}
          required
          placeholder="Choose…"
          options={options.map((p) => ({ value: p.id, label: `${p.last_name}, ${p.first_name}${p.username ? ` (${p.username})` : ""}` }))}
        />
        <SelectField id="link-relationship" name="relationship" label="Relationship" defaultValue="guardian" options={RELATIONSHIP_OPTIONS} />
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="is_primary" className="h-5 w-5 accent-[var(--brand)]" />
        <span className="text-foreground">Primary contact</span>
      </label>
      <SubmitButton loadingText="Linking…">Link</SubmitButton>
    </ActionForm>
  );
}

