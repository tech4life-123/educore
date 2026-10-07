-- =============================================================================
-- EduCore — Finance Phase 2: reconciliation centre
--
-- incoming_transactions is the "other side" of the books: money the school's
-- bank / Orange Money / MTN MoMo says it received, as read from a statement
-- or (in later phases) delivered by a bank or provider API or webhook. The
-- table is deliberately the same shape for all of them, so adding automatic
-- feeds later changes how rows ARRIVE, not the schema.
--
-- A transaction is never assigned automatically. A finance officer either
--   * matches it to an existing PENDING payment (same method, amount and
--     currency), or
--   * assigns it to a student/invoice (creating the payment), or
--   * rejects it with a reason.
-- Matching walks the payment through confirmed -> reconciled -> posted, and
-- the posting itself is still the one finance_confirm_payment function, so a
-- receipt is issued and the ledger written exactly as for any other payment.
-- =============================================================================

create type public.transaction_status as enum ('unmatched', 'matched', 'rejected');

create table public.incoming_transactions (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  method           public.payment_method not null,
  amount           numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  currency         text not null check (currency in ('USD', 'LRD')),
  reference        text not null check (char_length(btrim(reference)) between 1 and 100),
  transaction_date date not null,
  payer_name       text check (payer_name is null or char_length(btrim(payer_name)) between 1 and 120),
  payer_phone      text check (payer_phone is null or char_length(btrim(payer_phone)) between 3 and 30),
  notes            text check (notes is null or char_length(notes) <= 500),
  source           text not null default 'manual' check (source in ('manual', 'statement', 'provider')),
  status           public.transaction_status not null default 'unmatched',
  payment_id       uuid,
  status_reason    text,
  created_by       uuid,
  handled_by       uuid,
  handled_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint incoming_transactions_id_school_key unique (id, school_id),
  constraint incoming_transactions_payment_fkey foreign key (payment_id, school_id)
    references public.payments (id, school_id) on delete restrict,
  constraint incoming_matched_has_payment check (status <> 'matched' or payment_id is not null),
  constraint incoming_rejected_has_reason check (status <> 'rejected' or char_length(btrim(coalesce(status_reason, ''))) >= 3)
);
-- The same statement line can't be logged twice (a rejected one may be re-entered).
create unique index incoming_transactions_reference_key
  on public.incoming_transactions (school_id, method, reference) where status <> 'rejected';
create index incoming_transactions_status_idx on public.incoming_transactions (school_id, status, transaction_date desc);
-- one transaction per payment
create unique index incoming_transactions_payment_key on public.incoming_transactions (payment_id) where payment_id is not null;

create or replace function private.guard_incoming_transaction()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Transactions are never deleted; reject them instead' using errcode = '42501';
  end if;
  if new.school_id is distinct from old.school_id or new.method is distinct from old.method
     or new.amount is distinct from old.amount or new.currency is distinct from old.currency
     or new.reference is distinct from old.reference or new.transaction_date is distinct from old.transaction_date
     or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by then
    raise exception 'A logged transaction''s details cannot be changed' using errcode = '42501';
  end if;
  if old.status <> 'unmatched' and (new.status is distinct from old.status or new.payment_id is distinct from old.payment_id) then
    raise exception 'This transaction has already been handled' using errcode = '42501';
  end if;
  return new;
end; $$;

create trigger incoming_transactions_guard before update or delete on public.incoming_transactions
  for each row execute function private.guard_incoming_transaction();
create trigger incoming_transactions_set_updated_at before update on public.incoming_transactions
  for each row execute function private.set_updated_at();

alter table public.incoming_transactions enable row level security;
alter table public.incoming_transactions force row level security;
revoke all on public.incoming_transactions from anon, authenticated;
grant select on public.incoming_transactions to authenticated;

create policy "Finance staff can read their school's incoming transactions"
  on public.incoming_transactions for select to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_finance_staff()));

-- Audit mapping (the receipts migration's version, plus transactions).
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
    when 'incoming_transactions' then case
      when tg_op = 'INSERT' then 'TRANSACTION_LOGGED'
      when v_new ->> 'status' = 'matched' then 'TRANSACTION_MATCHED'
      when v_new ->> 'status' = 'rejected' then 'TRANSACTION_REJECTED'
      else 'TRANSACTION_UPDATED' end
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
        when 'reconciled' then 'PAYMENT_RECONCILED'
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
    case when tg_table_name = 'receipts' then v_new - 'verification_token' else v_new end
  );
  return null;
end;
$$;

revoke all on function private.financial_audit_row_change() from public;

create trigger incoming_transactions_fin_audit after insert or update on public.incoming_transactions
  for each row execute function private.financial_audit_row_change();

-- ---------------------------------------------------------------- functions

-- Log a transaction read from a bank/provider statement.
create or replace function public.finance_log_transaction(
  p_method      public.payment_method,
  p_amount      numeric,
  p_currency    text,
  p_reference   text,
  p_date        date,
  p_payer_name  text,
  p_payer_phone text,
  p_notes       text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.assert_finance_staff();
  v_id     uuid;
begin
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'The amount must be above zero with at most 2 decimals' using errcode = '22023';
  end if;
  if p_date is null or p_date > current_date then
    raise exception 'The transaction date cannot be in the future' using errcode = '22023';
  end if;
  if nullif(btrim(p_reference), '') is null then
    raise exception 'The transaction reference is required' using errcode = '22023';
  end if;

  insert into public.incoming_transactions
    (school_id, method, amount, currency, reference, transaction_date, payer_name, payer_phone, notes, created_by)
  values
    (v_school, p_method, p_amount, p_currency, btrim(p_reference), p_date,
     nullif(btrim(p_payer_name), ''), nullif(btrim(p_payer_phone), ''), nullif(btrim(p_notes), ''),
     private.current_profile_id())
  returning id into v_id;
  return v_id;
end;
$$;

-- Walk a payment to RECONCILED, then post it (which also issues the receipt).
create or replace function private.reconcile_and_post(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.payment_status;
begin
  select status into v_status from public.payments where id = p_payment_id;
  if v_status in ('pending', 'processing') then
    update public.payments set status = 'confirmed' where id = p_payment_id;
    v_status := 'confirmed';
  end if;
  if v_status = 'confirmed' then
    update public.payments set status = 'reconciled' where id = p_payment_id;
  end if;
  perform public.finance_confirm_payment(p_payment_id);
end;
$$;
-- Only reachable from the SECURITY DEFINER functions below; no direct grant.
revoke all on function private.reconcile_and_post(uuid) from public, anon, authenticated;

-- Match a transaction to an existing pending payment.
create or replace function public.finance_match_transaction(p_transaction_id uuid, p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.assert_finance_staff();
  v_tx     public.incoming_transactions%rowtype;
  v_pay    public.payments%rowtype;
begin
  select * into v_tx from public.incoming_transactions where id = p_transaction_id and school_id = v_school for update;
  if not found then raise exception 'Transaction not found' using errcode = '22023'; end if;
  if v_tx.status <> 'unmatched' then raise exception 'This transaction has already been handled' using errcode = '22023'; end if;

  select * into v_pay from public.payments where id = p_payment_id and school_id = v_school for update;
  if not found then raise exception 'Payment not found' using errcode = '22023'; end if;
  if v_pay.status not in ('pending', 'processing') then
    raise exception 'That payment is not waiting for confirmation (status: %)', v_pay.status using errcode = '22023';
  end if;
  if v_pay.method <> v_tx.method or v_pay.currency <> v_tx.currency or v_pay.amount <> v_tx.amount then
    raise exception 'The payment and the transaction must have the same method, currency and amount' using errcode = '22023';
  end if;
  if exists (select 1 from public.incoming_transactions where payment_id = p_payment_id) then
    raise exception 'That payment is already matched to another transaction' using errcode = '22023';
  end if;

  update public.incoming_transactions
     set status = 'matched', payment_id = p_payment_id,
         handled_by = private.current_profile_id(), handled_at = now()
   where id = p_transaction_id;
  perform private.reconcile_and_post(p_payment_id);
end;
$$;

-- "Match a different student": no payment exists yet — create it from the
-- transaction, then reconcile and post it.
create or replace function public.finance_assign_transaction(
  p_transaction_id uuid,
  p_student_id     uuid,
  p_invoice_id     uuid,
  p_note           text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.assert_finance_staff();
  v_tx     public.incoming_transactions%rowtype;
  v_pay    uuid;
begin
  select * into v_tx from public.incoming_transactions where id = p_transaction_id and school_id = v_school for update;
  if not found then raise exception 'Transaction not found' using errcode = '22023'; end if;
  if v_tx.status <> 'unmatched' then raise exception 'This transaction has already been handled' using errcode = '22023'; end if;
  if p_student_id is null then raise exception 'Choose the student' using errcode = '22023'; end if;

  v_pay := public.finance_record_payment(
    p_student_id, p_invoice_id, v_tx.amount, v_tx.currency, v_tx.method, v_tx.reference, null,
    v_tx.transaction_date, v_tx.payer_name,
    coalesce(nullif(btrim(p_note), ''), 'Assigned from the reconciliation centre'),
    'tx-' || v_tx.id::text
  );

  update public.incoming_transactions
     set status = 'matched', payment_id = v_pay,
         handled_by = private.current_profile_id(), handled_at = now()
   where id = p_transaction_id;
  perform private.reconcile_and_post(v_pay);
  return v_pay;
end;
$$;

create or replace function public.finance_reject_transaction(p_transaction_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.assert_finance_staff();
  v_status public.transaction_status;
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  select status into v_status from public.incoming_transactions where id = p_transaction_id and school_id = v_school for update;
  if not found then raise exception 'Transaction not found' using errcode = '22023'; end if;
  if v_status <> 'unmatched' then raise exception 'This transaction has already been handled' using errcode = '22023'; end if;
  update public.incoming_transactions
     set status = 'rejected', status_reason = btrim(p_reason),
         handled_by = private.current_profile_id(), handled_at = now()
   where id = p_transaction_id;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'finance_log_transaction(public.payment_method, numeric, text, text, date, text, text, text)',
    'finance_match_transaction(uuid, uuid)',
    'finance_assign_transaction(uuid, uuid, uuid, text)',
    'finance_reject_transaction(uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
