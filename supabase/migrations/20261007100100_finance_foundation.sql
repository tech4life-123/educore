-- =============================================================================
-- EduCore — Finance, step 2 of 2: foundation (Phase 1)
--
-- Run AFTER 20261007100000_finance_officer_role.sql (a new enum value cannot
-- be used in the transaction that adds it).
--
-- What this adds
--   * finance_settings        one row per school (default currency, invoice prefix)
--   * fee_structures/fee_items  what a school charges (never hard-coded)
--   * student_accounts        one financial account per student
--   * invoices/invoice_items  what a student was billed (amounts are snapshots)
--   * payments                every payment attempt, with a controlled lifecycle
--   * student_account_entries the LEDGER — append-only; balances derive from it
--   * financial_audit_logs    append-only business audit (who did what, before/after)
--   * views: student_balances, invoice_balances, finance_students
--   * functions: create/issue/cancel invoice; record/confirm/reject/reverse payment
--
-- Principles (see ARCHITECTURE.md §23)
--   1. The ledger is the source of truth. Balances are DERIVED in the database
--      (views over student_account_entries) — never stored, never computed in
--      the browser.
--   2. Nothing financial is ever deleted or edited in place. Mistakes are
--      cancelled or reversed with a new offsetting entry.
--   3. Browser roles can only READ financial tables. Every write goes through a
--      SECURITY DEFINER function that re-checks the caller's role and derives
--      the school from the caller's own profile — callers never pass a school.
--   4. A payment reaches the ledger only through finance_confirm_payment, and
--      only a database-side status check (not a client button) decides it.
--   5. Same-school integrity is structural: composite (id, school_id) foreign
--      keys make a cross-school reference impossible, independent of RLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.fee_type as enum (
  'registration', 'tuition', 'examination', 'laboratory', 'library', 'sports',
  'technology', 'transportation', 'boarding', 'graduation', 'transcript',
  'certificate', 'id_card', 'other'
);
-- Stored lifecycle only. "Partially paid" / "paid" / "overdue" are DERIVED from
-- the ledger and due date in the invoice_balances view, so they can't go stale.
create type public.invoice_status as enum ('draft', 'issued', 'cancelled');
create type public.payment_method as enum ('bank', 'orange_money', 'mtn_momo', 'cash', 'other');
create type public.payment_status as enum (
  'pending', 'processing', 'confirmed', 'reconciled', 'posted',
  'failed', 'rejected', 'reversed', 'refunded', 'cancelled'
);
create type public.ledger_direction as enum ('debit', 'credit');
create type public.ledger_entry_type as enum ('charge', 'payment', 'reversal', 'adjustment', 'refund');

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
-- Finance staff = the school's administrators and finance officers.
create or replace function private.is_finance_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_school_id() is not null
     and private.current_app_role() in ('school_admin', 'finance_officer')
$$;

-- Returns the caller's school, or raises unless the caller is finance staff.
create or replace function private.assert_finance_staff()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.current_school_id();
begin
  if v_school is null or private.current_app_role() not in ('school_admin', 'finance_officer') then
    raise exception 'Only school administrators and finance officers can do this' using errcode = '42501';
  end if;
  return v_school;
end;
$$;

grant execute on function private.is_finance_staff() to authenticated;
grant execute on function private.assert_finance_staff() to authenticated;

-- Gap-free per-school, per-year document numbers (INV-2026-00001). The upsert
-- takes a row lock, so two concurrent issuers can never get the same number.
create table public.finance_counters (
  school_id  uuid not null references public.schools(id) on delete cascade,
  kind       text not null check (kind in ('invoice')),
  period     integer not null,
  last_value integer not null default 0,
  primary key (school_id, kind, period)
);
alter table public.finance_counters enable row level security;
alter table public.finance_counters force row level security;
revoke all on public.finance_counters from anon, authenticated;

create or replace function private.next_finance_number(p_school_id uuid, p_kind text, p_period integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value integer;
begin
  insert into public.finance_counters as c (school_id, kind, period, last_value)
  values (p_school_id, p_kind, p_period, 1)
  on conflict (school_id, kind, period) do update set last_value = c.last_value + 1
  returning c.last_value into v_value;
  return v_value;
end;
$$;

-- -----------------------------------------------------------------------------
-- finance_settings — exactly one row per school
-- -----------------------------------------------------------------------------
create table public.finance_settings (
  school_id        uuid primary key references public.schools(id) on delete cascade,
  default_currency text not null default 'USD' check (default_currency in ('USD', 'LRD')),
  invoice_prefix   text not null default 'INV' check (invoice_prefix ~ '^[A-Z0-9]{2,8}$'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create or replace function private.create_default_finance_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.finance_settings (school_id, default_currency)
  values (new.id, case when new.currency in ('USD', 'LRD') then new.currency else 'USD' end)
  on conflict (school_id) do nothing;
  return new;
end;
$$;

create trigger schools_create_default_finance_settings
  after insert on public.schools
  for each row execute function private.create_default_finance_settings();

-- Existing schools get their row now.
insert into public.finance_settings (school_id, default_currency)
select s.id, case when s.currency in ('USD', 'LRD') then s.currency else 'USD' end
from public.schools s
on conflict (school_id) do nothing;

-- -----------------------------------------------------------------------------
-- Fee structures and items (configuration — amounts are never hard-coded)
-- Installments, discounts, waivers: Phase 6.
-- -----------------------------------------------------------------------------
create table public.fee_structures (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 1 and 120),
  academic_year_id uuid not null,
  term_id          uuid,
  grade_level_id   uuid,
  student_category text check (student_category is null or char_length(btrim(student_category)) between 1 and 60),
  currency         text not null check (currency in ('USD', 'LRD')),
  is_active        boolean not null default true,
  notes            text check (notes is null or char_length(notes) <= 1000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint fee_structures_id_school_key unique (id, school_id),
  constraint fee_structures_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete restrict,
  constraint fee_structures_term_fkey foreign key (term_id, school_id)
    references public.academic_terms (id, school_id) on delete restrict,
  constraint fee_structures_grade_fkey foreign key (grade_level_id, school_id)
    references public.grade_levels (id, school_id) on delete restrict
);
create index fee_structures_school_year_idx on public.fee_structures (school_id, academic_year_id);

create table public.fee_items (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  fee_structure_id uuid not null,
  fee_type         public.fee_type not null,
  description      text check (description is null or char_length(btrim(description)) between 1 and 200),
  amount           numeric(12, 2) not null check (amount >= 0 and amount <= 10000000),
  due_date         date,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint fee_items_id_school_key unique (id, school_id),
  constraint fee_items_structure_fkey foreign key (fee_structure_id, school_id)
    references public.fee_structures (id, school_id) on delete restrict
);
create index fee_items_structure_idx on public.fee_items (fee_structure_id);

-- A term must belong to the structure's academic year.
create or replace function private.check_fee_structure_links()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.term_id is not null and not exists (
    select 1 from public.academic_terms t
    where t.id = new.term_id and t.school_id = new.school_id and t.academic_year_id = new.academic_year_id
  ) then
    raise exception 'That term does not belong to the chosen academic year' using errcode = '22023';
  end if;
  return new;
end; $$;

create trigger fee_structures_check_links
  before insert or update on public.fee_structures
  for each row execute function private.check_fee_structure_links();

-- -----------------------------------------------------------------------------
-- Student accounts — one per student, created lazily by the functions below
-- -----------------------------------------------------------------------------
create table public.student_accounts (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null,
  status     text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_accounts_student_key unique (school_id, student_id),
  constraint student_accounts_id_school_key unique (id, school_id),
  constraint student_accounts_student_fkey foreign key (student_id, school_id)
    references public.profiles (id, school_id) on delete restrict
);

create or replace function private.check_student_account_links()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_profile_role(new.student_id, array['student']::public.app_role[], 'Account holder');
  return new;
end; $$;

create trigger student_accounts_check_links
  before insert or update on public.student_accounts
  for each row execute function private.check_student_account_links();

create or replace function private.ensure_student_account(p_school_id uuid, p_student_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.student_accounts (school_id, student_id)
  values (p_school_id, p_student_id)
  on conflict (school_id, student_id) do nothing;
  select a.id into v_id from public.student_accounts a
  where a.school_id = p_school_id and a.student_id = p_student_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Invoices
-- -----------------------------------------------------------------------------
create table public.invoices (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  invoice_number   text,
  student_id       uuid not null,
  guardian_id      uuid,
  academic_year_id uuid not null,
  term_id          uuid,
  currency         text not null check (currency in ('USD', 'LRD')),
  issue_date       date,
  due_date         date not null,
  status           public.invoice_status not null default 'draft',
  notes            text check (notes is null or char_length(notes) <= 1000),
  created_by       uuid,
  issued_by        uuid,
  issued_at        timestamptz,
  cancelled_by     uuid,
  cancelled_at     timestamptz,
  cancel_reason    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint invoices_id_school_key unique (id, school_id),
  constraint invoices_number_key unique (school_id, invoice_number),
  constraint invoices_student_fkey foreign key (student_id, school_id)
    references public.profiles (id, school_id) on delete restrict,
  constraint invoices_guardian_fkey foreign key (guardian_id, school_id)
    references public.profiles (id, school_id) on delete restrict,
  constraint invoices_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete restrict,
  constraint invoices_term_fkey foreign key (term_id, school_id)
    references public.academic_terms (id, school_id) on delete restrict,
  constraint invoices_issued_has_number check (status = 'draft' or status = 'cancelled' or (invoice_number is not null and issued_at is not null)),
  constraint invoices_cancelled_has_reason check (status <> 'cancelled' or (cancelled_at is not null and char_length(btrim(cancel_reason)) >= 3))
);
create index invoices_student_idx on public.invoices (school_id, student_id);
create index invoices_status_due_idx on public.invoices (school_id, status, due_date);

create table public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  invoice_id  uuid not null,
  fee_item_id uuid,
  fee_type    public.fee_type not null,
  description text not null check (char_length(btrim(description)) between 1 and 200),
  amount      numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  created_at  timestamptz not null default now(),
  constraint invoice_items_id_school_key unique (id, school_id),
  constraint invoice_items_invoice_fkey foreign key (invoice_id, school_id)
    references public.invoices (id, school_id) on delete restrict,
  constraint invoice_items_fee_item_fkey foreign key (fee_item_id, school_id)
    references public.fee_items (id, school_id) on delete restrict
);
create index invoice_items_invoice_idx on public.invoice_items (invoice_id);

create or replace function private.check_invoice_links()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_profile_role(new.student_id, array['student']::public.app_role[], 'Invoiced person');
  if new.guardian_id is not null then
    perform private.assert_profile_role(new.guardian_id, array['parent']::public.app_role[], 'Guardian');
    if not exists (
      select 1 from public.guardian_links g
      where g.parent_id = new.guardian_id and g.student_id = new.student_id and g.school_id = new.school_id
    ) then
      raise exception 'That guardian is not linked to this student' using errcode = '22023';
    end if;
  end if;
  if new.term_id is not null and not exists (
    select 1 from public.academic_terms t
    where t.id = new.term_id and t.school_id = new.school_id and t.academic_year_id = new.academic_year_id
  ) then
    raise exception 'That term does not belong to the chosen academic year' using errcode = '22023';
  end if;
  return new;
end; $$;

create trigger invoices_check_links
  before insert or update on public.invoices
  for each row execute function private.check_invoice_links();

-- Invoice identity is fixed once created; lifecycle moves one way only.
create or replace function private.guard_invoice_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.school_id is distinct from old.school_id
     or new.student_id is distinct from old.student_id
     or new.currency is distinct from old.currency
     or new.academic_year_id is distinct from old.academic_year_id
     or new.term_id is distinct from old.term_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or (old.invoice_number is not null and new.invoice_number is distinct from old.invoice_number) then
    raise exception 'Invoice details cannot be changed; cancel the invoice and create a new one' using errcode = '42501';
  end if;
  if old.status <> 'draft' and (new.due_date is distinct from old.due_date or new.guardian_id is distinct from old.guardian_id) then
    raise exception 'An issued invoice cannot be edited' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'draft'  and new.status in ('issued', 'cancelled'))
    or (old.status = 'issued' and new.status = 'cancelled')
  ) then
    raise exception 'Invalid invoice status change (% to %)', old.status, new.status using errcode = '22023';
  end if;
  if old.status = 'cancelled' then
    raise exception 'A cancelled invoice is final' using errcode = '42501';
  end if;
  return new;
end; $$;

create trigger invoices_guard_update
  before update on public.invoices
  for each row execute function private.guard_invoice_update();

-- Items are editable only while the invoice is still a draft.
create or replace function private.guard_invoice_items()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_status public.invoice_status;
begin
  select i.status into v_status from public.invoices i
  where i.id = coalesce(new.invoice_id, old.invoice_id);
  if v_status is distinct from 'draft' then
    raise exception 'Items can only change while the invoice is a draft' using errcode = '42501';
  end if;
  return coalesce(new, old);
end; $$;

create trigger invoice_items_guard
  before insert or update or delete on public.invoice_items
  for each row execute function private.guard_invoice_items();

-- Financial records are never deleted — cancel or reverse instead.
create or replace function private.prevent_financial_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Financial records are never deleted; cancel or reverse them instead' using errcode = '42501';
end; $$;

create trigger invoices_no_delete before delete on public.invoices
  for each row execute function private.prevent_financial_delete();
create trigger student_accounts_no_delete before delete on public.student_accounts
  for each row execute function private.prevent_financial_delete();

-- -----------------------------------------------------------------------------
-- Ledger — append-only
-- -----------------------------------------------------------------------------
create table public.student_account_entries (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  account_id        uuid not null,
  student_id        uuid not null,
  currency          text not null check (currency in ('USD', 'LRD')),
  direction         public.ledger_direction not null,
  entry_type        public.ledger_entry_type not null,
  amount            numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  description       text not null check (char_length(btrim(description)) between 1 and 300),
  entry_date        date not null default current_date,
  invoice_id        uuid,
  invoice_item_id   uuid,
  payment_id        uuid,
  reverses_entry_id uuid,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  constraint student_account_entries_id_school_key unique (id, school_id),
  constraint student_account_entries_account_fkey foreign key (account_id, school_id)
    references public.student_accounts (id, school_id) on delete restrict,
  constraint student_account_entries_student_fkey foreign key (student_id, school_id)
    references public.profiles (id, school_id) on delete restrict,
  constraint student_account_entries_invoice_fkey foreign key (invoice_id, school_id)
    references public.invoices (id, school_id) on delete restrict,
  constraint student_account_entries_item_fkey foreign key (invoice_item_id, school_id)
    references public.invoice_items (id, school_id) on delete restrict,
  constraint student_account_entries_reverses_fkey foreign key (reverses_entry_id, school_id)
    references public.student_account_entries (id, school_id) on delete restrict,
  -- a charge always increases what is owed; a payment always decreases it
  constraint ledger_charge_is_debit check (entry_type <> 'charge' or direction = 'debit'),
  constraint ledger_payment_is_credit check (entry_type <> 'payment' or direction = 'credit'),
  constraint ledger_reversal_points_back check ((entry_type = 'reversal') = (reverses_entry_id is not null))
);
create index ledger_account_idx on public.student_account_entries (school_id, student_id, currency);
create index ledger_invoice_idx on public.student_account_entries (invoice_id);
-- one reversal per entry; one charge per invoice line; one ledger credit per payment
create unique index ledger_one_reversal_key on public.student_account_entries (reverses_entry_id) where reverses_entry_id is not null;
create unique index ledger_one_charge_per_item_key on public.student_account_entries (invoice_item_id) where entry_type = 'charge';
create unique index ledger_one_credit_per_payment_key on public.student_account_entries (payment_id) where entry_type = 'payment';

create or replace function private.ledger_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'The ledger is append-only; post an offsetting entry instead' using errcode = '42501';
end; $$;

create trigger student_account_entries_append_only
  before update or delete on public.student_account_entries
  for each row execute function private.ledger_append_only();

-- -----------------------------------------------------------------------------
-- Payments
-- -----------------------------------------------------------------------------
create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  student_id       uuid not null,
  invoice_id       uuid,
  amount           numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  currency         text not null check (currency in ('USD', 'LRD')),
  method           public.payment_method not null,
  status           public.payment_status not null default 'pending',
  provider         text,
  reference        text check (reference is null or char_length(btrim(reference)) between 1 and 100),
  transaction_id   text check (transaction_id is null or char_length(btrim(transaction_id)) between 1 and 100),
  paid_on          date not null,
  payer_name       text check (payer_name is null or char_length(btrim(payer_name)) between 1 and 120),
  explanation      text check (explanation is null or char_length(btrim(explanation)) between 1 and 500),
  idempotency_key  text check (idempotency_key is null or char_length(idempotency_key) between 8 and 100),
  recorded_by      uuid,
  verified_by      uuid,
  verified_at      timestamptz,
  status_reason    text,
  ledger_entry_id  uuid,
  reversal_entry_id uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint payments_id_school_key unique (id, school_id),
  constraint payments_student_fkey foreign key (student_id, school_id)
    references public.profiles (id, school_id) on delete restrict,
  constraint payments_invoice_fkey foreign key (invoice_id, school_id)
    references public.invoices (id, school_id) on delete restrict,
  constraint payments_ledger_fkey foreign key (ledger_entry_id, school_id)
    references public.student_account_entries (id, school_id) on delete restrict,
  constraint payments_reversal_fkey foreign key (reversal_entry_id, school_id)
    references public.student_account_entries (id, school_id) on delete restrict,
  -- every payment needs a reference; cash/other also need an explanation
  constraint payments_reference_required check (reference is not null),
  constraint payments_manual_needs_explanation check (method not in ('cash', 'other') or explanation is not null)
);
create index payments_student_idx on public.payments (school_id, student_id);
create index payments_invoice_idx on public.payments (invoice_id);
create index payments_status_idx on public.payments (school_id, status);
-- Duplicate protection: the same reference through the same channel can only
-- be live once (a rejected/failed/cancelled attempt may be re-entered).
create unique index payments_reference_key on public.payments (school_id, method, reference)
  where status not in ('failed', 'rejected', 'cancelled');
create unique index payments_idempotency_key on public.payments (school_id, idempotency_key)
  where idempotency_key is not null;

create or replace function private.check_payment_links()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_profile_role(new.student_id, array['student']::public.app_role[], 'Paying student');
  if new.invoice_id is not null and not exists (
    select 1 from public.invoices i
    where i.id = new.invoice_id and i.school_id = new.school_id
      and i.student_id = new.student_id and i.currency = new.currency
  ) then
    raise exception 'The invoice must belong to this student and use the same currency' using errcode = '22023';
  end if;
  return new;
end; $$;

create trigger payments_check_links
  before insert or update on public.payments
  for each row execute function private.check_payment_links();

-- What was paid never changes; status only moves along the allowed paths.
create or replace function private.guard_payment_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.school_id is distinct from old.school_id
     or new.student_id is distinct from old.student_id
     or new.invoice_id is distinct from old.invoice_id
     or new.amount is distinct from old.amount
     or new.currency is distinct from old.currency
     or new.method is distinct from old.method
     or new.reference is distinct from old.reference
     or new.transaction_id is distinct from old.transaction_id
     or new.paid_on is distinct from old.paid_on
     or new.explanation is distinct from old.explanation
     or new.idempotency_key is distinct from old.idempotency_key
     or new.recorded_by is distinct from old.recorded_by
     or new.created_at is distinct from old.created_at then
    raise exception 'A payment''s details cannot be changed; reverse it and record a new one' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if not (
         (old.status = 'pending'    and new.status in ('processing', 'confirmed', 'rejected', 'failed', 'cancelled'))
      or (old.status = 'processing' and new.status in ('confirmed', 'rejected', 'failed', 'cancelled'))
      or (old.status = 'confirmed'  and new.status in ('reconciled', 'posted', 'reversed'))
      or (old.status = 'reconciled' and new.status in ('posted', 'reversed'))
      or (old.status = 'posted'     and new.status in ('reversed', 'refunded'))
    ) then
      raise exception 'Invalid payment status change (% to %)', old.status, new.status using errcode = '22023';
    end if;
    if new.status in ('failed', 'rejected', 'reversed', 'cancelled') and char_length(btrim(coalesce(new.status_reason, ''))) < 3 then
      raise exception 'A reason is required' using errcode = '22023';
    end if;
    if new.status = 'posted' and new.ledger_entry_id is null then
      raise exception 'A payment cannot be posted without its ledger entry' using errcode = '22023';
    end if;
  elsif old.status in ('failed', 'rejected', 'reversed', 'refunded', 'cancelled') then
    raise exception 'This payment is final' using errcode = '42501';
  end if;
  return new;
end; $$;

create trigger payments_guard_update
  before update on public.payments
  for each row execute function private.guard_payment_update();
create trigger payments_no_delete before delete on public.payments
  for each row execute function private.prevent_financial_delete();

-- -----------------------------------------------------------------------------
-- Financial audit log — append-only business audit
-- -----------------------------------------------------------------------------
create table public.financial_audit_logs (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  user_id     uuid,
  actor_role  text,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  old_data    jsonb,
  new_data    jsonb,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
create index financial_audit_school_created_idx on public.financial_audit_logs (school_id, created_at desc);
create index financial_audit_entity_idx on public.financial_audit_logs (entity_type, entity_id);

create trigger financial_audit_logs_append_only
  before update or delete on public.financial_audit_logs
  for each row execute function private.prevent_audit_log_mutation();

-- Single place that writes an audit row (also used by future overrides etc.).
create or replace function private.log_financial_event(
  p_school_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_old jsonb, p_new jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers jsonb;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  insert into public.financial_audit_logs (school_id, user_id, actor_role, action, entity_type, entity_id, old_data, new_data, metadata)
  values (
    p_school_id,
    (select auth.uid()),
    private.current_app_role()::text,
    p_action, p_entity_type, p_entity_id, p_old, p_new,
    jsonb_strip_nulls(jsonb_build_object(
      'user_agent', v_headers ->> 'user-agent',
      'forwarded_for', v_headers ->> 'x-forwarded-for'
    ))
  );
end;
$$;

-- Row-change trigger that names the business event.
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
    v_old, v_new
  );
  return null;
end;
$$;

revoke all on function private.financial_audit_row_change() from public;
revoke all on function private.log_financial_event(uuid, text, text, uuid, jsonb, jsonb) from public;

do $$
declare t text;
begin
  foreach t in array array['finance_settings', 'fee_structures', 'fee_items', 'invoices', 'payments'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.financial_audit_row_change()', t || '_fin_audit', t);
  end loop;
  foreach t in array array['finance_settings', 'fee_structures', 'fee_items', 'student_accounts', 'invoices', 'payments'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Derived balances (security invoker: the caller's own RLS applies)
-- -----------------------------------------------------------------------------
create view public.student_balances with (security_invoker = true) as
select
  e.school_id,
  e.student_id,
  e.currency,
  coalesce(sum(e.amount) filter (where e.entry_type = 'charge'), 0)
    - coalesce(sum(e.amount) filter (where e.entry_type = 'reversal' and e.direction = 'credit'), 0) as total_charges,
  coalesce(sum(e.amount) filter (where e.entry_type = 'payment'), 0)
    - coalesce(sum(e.amount) filter (where e.entry_type = 'reversal' and e.direction = 'debit'), 0) as total_paid,
  coalesce(sum(e.amount) filter (where e.direction = 'debit'), 0)
    - coalesce(sum(e.amount) filter (where e.direction = 'credit'), 0) as balance
from public.student_account_entries e
group by e.school_id, e.student_id, e.currency;

comment on view public.student_balances is
  'Per student and currency: charges, payments and outstanding balance, all derived from the append-only ledger.';

create view public.invoice_balances with (security_invoker = true) as
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
  case when i.status = 'issued' then t.total_amount - coalesce(p.amount_paid, 0) else 0 end as balance_due,
  case
    when i.status = 'draft' then 'draft'
    when i.status = 'cancelled' then 'cancelled'
    when t.total_amount - coalesce(p.amount_paid, 0) <= 0 then 'paid'
    when i.due_date < current_date then 'overdue'
    when coalesce(p.amount_paid, 0) > 0 then 'partially_paid'
    else 'issued'
  end as display_status
from public.invoices i
left join lateral (
  select coalesce(sum(ii.amount), 0) as total_amount from public.invoice_items ii where ii.invoice_id = i.id
) t on true
left join lateral (
  select sum(pa.amount) as amount_paid from public.payments pa
  where pa.invoice_id = i.id and pa.status = 'posted'
) p on true;

comment on view public.invoice_balances is
  'Per invoice: total, amount paid by POSTED payments, balance, and the display status (draft/issued/partially_paid/paid/overdue/cancelled).';

-- Finance staff need to find a student by name or admission number, but must
-- not see the sensitive student record (birth date, address, emergency contact).
-- This view exposes only what an invoice or receipt needs, and only to finance
-- staff of the same school.
create view public.finance_students as
select
  p.school_id,
  p.id as student_id,
  p.first_name,
  p.middle_name,
  p.last_name,
  sp.admission_number,
  p.status
from public.profiles p
left join public.student_profiles sp on sp.profile_id = p.id and sp.school_id = p.school_id
where p.role = 'student'
  and p.school_id = (select private.current_school_id())
  and (select private.is_finance_staff());

-- -----------------------------------------------------------------------------
-- Privileges: browser roles read; everything else goes through functions
-- -----------------------------------------------------------------------------
revoke all on public.finance_settings, public.fee_structures, public.fee_items, public.student_accounts,
  public.invoices, public.invoice_items, public.student_account_entries, public.payments,
  public.financial_audit_logs, public.student_balances, public.invoice_balances, public.finance_students
  from anon, authenticated;

grant select on public.finance_settings, public.fee_structures, public.fee_items, public.student_accounts,
  public.invoices, public.invoice_items, public.student_account_entries, public.payments,
  public.financial_audit_logs, public.student_balances, public.invoice_balances, public.finance_students
  to authenticated;

-- Configuration: a school administrator edits these directly (RLS-gated).
grant update (default_currency, invoice_prefix) on public.finance_settings to authenticated;
grant insert (school_id, name, academic_year_id, term_id, grade_level_id, student_category, currency, is_active, notes)
  on public.fee_structures to authenticated;
grant update (name, term_id, grade_level_id, student_category, is_active, notes) on public.fee_structures to authenticated;
grant delete on public.fee_structures to authenticated;
grant insert (school_id, fee_structure_id, fee_type, description, amount, due_date, is_active)
  on public.fee_items to authenticated;
grant update (fee_type, description, amount, due_date, is_active) on public.fee_items to authenticated;
grant delete on public.fee_items to authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.finance_settings        enable row level security;
alter table public.fee_structures          enable row level security;
alter table public.fee_items               enable row level security;
alter table public.student_accounts        enable row level security;
alter table public.invoices                enable row level security;
alter table public.invoice_items           enable row level security;
alter table public.student_account_entries enable row level security;
alter table public.payments                enable row level security;
alter table public.financial_audit_logs    enable row level security;

alter table public.finance_settings        force row level security;
alter table public.fee_structures          force row level security;
alter table public.fee_items               force row level security;
alter table public.student_accounts        force row level security;
alter table public.invoices                force row level security;
alter table public.invoice_items           force row level security;
alter table public.student_account_entries force row level security;
alter table public.payments                force row level security;
alter table public.financial_audit_logs    force row level security;

-- finance_settings
create policy "Finance staff can read their school's finance settings"
  on public.finance_settings for select to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_finance_staff()));
create policy "School admins can update their school's finance settings"
  on public.finance_settings for update to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_school_admin()))
  with check (school_id = (select private.current_school_id()) and (select private.is_school_admin()));

-- fee_structures / fee_items: finance staff read; only school admins configure
create policy "Finance staff can read fee structures"
  on public.fee_structures for select to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_finance_staff()));
create policy "School admins can create fee structures"
  on public.fee_structures for insert to authenticated
  with check (school_id = (select private.current_school_id()) and (select private.is_school_admin()));
create policy "School admins can update fee structures"
  on public.fee_structures for update to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_school_admin()))
  with check (school_id = (select private.current_school_id()) and (select private.is_school_admin()));
create policy "School admins can delete unused fee structures"
  on public.fee_structures for delete to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_school_admin()));

create policy "Finance staff can read fee items"
  on public.fee_items for select to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_finance_staff()));
create policy "School admins can create fee items"
  on public.fee_items for insert to authenticated
  with check (school_id = (select private.current_school_id()) and (select private.is_school_admin()));
create policy "School admins can update fee items"
  on public.fee_items for update to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_school_admin()))
  with check (school_id = (select private.current_school_id()) and (select private.is_school_admin()));
create policy "School admins can delete unused fee items"
  on public.fee_items for delete to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_school_admin()));

-- Money records: finance staff see the school's; a student or linked parent
-- sees only their own. Drafts are internal; unofficial payment states too.
create policy "Finance staff and the account's family can read accounts"
  on public.student_accounts for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and ((select private.is_finance_staff()) or (select private.is_self_or_child(student_id)))
  );

create policy "Finance staff and the invoiced family can read invoices"
  on public.invoices for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and (
      (select private.is_finance_staff())
      or (status <> 'draft' and (select private.is_self_or_child(student_id)))
    )
  );

create policy "Invoice lines follow the invoice's visibility"
  on public.invoice_items for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and exists (select 1 from public.invoices i where i.id = invoice_items.invoice_id)
  );

create policy "Finance staff and the account's family can read ledger entries"
  on public.student_account_entries for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and ((select private.is_finance_staff()) or (select private.is_self_or_child(student_id)))
  );

create policy "Finance staff and the paying family can read payments"
  on public.payments for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and (
      (select private.is_finance_staff())
      or (status in ('posted', 'reversed', 'refunded') and (select private.is_self_or_child(student_id)))
    )
  );

create policy "Finance staff can read the financial audit log"
  on public.financial_audit_logs for select to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_finance_staff()));

-- A finance officer needs names (students, parents, colleagues) to work, the
-- same way teachers do. They get NO access to the sensitive student record.
create policy "Finance officers can read profiles in their school"
  on public.profiles for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and (select private.current_app_role()) = 'finance_officer'
  );

-- -----------------------------------------------------------------------------
-- Functions — every write to money goes through here
-- -----------------------------------------------------------------------------

-- Create a DRAFT invoice with its lines. Nothing hits the ledger until issued.
create or replace function public.finance_create_invoice(
  p_student_id       uuid,
  p_guardian_id      uuid,
  p_academic_year_id uuid,
  p_term_id          uuid,
  p_currency         text,
  p_due_date         date,
  p_notes            text,
  p_items            jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school     uuid := private.assert_finance_staff();
  v_invoice_id uuid;
  v_item       jsonb;
  v_type       public.fee_type;
  v_amount     numeric;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one fee line' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'An invoice can have at most 50 lines' using errcode = '22023';
  end if;
  if p_due_date is null then
    raise exception 'A due date is required' using errcode = '22023';
  end if;

  insert into public.invoices (school_id, student_id, guardian_id, academic_year_id, term_id, currency, due_date, notes, created_by)
  values (v_school, p_student_id, p_guardian_id, p_academic_year_id, p_term_id, p_currency, p_due_date,
          nullif(btrim(p_notes), ''), private.current_profile_id())
  returning id into v_invoice_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_type := (v_item ->> 'fee_type')::public.fee_type;
    v_amount := (v_item ->> 'amount')::numeric;
    if v_amount is null or v_amount <= 0 or v_amount <> round(v_amount, 2) then
      raise exception 'Each fee line needs an amount above zero with at most 2 decimals' using errcode = '22023';
    end if;
    insert into public.invoice_items (school_id, invoice_id, fee_item_id, fee_type, description, amount)
    values (
      v_school, v_invoice_id, nullif(v_item ->> 'fee_item_id', '')::uuid, v_type,
      coalesce(nullif(btrim(v_item ->> 'description'), ''), initcap(replace(v_type::text, '_', ' '))),
      v_amount
    );
  end loop;

  return v_invoice_id;
end;
$$;

-- Issue a draft: assign its number and post one charge per line to the ledger.
create or replace function public.finance_issue_invoice(p_invoice_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school  uuid := private.assert_finance_staff();
  v_inv     public.invoices%rowtype;
  v_prefix  text;
  v_number  text;
  v_account uuid;
  v_item    public.invoice_items%rowtype;
  v_count   integer := 0;
begin
  select * into v_inv from public.invoices where id = p_invoice_id and school_id = v_school for update;
  if not found then
    raise exception 'Invoice not found' using errcode = '22023';
  end if;
  if v_inv.status <> 'draft' then
    raise exception 'Only a draft invoice can be issued' using errcode = '22023';
  end if;
  if not exists (select 1 from public.invoice_items where invoice_id = p_invoice_id) then
    raise exception 'The invoice has no fee lines' using errcode = '22023';
  end if;

  select f.invoice_prefix into v_prefix from public.finance_settings f where f.school_id = v_school;
  v_number := coalesce(v_prefix, 'INV') || '-' || extract(year from current_date)::int || '-'
    || lpad(private.next_finance_number(v_school, 'invoice', extract(year from current_date)::int)::text, 5, '0');

  v_account := private.ensure_student_account(v_school, v_inv.student_id);

  for v_item in select * from public.invoice_items where invoice_id = p_invoice_id order by created_at, id loop
    insert into public.student_account_entries
      (school_id, account_id, student_id, currency, direction, entry_type, amount, description, invoice_id, invoice_item_id, created_by)
    values
      (v_school, v_account, v_inv.student_id, v_inv.currency, 'debit', 'charge', v_item.amount, v_item.description,
       p_invoice_id, v_item.id, private.current_profile_id());
    v_count := v_count + 1;
  end loop;

  update public.invoices
     set status = 'issued', invoice_number = v_number, issue_date = current_date,
         issued_at = now(), issued_by = private.current_profile_id()
   where id = p_invoice_id;

  return v_number;
end;
$$;

-- Cancel an invoice. If it was issued, its charges are reversed (never deleted).
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

-- Record a payment as PENDING. It does not touch any balance yet.
create or replace function public.finance_record_payment(
  p_student_id      uuid,
  p_invoice_id      uuid,
  p_amount          numeric,
  p_currency        text,
  p_method          public.payment_method,
  p_reference       text,
  p_transaction_id  text,
  p_paid_on         date,
  p_payer_name      text,
  p_explanation     text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school   uuid := private.assert_finance_staff();
  v_existing public.payments%rowtype;
  v_inv      public.invoices%rowtype;
  v_id       uuid;
begin
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'The amount must be above zero with at most 2 decimals' using errcode = '22023';
  end if;
  if p_paid_on is null or p_paid_on > current_date then
    raise exception 'The payment date cannot be in the future' using errcode = '22023';
  end if;
  if nullif(btrim(p_reference), '') is null then
    raise exception 'A receipt or bank/provider reference is required' using errcode = '22023';
  end if;
  if p_method in ('cash', 'other') and nullif(btrim(p_explanation), '') is null then
    raise exception 'An explanation is required for cash and other manual payments' using errcode = '22023';
  end if;

  -- Retrying the same request returns the same payment instead of a duplicate.
  if p_idempotency_key is not null then
    select * into v_existing from public.payments where school_id = v_school and idempotency_key = p_idempotency_key;
    if found then
      if v_existing.student_id <> p_student_id or v_existing.amount <> p_amount then
        raise exception 'That request key was already used for a different payment' using errcode = '22023';
      end if;
      return v_existing.id;
    end if;
  end if;

  if p_invoice_id is not null then
    select * into v_inv from public.invoices where id = p_invoice_id and school_id = v_school;
    if not found or v_inv.status <> 'issued' then
      raise exception 'Payments can only be recorded against an issued invoice' using errcode = '22023';
    end if;
  end if;

  insert into public.payments
    (school_id, student_id, invoice_id, amount, currency, method, reference, transaction_id, paid_on,
     payer_name, explanation, idempotency_key, recorded_by)
  values
    (v_school, p_student_id, p_invoice_id, p_amount, p_currency, p_method, btrim(p_reference),
     nullif(btrim(p_transaction_id), ''), p_paid_on, nullif(btrim(p_payer_name), ''),
     nullif(btrim(p_explanation), ''), p_idempotency_key, private.current_profile_id())
  returning id into v_id;

  return v_id;
end;
$$;

-- Confirm a payment: the ONLY way money reaches a student's ledger.
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

  return v_entry;
end;
$$;

create or replace function public.finance_reject_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.assert_finance_staff();
  v_status public.payment_status;
begin
  select status into v_status from public.payments where id = p_payment_id and school_id = v_school for update;
  if not found then
    raise exception 'Payment not found' using errcode = '22023';
  end if;
  if v_status not in ('pending', 'processing') then
    raise exception 'Only a pending payment can be rejected (status: %)', v_status using errcode = '22023';
  end if;
  update public.payments
     set status = 'rejected', status_reason = btrim(p_reason),
         verified_by = private.current_profile_id(), verified_at = now()
   where id = p_payment_id;
end;
$$;

-- Reverse a posted payment with an offsetting ledger entry (never a delete).
create or replace function public.finance_reverse_payment(p_payment_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.assert_finance_staff();
  v_pay    public.payments%rowtype;
  v_orig   public.student_account_entries%rowtype;
  v_entry  uuid;
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  select * into v_pay from public.payments where id = p_payment_id and school_id = v_school for update;
  if not found then
    raise exception 'Payment not found' using errcode = '22023';
  end if;
  if v_pay.status <> 'posted' then
    raise exception 'Only a posted payment can be reversed (status: %)', v_pay.status using errcode = '22023';
  end if;

  select * into v_orig from public.student_account_entries where id = v_pay.ledger_entry_id;
  insert into public.student_account_entries
    (school_id, account_id, student_id, currency, direction, entry_type, amount, description,
     invoice_id, payment_id, reverses_entry_id, created_by)
  values
    (v_school, v_orig.account_id, v_orig.student_id, v_orig.currency, 'debit', 'reversal', v_orig.amount,
     'Payment reversed: ' || v_pay.reference, v_pay.invoice_id, null, v_orig.id, private.current_profile_id())
  returning id into v_entry;

  update public.payments
     set status = 'reversed', status_reason = btrim(p_reason), reversal_entry_id = v_entry
   where id = p_payment_id;
  return v_entry;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'finance_create_invoice(uuid, uuid, uuid, uuid, text, date, text, jsonb)',
    'finance_issue_invoice(uuid)',
    'finance_cancel_invoice(uuid, text)',
    'finance_record_payment(uuid, uuid, numeric, text, public.payment_method, text, text, date, text, text, text)',
    'finance_confirm_payment(uuid)',
    'finance_reject_payment(uuid, text)',
    'finance_reverse_payment(uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
