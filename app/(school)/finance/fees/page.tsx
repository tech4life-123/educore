import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, TextField } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CURRENCIES, FEE_TYPE_LABEL, FEE_TYPE_OPTIONS, formatMoney } from "@/lib/finance";
import { requireCapability } from "@/services/auth";
import { getAcademicYear, getCurrentAcademicYear, listAcademicYears } from "@/services/academics";
import { getFinanceSettings, listFeeStructures } from "@/services/finance";
import { addFeeItemAction, createFeeStructureAction, removeFeeItemAction, updateFinanceSettingsAction } from "../actions";

export const metadata: Metadata = { title: "Fees" };

export default async function FeesPage() {
  const { school, profile } = await requireCapability("finance.manage", "/finance/fees");
  const isAdmin = profile.role === "school_admin";
  const [settings, structures, years, current] = await Promise.all([
    getFinanceSettings(),
    listFeeStructures(),
    listAcademicYears(school.id),
    getCurrentAcademicYear(school.id),
  ]);
  const currentDetail = current ? await getAcademicYear(school.id, current.id) : null;

  return (
    <div className="space-y-6">
      {!isAdmin ? (
        <p className="text-sm text-muted">Fee structures are set by a school administrator. You can see them here and use them when creating invoices.</p>
      ) : null}

      {settings ? (
        <Card aria-labelledby="settings-title">
          <CardHeader titleId="settings-title" title="Finance settings" description="Applies to new invoices only. Existing invoices keep their number and currency." />
          <CardBody>
            {isAdmin ? (
              <ActionForm action={updateFinanceSettingsAction} aria-label="Finance settings">
                <div className="grid gap-4 sm:grid-cols-3 sm:items-end">
                  <SelectField id="default_currency" name="default_currency" label="Default currency" options={CURRENCIES.map((c) => ({ value: c, label: c }))} defaultValue={settings.default_currency} />
                  <TextField id="invoice_prefix" name="invoice_prefix" label="Invoice number prefix" defaultValue={settings.invoice_prefix} maxLength={8} hint="Invoices are numbered PREFIX-YEAR-00001." />
                  <SubmitButton loadingText="Saving…">Save settings</SubmitButton>
                </div>
              </ActionForm>
            ) : (
              <p className="text-sm text-foreground">
                Default currency <strong>{settings.default_currency}</strong> · invoice prefix <strong>{settings.invoice_prefix}</strong>
              </p>
            )}
          </CardBody>
        </Card>
      ) : null}

      {isAdmin ? (
        <Card aria-labelledby="new-structure-title">
          <CardHeader titleId="new-structure-title" title="New fee structure" description="A named set of fees for a year or term, e.g. “Grade 10 — Term 1”. Each structure uses one currency." />
          <CardBody>
            <ActionForm action={createFeeStructureAction} resetOnSuccess aria-label="New fee structure">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField id="name" name="name" label="Name" required maxLength={120} />
                <SelectField id="currency" name="currency" label="Currency" required options={CURRENCIES.map((c) => ({ value: c, label: c }))} defaultValue={settings?.default_currency ?? "USD"} />
                <SelectField id="academic_year_id" name="academic_year_id" label="Academic year" required placeholder="Choose…" options={years.map((y) => ({ value: y.id, label: y.name }))} defaultValue={current?.id ?? ""} />
                <SelectField
                  id="term_id"
                  name="term_id"
                  label="Term (optional)"
                  placeholder="Whole year"
                  options={(currentDetail?.academic_terms ?? []).map((t) => ({ value: t.id, label: `${t.name} (${currentDetail?.name})` }))}
                  hint="Terms of the current year. A term must belong to the chosen year."
                />
              </div>
              <SubmitButton loadingText="Creating…">Create fee structure</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      ) : null}

      {structures.length === 0 ? (
        <Card>
          <EmptyState icon="finance" title="No fee structures yet" description={isAdmin ? "Create one above, then add its fee items." : "A school administrator needs to set these up."} />
        </Card>
      ) : (
        structures.map((s) => (
          <Card key={s.id} aria-label={s.name}>
            <CardHeader
              title={s.name}
              description={`${s.academicYear}${s.term ? ` · ${s.term}` : ""} · ${s.currency}`}
              action={<Badge tone={s.isActive ? "success" : "neutral"}>{s.isActive ? "Active" : "Inactive"}</Badge>}
            />
            {s.items.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">No fee items yet.</p>
            ) : (
              <Table caption={`Fee items in ${s.name}`}>
                <THead>
                  <TR>
                    <TH>Fee</TH>
                    <TH>Description</TH>
                    <TH className="text-right">Amount</TH>
                    {isAdmin ? (
                      <TH>
                        <span className="sr-only">Actions</span>
                      </TH>
                    ) : null}
                  </TR>
                </THead>
                <TBody>
                  {s.items.map((i) => (
                    <TR key={i.id}>
                      <TD>{FEE_TYPE_LABEL[i.fee_type]}</TD>
                      <TD>{i.description}</TD>
                      <TD className="text-right">{formatMoney(i.amount, s.currency)}</TD>
                      {isAdmin ? (
                        <TD>
                          <ActionForm action={removeFeeItemAction} compact aria-label={`Remove ${FEE_TYPE_LABEL[i.fee_type]}`}>
                            <input type="hidden" name="fee_item_id" value={i.id} />
                            <ConfirmButton question="Remove it?" confirmLabel="Yes, remove" pendingLabel="Removing…">
                              Remove
                            </ConfirmButton>
                          </ActionForm>
                        </TD>
                      ) : null}
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
            {isAdmin ? (
              <div className="border-t border-border px-5 py-4">
                <ActionForm action={addFeeItemAction} resetOnSuccess compact aria-label={`Add fee item to ${s.name}`}>
                  <input type="hidden" name="fee_structure_id" value={s.id} />
                  <div className="grid gap-2 sm:grid-cols-[12rem_1fr_9rem_auto] sm:items-center">
                    <select name="fee_type" aria-label="Fee type" defaultValue="tuition" className="block h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-foreground sm:text-sm">
                      {FEE_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <Input name="description" aria-label="Description" placeholder="Description (optional)" maxLength={200} />
                    <Input name="amount" aria-label="Amount" inputMode="decimal" placeholder="0.00" />
                    <SubmitButton size="sm" loadingText="Adding…">
                      Add item
                    </SubmitButton>
                  </div>
                </ActionForm>
              </div>
            ) : null}
          </Card>
        ))
      )}
    </div>
  );
}
