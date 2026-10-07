-- =============================================================================
-- EduCore — Finance Phase 2: receipts
--
-- A receipt is issued automatically at the moment a payment is confirmed and
-- posted (inside finance_confirm_payment — there is no other way to get one).
-- It is a SNAPSHOT: the balances before and after are stored on it, so the
-- document never changes later even if the student's account does. If the
-- payment is later reversed, the receipt stays on file but the public
-- verification page reports it as no longer valid (status is read live).
--
-- Public verification: the QR code on a receipt encodes a long random token.
-- verify_receipt(token) returns the few facts needed to check a paper receipt
-- (receipt number, school, date, amount, student first name + last initial,
-- whether the payment still stands). It returns nothing for an unknown token.
-- =============================================================================

-- Receipt numbers share the gap-free per-school/year counter table.
alter table public.finance_counters drop constraint if exists finance_counters_kind_check;
alter table public.finance_counters add constraint finance_counters_kind_check check (kind in ('invoice', 'receipt'));

create table public.receipts (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools(id) on delete cascade,
  receipt_number     text not null,
  payment_id         uuid not null,
  student_id         uuid not null,
  invoice_id         uuid,
  currency           text not null check (currency in ('USD', 'LRD')),
  amount             numeric(12, 2) not null check (amount > 0),
  previous_balance   numeric(12, 2) not null,
  remaining_balance  numeric(12, 2) not null,
  verification_token text not null
                       default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  issued_by          uuid,
  issued_at          timestamptz not null default now(),
  constraint receipts_id_school_key unique (id, school_id),
  constraint receipts_number_key unique (school_id, receipt_number),
  constraint receipts_payment_key unique (payment_id),
  constraint receipts_token_key unique (verification_token),
  constraint receipts_payment_fkey foreign key (payment_id, school_id)
    references public.payments (id, school_id) on delete restrict,
  constraint receipts_student_fkey foreign key (student_id, school_id)
    references public.profiles (id, school_id) on delete restrict,
  constraint receipts_invoice_fkey foreign key (invoice_id, school_id)
    references public.invoices (id, school_id) on delete restrict
);
create index receipts_student_idx on public.receipts (school_id, student_id);

create or replace function private.receipts_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Receipts cannot be changed or deleted; reverse the payment instead' using errcode = '42501';
end; $$;

create trigger receipts_no_change before update or delete on public.receipts
  for each row execute function private.receipts_immutable();

alter table public.receipts enable row level security;
alter table public.receipts force row level security;
revoke all on public.receipts from anon, authenticated;
grant select on public.receipts to authenticated;

create policy "Finance staff and the paying family can read receipts"
  on public.receipts for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and ((select private.is_finance_staff()) or (select private.is_self_or_child(student_id)))
  );

-- Audit: receipts are logged like every other finance record.
create or replace function private.financial_audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old    jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new    jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row    jsonb := coalesce(v_new, v_old);
  v_action text;
begin
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return null;
  end if;

  v_action := case tg_table_name
    when 'fee_structures' then 'FEE_CHANGED'
    when 'fee_items' then 'FEE_CHANGED'
    when 'finance_settings' then 'FINANCE_SETTINGS_CHANGED'
    when 'receipts' then 'RECEIPT_GENERATED'
    when 'invoices' then case
      when tg_op = 'INSERT' then 'INVOICE_CREATED'
      when v_new ->> 'status' = 'issued' and v_old ->> 'status' = 'draft' then 'INVOICE_ISSUED'
      when v_new ->> 'status' = 'cancelled' and v_old ->> 'status' <> 'cancelled' then 'INVOICE_CANCELLED'
      else 'INVOICE_UPDATED' end
    when 'payments' then case
      when tg_op = 'INSERT' then 'PAYMENT_CREATED'
      when v_new ->> 'status' is not distinct from v_old ->> 'status' then 'PAYMENT_UPDATED'
      else case v_new ->> 'status'
        when 'confirmed' then 'PAYMENT_CONFIRMED'
        when 'posted' then 'PAYMENT_POSTED'
        when 'rejected' then 'PAYMENT_REJECTED'
        when 'reversed' then 'PAYMENT_REVERSED'
        when 'refunded' then 'PAYMENT_REFUNDED'
        when 'failed' then 'PAYMENT_FAILED'
        when 'cancelled' then 'PAYMENT_CANCELLED'
        else 'PAYMENT_UPDATED' end
      end
    else upper(tg_table_name) || '_' || tg_op
  end;

  perform private.log_financial_event(
    (v_row ->> 'school_id')::uuid,
    v_action, tg_table_name,
    case tg_table_name when 'finance_settings' then (v_row ->> 'school_id')::uuid else (v_row ->> 'id')::uuid end,
    v_old,
    -- the verification token is a bearer secret; keep it out of the log
    case when tg_table_name = 'receipts' then v_new - 'verification_token' else v_new end
  );
  return null;
end;
$$;

revoke all on function private.financial_audit_row_change() from public;

create trigger receipts_fin_audit after insert on public.receipts
  for each row execute function private.financial_audit_row_change();

-- finance_confirm_payment, now also issuing the receipt (same signature).
create or replace function public.finance_confirm_payment(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school  uuid := private.assert_finance_staff();
  v_pay     public.payments%rowtype;
  v_account uuid;
  v_entry   uuid;
  v_total   numeric;
  v_paid    numeric;
  v_prev    numeric;
  v_year    integer := extract(year from current_date)::int;
begin
  select * into v_pay from public.payments where id = p_payment_id and school_id = v_school for update;
  if not found then
    raise exception 'Payment not found' using errcode = '22023';
  end if;
  if v_pay.status not in ('pending', 'processing', 'confirmed', 'reconciled') then
    raise exception 'This payment can no longer be confirmed (status: %)', v_pay.status using errcode = '22023';
  end if;

  if v_pay.invoice_id is not null then
    -- lock the invoice so two concurrent confirmations cannot overpay it
    perform 1 from public.invoices where id = v_pay.invoice_id for update;
    select coalesce(sum(amount), 0) into v_total from public.invoice_items where invoice_id = v_pay.invoice_id;
    select coalesce(sum(amount), 0) into v_paid from public.payments where invoice_id = v_pay.invoice_id and status = 'posted';
    if v_paid + v_pay.amount > v_total then
      raise exception 'This payment is more than the invoice still owes' using errcode = '22023';
    end if;
  end if;

  v_account := private.ensure_student_account(v_school, v_pay.student_id);

  -- the student's balance in this currency just before this payment
  select coalesce(sum(case e.direction when 'debit' then e.amount else -e.amount end), 0) into v_prev
  from public.student_account_entries e
  where e.school_id = v_school and e.student_id = v_pay.student_id and e.currency = v_pay.currency;

  insert into public.student_account_entries
    (school_id, account_id, student_id, currency, direction, entry_type, amount, description,
     invoice_id, payment_id, entry_date, created_by)
  values
    (v_school, v_account, v_pay.student_id, v_pay.currency, 'credit', 'payment', v_pay.amount,
     'Payment (' || replace(v_pay.method::text, '_', ' ') || ') ref ' || v_pay.reference,
     v_pay.invoice_id, v_pay.id, v_pay.paid_on, private.current_profile_id())
  returning id into v_entry;

  if v_pay.status in ('pending', 'processing') then
    update public.payments set status = 'confirmed' where id = p_payment_id;
  end if;
  update public.payments
     set status = 'posted', ledger_entry_id = v_entry,
         verified_by = private.current_profile_id(), verified_at = now()
   where id = p_payment_id;

  insert into public.receipts
    (school_id, receipt_number, payment_id, student_id, invoice_id, currency, amount,
     previous_balance, remaining_balance, issued_by)
  values
    (v_school,
     'RCT-' || v_year || '-' || lpad(private.next_finance_number(v_school, 'receipt', v_year)::text, 5, '0'),
     v_pay.id, v_pay.student_id, v_pay.invoice_id, v_pay.currency, v_pay.amount,
     v_prev, v_prev - v_pay.amount, private.current_profile_id());

  return v_entry;
end;
$$;

revoke all on function public.finance_confirm_payment(uuid) from public, anon;
grant execute on function public.finance_confirm_payment(uuid) to authenticated;

-- Public verification (QR target). Unknown or malformed token -> no rows.
create or replace function public.verify_receipt(p_token text)
returns table (
  receipt_number text,
  school_name    text,
  issued_on      date,
  amount         numeric,
  currency       text,
  student_label  text,
  payment_status public.payment_status,
  is_valid       boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.receipt_number, s.name, r.issued_at::date, r.amount, r.currency,
         split_part(btrim(p.first_name), ' ', 1) || ' ' || left(btrim(p.last_name), 1) || '.',
         pay.status, pay.status = 'posted'
  from public.receipts r
  join public.schools s on s.id = r.school_id
  join public.profiles p on p.id = r.student_id
  join public.payments pay on pay.id = r.payment_id
  where char_length(coalesce(p_token, '')) >= 32
    and r.verification_token = p_token
$$;

revoke all on function public.verify_receipt(text) from public;
grant execute on function public.verify_receipt(text) to anon, authenticated;
