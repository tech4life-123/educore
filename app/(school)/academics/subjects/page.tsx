import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, TextField } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { listSubjects } from "@/services/academics";
import { requireCapability } from "@/services/auth";
import { addStandardSubjects, addSubject, setSubjectActive, updateSubject } from "../actions";

export const metadata: Metadata = { title: "Subjects" };

export default async function SubjectsPage() {
  const { school } = await requireCapability("school.manage", "/academics/subjects");
  const subjects = await listSubjects(school.id);
  const active = subjects.filter((s) => s.is_active);
  const inactive = subjects.filter((s) => !s.is_active);

  return (
    <div className="space-y-6">
      <Card aria-labelledby="subjects-title">
        <CardHeader
          titleId="subjects-title"
          title="Subjects"
          description={`${active.length} active subject${active.length === 1 ? "" : "s"}. Subjects are assigned to classes on each class page.`}
          action={
            <ActionForm action={addStandardSubjects} compact>
              <SubmitButton variant="secondary" size="sm" loadingText="Adding…">
                Add Liberian standard subjects
              </SubmitButton>
            </ActionForm>
          }
        />
        {subjects.length === 0 ? (
          <EmptyState
            icon="subjects"
            title="No subjects yet"
            description="Add the 17 standard Liberian subjects with one click, or add your own below."
          />
        ) : (
          <ul className="divide-y divide-border">
            {[...active, ...inactive].map((subject) => (
              <li key={subject.id} className="flex flex-wrap items-end gap-3 px-5 py-3">
                <ActionForm action={updateSubject} compact className="min-w-0 flex-1" aria-label={`Edit ${subject.name}`}>
                  <input type="hidden" name="id" value={subject.id} />
                  <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
                    <div>
                      <label htmlFor={`sn-${subject.id}`} className="sr-only">
                        Subject name
                      </label>
                      <Input
                        id={`sn-${subject.id}`}
                        name="name"
                        defaultValue={subject.name}
                        maxLength={80}
                        required
                        disabled={!subject.is_active}
                      />
                    </div>
                    <div>
                      <label htmlFor={`sc-${subject.id}`} className="sr-only">
                        Code
                      </label>
                      <Input
                        id={`sc-${subject.id}`}
                        name="code"
                        defaultValue={subject.code}
                        maxLength={12}
                        required
                        className="font-mono uppercase"
                        disabled={!subject.is_active}
                      />
                    </div>
                    {subject.is_active ? (
                      <SubmitButton variant="secondary" loadingText="Saving…" className="h-11">
                        Save
                      </SubmitButton>
                    ) : (
                      <Badge className="h-11 px-3">Inactive</Badge>
                    )}
                  </div>
                </ActionForm>
                <ActionForm action={setSubjectActive} compact className="pb-1">
                  <input type="hidden" name="id" value={subject.id} />
                  <input type="hidden" name="active" value={subject.is_active ? "false" : "true"} />
                  <SubmitButton variant="ghost" size="sm" loadingText="Updating…">
                    {subject.is_active ? "Deactivate" : "Reactivate"}
                  </SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card aria-labelledby="add-subject-title">
        <CardHeader
          titleId="add-subject-title"
          title="Add a subject"
          description="Subjects aren’t deleted, so grades recorded against them stay intact; deactivate a subject you no longer teach."
        />
        <CardBody>
          <ActionForm action={addSubject} resetOnSuccess>
            <div className="grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
              <TextField id="new-subject" name="name" label="Subject name" required maxLength={80} placeholder="e.g. Accounting" />
              <TextField
                id="new-code"
                name="code"
                label="Code"
                required
                maxLength={12}
                placeholder="ACCT"
                className="font-mono uppercase"
              />
              <SubmitButton loadingText="Adding…" className="h-11">
                Add subject
              </SubmitButton>
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}
