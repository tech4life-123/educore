-- =============================================================================
-- EduCore — Finance Phase 6a: discounts, scholarships, waivers and refunds
--
-- Both change what a student owes or has paid, so both go through the same
-- append-only ledger as everything else — nothing is edited or deleted:
--
--   * invoice_adjustments  a discount / scholarship / waiver on an ISSUED
--       invoice. Posts a CREDIT 'adjustment' ledger entry; voiding it posts an
--       offsetting 'reversal'. It lowers the invoice's balance_due, so a fee
--       that is fully waived counts as paid everywhere (documents included).
--   * payment_refunds      money handed back against a POSTED payment (full or
--       partial). Posts a DEBIT 'refund' entry. A fully refunded payment moves
--       to status 'refunded' (its receipt then verifies as not valid).
--
-- Only a school administrator may grant an adjustment or issue a refund; a
-- finance officer records and reconciles but cannot give money away.
-- The balance views are extended with new columns at the END, so everything
-- built on them keeps working.
-- =============================================================================

-- --------------------------------------------------------------- tables

create table public.invoice_adjustments (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  invoice_id       uuid not null,
  student_id       uuid not null,
  kind             text not null check (kind in ('discount', 'scholarship', 'waiver')),
  amount           numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  currency         text not null check (currency in ('USD', 'LRD')),
  reason           text not null check (char_length(btrim(reason)) between 3 and 300),
  status           text not null default 'applied' check (status in ('applied', 'voided')),
  ledger_entry_id  uuid not null,
  voided_reason    text check (voided_reason is null or char_length(btrim(voided_reason)) between 3 and 300),
  voided_entry_id  uuid,
  voided_by        uuid,
  voided_at        timestamptz,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  constraint invoice_adjustments_id_school_key unique (id, school_id),
  constraint invoice_adjustments_invoice_fkey foreign key (invoice_id, school_id)
    references public.invoices (id, school_id) on delete restrict,
  constraint invoice_adjustments_student_fkey foreign key (student_id, school_id)
    references public.profiles (id, school_id) on delete restrict,
  constraint invoice_adjustments_entry_fkey foreign key (ledger_entry_id, school_id)
    references public.student_account_entries (id, school_id) on delete restrict,
  constraint invoice_adjustments_void_entry_fkey foreign key (voided_entry_id, school_id)
    references public.student_account_entries (id, school_id) on delete restrict,
  constraint invoice_adjustments_voided_has_reason check (status <> 'voided' or (voided_reason is not null and voided_entry_id is not null and voided_at is not null))
);
create index invoice_adjustments_invoice_idx on public.invoice_adjustments (invoice_id) where status = 'applied';
create index invoice_adjustments_school_idx on public.invoice_adjustments (school_id, created_at desc);

create table public.payment_refunds (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  payment_id       uuid not null,
  invoice_id       uuid,
  student_id       uuid not null,
  amount           numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  currency         text not null check (currency in ('USD', 'LRD')),
  method           public.payment_method not null,
  reference        text check (reference is null or char_length(btrim(reference)) between 1 and 100),
  reason           text not null check (char_length(btrim(reason)) between 3 and 300),
  refunded_on      date not null default current_date,
  ledger_entry_id  uuid not null,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  constraint payment_refunds_id_school_key unique (id, school_id),
  constraint payment_refunds_payment_fkey foreign key (payment_id, school_id)
    references public.payments (id, school_id) on delete restrict,
  constraint payment_refunds_invoice_fkey foreign key (invoice_id, school_id)
    references public.invoices (id, school_id) on delete restrict,
  constraint payment_refunds_student_fkey foreign key (student_id, school_id)
    references public.profiles (id, school_id) on delete restrict,
  constraint payment_refunds_entry_fkey foreign key (ledger_entry_id, school_id)
    references public.student_account_entries (id, school_id) on delete restrict
);
create index payment_refunds_payment_idx on public.payment_refunds (payment_id);
create index payment_refunds_invoice_idx on public.payment_refunds (invoice_id);
create index payment_refunds_school_idx on public.payment_refunds (school_id, created_at desc);

-- Refunds are permanent. Adjustments change only by being voided, once.
create or replace function private.guard_invoice_adjustment()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Adjustments are never deleted; void them instead' using errcode = '42501';
  end if;
  if old.status <> 'applied' then
    raise exception 'A voided adjustment cannot be changed' using errcode = '42501';
  end if;
  if (to_jsonb(new) - array['status', 'voided_reason', 'voided_entry_id', 'voided_by', 'voided_at'])
     is distinct from (to_jsonb(old) - array['status', 'voided_reason', 'voided_entry_id', 'voided_by', 'voided_at']) then
    raise exception 'An adjustment''s details cannot be changed; void it and apply a new one' using errcode = '42501';
  end if;
  return new;
end; $$;
create trigger invoice_adjustments_guard before update or delete on public.invoice_adjustments
  for each row execute function private.guard_invoice_adjustment();

create or replace function private.guard_payment_refund()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Refunds are permanent; record a new payment to correct one' using errcode = '42501';
end; $$;
create trigger payment_refunds_guard before update or delete on public.payment_refunds
  for each row execute function private.guard_payment_refund();

alter table public.invoice_adjustments enable row level security;
alter table public.invoice_adjustments force row level security;
alter table public.payment_refunds enable row level security;
alter table public.payment_refunds force row level security;
revoke all on public.invoice_adjustments, public.payment_refunds from public, anon, authenticated;
grant select on public.invoice_adjustments, public.payment_refunds to authenticated;

create policy "Finance staff and the family can read adjustments"
  on public.invoice_adjustments for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and ((select private.is_finance_staff()) or (select private.is_self_or_child(student_id)))
  );
create policy "Finance staff and the family can read refunds"
  on public.payment_refunds for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and ((select private.is_finance_staff()) or (select private.is_self_or_child(student_id)))
  );

-- --------------------------------------------------------------- views
-- Same columns as before (same order), new ones appended.

create or replace view public.student_balances with (security_invoker = true) as
select
  e.school_id,
  e.student_id,
  e.currency,
  coalesce(sum(e.amount) filter (where e.entry_type = 'charge'), 0)
    - coalesce(sum(e.amount) filter (where e.entry_type = 'reversal' and e.direction = 'credit' and o.entry_type = 'charge'), 0) as total_charges,
  coalesce(sum(e.amount) filter (where e.entry_type = 'payment'), 0)
    - coalesce(sum(e.amount) filter (where e.entry_type = 'reversal' and e.direction = 'debit' and o.entry_type = 'payment'), 0) as total_paid,
  coalesce(sum(e.amount) filter (where e.direction = 'debit'), 0)
    - coalesce(sum(e.amount) filter (where e.direction = 'credit'), 0) as balance,
  coalesce(sum(e.amount) filter (where e.entry_type = 'adjustment'), 0)
    - coalesce(sum(e.amount) filter (where e.entry_type = 'reversal' and o.entry_type = 'adjustment'), 0) as total_adjustments,
  coalesce(sum(e.amount) filter (where e.entry_type = 'refund'), 0) as total_refunded
from public.student_account_entries e
left join public.student_account_entries o on o.id = e.reverses_entry_id and o.school_id = e.school_id
group by e.school_id, e.student_id, e.currency;

create or replace view public.invoice_balances with (security_invoker = true) as
select
  i.id as invoice_id,
  i.school_id,
  i.invoice_number,
  i.student_id,
  i.currency,
  i.status,
  i.due_date,
  t.total_amount,
  coalesce(p.amount_paid, 0) as amount_paid,
  case when i.status = 'issued'
       then t.total_amount - coalesce(a.adjustments_total, 0) - coalesce(p.amount_paid, 0)
       else 0 end as balance_due,
  case
    when i.status = 'draft' then 'draft'
    when i.status = 'cancelled' then 'cancelled'
    when t.total_amount - coalesce(a.adjustments_total, 0) - coalesce(p.amount_paid, 0) <= 0 then 'paid'
    when i.due_date < current_date then 'overdue'
    when coalesce(p.amount_paid, 0) > 0 or coalesce(a.adjustments_total, 0) > 0 then 'partially_paid'
    else 'issued'
  end as display_status,
  coalesce(a.adjustments_total, 0) as adjustments_total,
  coalesce(rf.amount_refunded, 0) as amount_refunded
from public.invoices i
left join lateral (
  select coalesce(sum(ii.amount), 0) as total_amount from public.invoice_items ii where ii.invoice_id = i.id
) t on true
left join lateral (
  -- net of refunds; a fully refunded payment has status 'refunded' and counts for nothing
  select sum(pa.amount - coalesce((select sum(r.amount) from public.payment_refunds r where r.payment_id = pa.id), 0)) as amount_paid
  from public.payments pa
  where pa.invoice_id = i.id and pa.status = 'posted'
) p on true
left join lateral (
  select sum(x.amount) as adjustments_total from public.invoice_adjustments x
  where x.invoice_id = i.id and x.status = 'applied'
) a on true
left join lateral (
  select sum(r.amount) as amount_refunded from public.payment_refunds r where r.invoice_id = i.id
) rf on true;

-- --------------------------------------------------------------- internals

-- After a waiver or refund, requests that follow the invoice may move on or back.
create or replace function private.doc_advance_for_invoice(p_invoice_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_req uuid;
begin
  if p_invoice_id is null then return; end if;
  for v_req in select id from public.document_requests where invoice_id = p_invoice_id loop
    perform private.doc_advance(v_req);
  end loop;
end; $$;
revoke all on function private.doc_advance_for_invoice(uuid) from public, anon, authenticated;

-- Void one adjustment: offsetting reversal entry, never an edit.
create or replace function private.void_adjustment(p_adjustment_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_adj   public.invoice_adjustments%rowtype;
  v_orig  public.student_account_entries%rowtype;
  v_entry uuid;
begin
  select * into v_adj from public.invoice_adjustments where id = p_adjustment_id for update;
  if not found then raise exception 'Adjustment not found' using errcode = '22023'; end if;
  if v_adj.status <> 'applied' then raise exception 'This adjustment has already been voided' using errcode = '22023'; end if;
  select * into v_orig from public.student_account_entries where id = v_adj.ledger_entry_id;
  insert into public.student_account_entries
    (school_id, account_id, student_id, currency, direction, entry_type, amount, description,
     invoice_id, reverses_entry_id, created_by)
  values
    (v_adj.school_id, v_orig.account_id, v_orig.student_id, v_orig.currency, 'debit', 'reversal', v_orig.amount,
     'Voided: ' || v_orig.description, v_adj.invoice_id, v_orig.id, private.current_profile_id())
  returning id into v_entry;
  update public.invoice_adjustments
     set status = 'voided', voided_reason = btrim(p_reason), voided_entry_id = v_entry,
         voided_by = private.current_profile_id(), voided_at = now()
   where id = p_adjustment_id;
  perform private.log_financial_event(v_adj.school_id, 'ADJUSTMENT_VOIDED', 'invoice_adjustments', p_adjustment_id,
    jsonb_build_object('status', 'applied', 'kind', v_adj.kind, 'amount', v_adj.amount),
    jsonb_build_object('status', 'voided', 'reason', btrim(p_reason)));
  return v_entry;
end; $$;
revoke all on function private.void_adjustment(uuid, text) from public, anon, authenticated;

-- Used when an invoice is cancelled: its adjustments go with it.
create or replace function private.void_invoice_adjustments(p_school_id uuid, p_invoice_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_adj uuid;
begin
  for v_adj in select id from public.invoice_adjustments
                where invoice_id = p_invoice_id and school_id = p_school_id and status = 'applied' loop
    perform private.void_adjustment(v_adj, p_reason);
  end loop;
end; $$;
revoke all on function private.void_invoice_adjustments(uuid, uuid, text) from public, anon, authenticated;

-- --------------------------------------------------------------- public functions

create or replace function public.finance_apply_adjustment(p_invoice_id uuid, p_kind text, p_amount numeric, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_school  uuid := private.assert_school_admin();
  v_inv     public.invoices%rowtype;
  v_due     numeric;
  v_account uuid;
  v_entry   uuid;
  v_id      uuid;
begin
  if p_kind is null or p_kind not in ('discount', 'scholarship', 'waiver') then
    raise exception 'Choose discount, scholarship or waiver' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'The amount must be above zero with at most 2 decimals' using errcode = '22023';
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id and school_id = v_school for update;
  if not found then raise exception 'Invoice not found' using errcode = '22023'; end if;
  if v_inv.status <> 'issued' then
    raise exception 'Only an issued invoice can be adjusted (status: %)', v_inv.status using errcode = '22023';
  end if;

  select ib.balance_due into v_due from public.invoice_balances ib where ib.invoice_id = p_invoice_id;
  if p_amount > v_due then
    raise exception 'That is more than the invoice still owes (%)', v_due using errcode = '22023';
  end if;

  select e.account_id into v_account from public.student_account_entries e
   where e.invoice_id = p_invoice_id and e.entry_type = 'charge' limit 1;

  insert into public.student_account_entries
    (school_id, account_id, student_id, currency, direction, entry_type, amount, description, invoice_id, created_by)
  values
    (v_school, v_account, v_inv.student_id, v_inv.currency, 'credit', 'adjustment', p_amount,
     initcap(p_kind) || ': ' || btrim(p_reason), p_invoice_id, private.current_profile_id())
  returning id into v_entry;

  insert into public.invoice_adjustments
    (school_id, invoice_id, student_id, kind, amount, currency, reason, ledger_entry_id, created_by)
  values
    (v_school, p_invoice_id, v_inv.student_id, p_kind, p_amount, v_inv.currency, btrim(p_reason), v_entry, private.current_profile_id())
  returning id into v_id;

  perform private.log_financial_event(v_school, 'ADJUSTMENT_APPLIED', 'invoice_adjustments', v_id, null,
    jsonb_build_object('invoice_id', p_invoice_id, 'kind', p_kind, 'amount', p_amount, 'currency', v_inv.currency, 'reason', btrim(p_reason)));
  perform private.doc_advance_for_invoice(p_invoice_id);
  return v_id;
end; $$;

create or replace function public.finance_void_adjustment(p_adjustment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid := private.assert_school_admin();
  v_inv    uuid;
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  select invoice_id into v_inv from public.invoice_adjustments where id = p_adjustment_id and school_id = v_school;
  if not found then raise exception 'Adjustment not found' using errcode = '22023'; end if;
  perform private.void_adjustment(p_adjustment_id, p_reason);
  perform private.doc_advance_for_invoice(v_inv);
end; $$;

create or replace function public.finance_refund_payment(
  p_payment_id uuid,
  p_amount     numeric,
  p_method     public.payment_method,
  p_reference  text,
  p_reason     text,
  p_date       date
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_school  uuid := private.assert_school_admin();
  v_pay     public.payments%rowtype;
  v_orig    public.student_account_entries%rowtype;
  v_done    numeric;
  v_date    date := coalesce(p_date, current_date);
  v_entry   uuid;
  v_id      uuid;
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'The amount must be above zero with at most 2 decimals' using errcode = '22023';
  end if;
  if v_date > current_date then
    raise exception 'The refund date cannot be in the future' using errcode = '22023';
  end if;

  select * into v_pay from public.payments where id = p_payment_id and school_id = v_school for update;
  if not found then raise exception 'Payment not found' using errcode = '22023'; end if;
  if v_pay.status <> 'posted' then
    raise exception 'Only a posted payment can be refunded (status: %)', v_pay.status using errcode = '22023';
  end if;

  select coalesce(sum(amount), 0) into v_done from public.payment_refunds where payment_id = p_payment_id;
  if p_amount > v_pay.amount - v_done then
    raise exception 'You can refund at most % on this payment', v_pay.amount - v_done using errcode = '22023';
  end if;

  select * into v_orig from public.student_account_entries where id = v_pay.ledger_entry_id;
  insert into public.student_account_entries
    (school_id, account_id, student_id, currency, direction, entry_type, amount, description,
     invoice_id, payment_id, created_by)
  values
    (v_school, v_orig.account_id, v_orig.student_id, v_orig.currency, 'debit', 'refund', p_amount,
     'Refund: ' || btrim(p_reason), v_pay.invoice_id, v_pay.id, private.current_profile_id())
  returning id into v_entry;

  insert into public.payment_refunds
    (school_id, payment_id, invoice_id, student_id, amount, currency, method, reference, reason, refunded_on, ledger_entry_id, created_by)
  values
    (v_school, v_pay.id, v_pay.invoice_id, v_pay.student_id, p_amount, v_pay.currency, p_method,
     nullif(btrim(p_reference), ''), btrim(p_reason), v_date, v_entry, private.current_profile_id())
  returning id into v_id;

  if v_done + p_amount = v_pay.amount then
    update public.payments set status = 'refunded', status_reason = btrim(p_reason) where id = v_pay.id;
  end if;

  perform private.log_financial_event(v_school, 'REFUND_ISSUED', 'payment_refunds', v_id, null,
    jsonb_build_object('payment_id', v_pay.id, 'amount', p_amount, 'currency', v_pay.currency,
                       'method', p_method, 'full', (v_done + p_amount = v_pay.amount), 'reason', btrim(p_reason)));
  perform private.doc_advance_for_invoice(v_pay.invoice_id);
  return v_id;
end; $$;

revoke all on function public.finance_apply_adjustment(uuid, text, numeric, text) from public, anon;
revoke all on function public.finance_void_adjustment(uuid, text) from public, anon;
revoke all on function public.finance_refund_payment(uuid, numeric, public.payment_method, text, text, date) from public, anon;
grant execute on function public.finance_apply_adjustment(uuid, text, numeric, text) to authenticated;
grant execute on function public.finance_void_adjustment(uuid, text) to authenticated;
grant execute on function public.finance_refund_payment(uuid, numeric, public.payment_method, text, text, date) to authenticated;

-- --------------------------------------------------------------- cancelling takes adjustments with it
-- (the two existing cancel functions, unchanged except for the one added call)

create or replace function public.finance_cancel_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.assert_finance_staff();
  v_inv    public.invoices%rowtype;
  v_entry  public.student_account_entries%rowtype;
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id and school_id = v_school for update;
  if not found then
    raise exception 'Invoice not found' using errcode = '22023';
  end if;
  if v_inv.status = 'cancelled' then
    raise exception 'The invoice is already cancelled' using errcode = '22023';
  end if;

  if v_inv.status = 'issued' then
    if exists (
      select 1 from public.payments p
      where p.invoice_id = p_invoice_id
        and p.status in ('pending', 'processing', 'confirmed', 'reconciled', 'posted')
    ) then
      raise exception 'This invoice has payments. Reverse or reject them before cancelling.' using errcode = '22023';
    end if;

    perform private.void_invoice_adjustments(v_school, p_invoice_id, 'Invoice cancelled');

    for v_entry in
      select * from public.student_account_entries e
      where e.invoice_id = p_invoice_id and e.entry_type = 'charge'
    loop
      insert into public.student_account_entries
        (school_id, account_id, student_id, currency, direction, entry_type, amount, description,
         invoice_id, invoice_item_id, reverses_entry_id, created_by)
      values
        (v_school, v_entry.account_id, v_entry.student_id, v_entry.currency, 'credit', 'reversal', v_entry.amount,
         'Cancelled: ' || v_entry.description, p_invoice_id, v_entry.invoice_item_id, v_entry.id, private.current_profile_id());
    end loop;
  end if;

  update public.invoices
     set status = 'cancelled', cancelled_at = now(), cancelled_by = private.current_profile_id(),
         cancel_reason = btrim(p_reason)
   where id = p_invoice_id;
end;
$$;

create or replace function private.doc_cancel_invoice(p_school_id uuid, p_invoice_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_inv   public.invoices%rowtype;
  v_entry public.student_account_entries%rowtype;
begin
  select * into v_inv from public.invoices where id = p_invoice_id and school_id = p_school_id for update;
  if not found or v_inv.status <> 'issued' then
    return;
  end if;
  if exists (
    select 1 from public.payments p
    where p.invoice_id = p_invoice_id and p.status in ('pending', 'processing', 'confirmed', 'reconciled', 'posted')
  ) then
    raise exception 'The document fee already has a payment. Ask finance to reverse or reject it first.' using errcode = '22023';
  end if;
  perform private.void_invoice_adjustments(p_school_id, p_invoice_id, 'Invoice cancelled');

  for v_entry in
    select * from public.student_account_entries e where e.invoice_id = p_invoice_id and e.entry_type = 'charge'
  loop
    insert into public.student_account_entries
      (school_id, account_id, student_id, currency, direction, entry_type, amount, description,
       invoice_id, invoice_item_id, reverses_entry_id, created_by)
    values (p_school_id, v_entry.account_id, v_entry.student_id, v_entry.currency, 'credit', 'reversal', v_entry.amount,
            'Cancelled: ' || v_entry.description, p_invoice_id, v_entry.invoice_item_id, v_entry.id, private.current_profile_id());
  end loop;
  update public.invoices
     set status = 'cancelled', cancelled_at = now(), cancelled_by = private.current_profile_id(), cancel_reason = p_reason
   where id = p_invoice_id;
end;
$$;
