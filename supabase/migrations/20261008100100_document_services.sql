-- =============================================================================
-- EduCore — Document services (finance spec Phase 3)
--
--   * document_types      per-school catalogue: fee, payment/clearance/approval rules
--   * document_requests   one request per student + type, with a controlled lifecycle
--   * issued_documents    the generated document: numbered, QR-verifiable snapshot
--   * functions: doc_seed_types, doc_save_type, doc_request, doc_cancel_request,
--                doc_review_request, doc_generate, doc_mark, doc_revoke,
--                student_clearance, verify_document
--
-- Principles (see ARCHITECTURE.md §25)
--   1. Rules are DATA, not code: a school decides per document whether it needs a
--      fee, financial clearance and/or approval. Nothing is hard-coded.
--   2. A document fee is a normal invoice on the student's ledger; the request only
--      follows the invoice. The financial engine is untouched.
--   3. An unpaid balance never hides academic records — it only holds the
--      documents the school configured to require clearance.
--   4. Overriding a payment/clearance requirement is school-admin only, only where
--      the document type allows it, needs a reason, and is audited.
--   5. A generated document is an immutable snapshot with its own verification
--      token; it can be revoked (with a reason) but never edited or deleted.
-- =============================================================================

create type public.document_request_status as enum (
  'requested', 'payment_pending', 'paid', 'under_review', 'approved',
  'generated', 'printed', 'delivered', 'rejected', 'cancelled'
);

alter table public.finance_counters drop constraint if exists finance_counters_kind_check;
alter table public.finance_counters add constraint finance_counters_kind_check check (kind in ('invoice', 'receipt', 'document'));

-- -----------------------------------------------------------------------------
-- Who may process documents
-- -----------------------------------------------------------------------------
create or replace function private.is_document_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.current_school_id() is not null
     and private.current_app_role() in ('school_admin', 'finance_officer', 'admissions_officer')
$$;

-- Admins and finance officers handle every document; an admissions officer only
-- the types the school marked as admissions documents.
create or replace function private.can_process_document_type(p_type_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  -- plpgsql on purpose: document_types is created below, and this body is only resolved when called.
  return exists (
    select 1 from public.document_types t
    where t.id = p_type_id
      and t.school_id = private.current_school_id()
      and (
        private.current_app_role() in ('school_admin', 'finance_officer')
        or (private.current_app_role() = 'admissions_officer' and t.admissions_handled)
      )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- document_types
-- -----------------------------------------------------------------------------
create table public.document_types (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools(id) on delete cascade,
  code                text not null check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  name                text not null check (char_length(btrim(name)) between 2 and 80),
  description         text check (description is null or char_length(description) <= 300),
  fee_amount          numeric(12,2) not null default 0 check (fee_amount >= 0),
  currency            text check (currency is null or currency in ('USD', 'LRD')),
  requires_payment    boolean not null default false,
  requires_clearance  boolean not null default false,
  requires_approval   boolean not null default false,
  allow_override      boolean not null default false,
  admissions_handled  boolean not null default false,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint document_types_code_key unique (school_id, code),
  constraint document_types_id_school_key unique (id, school_id),
  constraint document_types_payment_needs_fee check (not requires_payment or fee_amount > 0)
);
create trigger document_types_updated before update on public.document_types
  for each row execute function private.set_updated_at();

alter table public.document_types enable row level security;
alter table public.document_types force row level security;
revoke all on public.document_types from anon, authenticated;
grant select on public.document_types to authenticated;
create policy document_types_select on public.document_types for select to authenticated
  using (school_id = private.current_school_id());

-- -----------------------------------------------------------------------------
-- document_requests
-- -----------------------------------------------------------------------------
create table public.document_requests (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  student_id       uuid not null,
  document_type_id uuid not null,
  requested_by     uuid not null,
  status           public.document_request_status not null default 'requested',
  invoice_id       uuid,
  note             text check (note is null or char_length(note) <= 500),
  -- approval
  reviewed_by      uuid,
  reviewed_at      timestamptz,
  review_decision  text check (review_decision in ('approved', 'rejected')),
  review_note      text check (review_note is null or char_length(review_note) <= 500),
  -- override of payment/clearance (school admin, audited)
  override_by      uuid,
  override_reason  text check (override_reason is null or char_length(override_reason) between 3 and 500),
  override_waived  text[],
  cancelled_reason text check (cancelled_reason is null or char_length(cancelled_reason) <= 300),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint document_requests_id_school_key unique (id, school_id),
  constraint document_requests_student_fkey foreign key (student_id, school_id)
    references public.profiles (id, school_id) on delete restrict,
  constraint document_requests_requester_fkey foreign key (requested_by, school_id)
    references public.profiles (id, school_id) on delete restrict,
  constraint document_requests_type_fkey foreign key (document_type_id, school_id)
    references public.document_types (id, school_id) on delete restrict,
  constraint document_requests_invoice_fkey foreign key (invoice_id, school_id)
    references public.invoices (id, school_id) on delete restrict
);
create index document_requests_school_status_idx on public.document_requests (school_id, status, created_at desc);
create index document_requests_student_idx on public.document_requests (student_id, school_id);
create index document_requests_invoice_idx on public.document_requests (invoice_id) where invoice_id is not null;
-- One open request per student and document type.
create unique index document_requests_one_open on public.document_requests (student_id, document_type_id)
  where status in ('requested', 'payment_pending', 'paid', 'under_review', 'approved');
create trigger document_requests_updated before update on public.document_requests
  for each row execute function private.set_updated_at();

-- Lifecycle guard: terminal states stay terminal, and a generated document never
-- goes back to an earlier state.
create or replace function private.document_request_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.school_id <> old.school_id or new.student_id <> old.student_id or new.document_type_id <> old.document_type_id
       or new.requested_by <> old.requested_by then
      raise exception 'A document request''s student, type and requester cannot change' using errcode = '22023';
    end if;
    if new.status <> old.status then
      if old.status in ('delivered', 'rejected', 'cancelled') then
        raise exception 'A % request cannot change any more', old.status using errcode = '22023';
      end if;
      if old.status in ('generated', 'printed') and new.status not in ('printed', 'delivered') then
        raise exception 'A generated document cannot go back to %', new.status using errcode = '22023';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger document_requests_guard before insert or update on public.document_requests
  for each row execute function private.document_request_guard();

alter table public.document_requests enable row level security;
alter table public.document_requests force row level security;
revoke all on public.document_requests from anon, authenticated;
grant select on public.document_requests to authenticated;
create policy document_requests_select on public.document_requests for select to authenticated
  using (
    school_id = private.current_school_id()
    and (
      private.is_self_or_child(student_id)
      or requested_by = private.current_profile_id()
      or private.can_process_document_type(document_type_id)
    )
  );


-- -----------------------------------------------------------------------------
-- issued_documents — immutable snapshot with its own QR token
-- -----------------------------------------------------------------------------
create table public.issued_documents (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools(id) on delete cascade,
  request_id         uuid not null,
  student_id         uuid not null,
  document_type_id   uuid not null,
  document_number    text not null,
  verification_token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  payload            jsonb not null check (jsonb_typeof(payload) = 'object'),
  issued_by          uuid not null,
  issued_at          timestamptz not null default now(),
  revoked_at         timestamptz,
  revoked_by         uuid,
  revoke_reason      text,
  constraint issued_documents_request_key unique (request_id),
  constraint issued_documents_number_key unique (school_id, document_number),
  constraint issued_documents_id_school_key unique (id, school_id),
  constraint issued_documents_request_fkey foreign key (request_id, school_id)
    references public.document_requests (id, school_id) on delete restrict,
  constraint issued_documents_student_fkey foreign key (student_id, school_id)
    references public.profiles (id, school_id) on delete restrict,
  constraint issued_documents_type_fkey foreign key (document_type_id, school_id)
    references public.document_types (id, school_id) on delete restrict,
  constraint issued_documents_revoked_has_reason check (revoked_at is null or char_length(btrim(revoke_reason)) >= 3)
);
create index issued_documents_student_idx on public.issued_documents (student_id, school_id);

-- Immutable except for the one-way revocation fields.
create or replace function private.issued_documents_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Issued documents cannot be deleted' using errcode = '22023';
  end if;
  if to_jsonb(new) - 'revoked_at' - 'revoked_by' - 'revoke_reason'
     is distinct from to_jsonb(old) - 'revoked_at' - 'revoked_by' - 'revoke_reason' then
    raise exception 'An issued document cannot be edited' using errcode = '22023';
  end if;
  if old.revoked_at is not null then
    raise exception 'This document is already revoked' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger issued_documents_guard before update or delete on public.issued_documents
  for each row execute function private.issued_documents_guard();

alter table public.issued_documents enable row level security;
alter table public.issued_documents force row level security;
revoke all on public.issued_documents from anon, authenticated;
grant select (id, school_id, request_id, student_id, document_type_id, document_number, verification_token, payload,
              issued_by, issued_at, revoked_at, revoke_reason)
  on public.issued_documents to authenticated;
create policy issued_documents_select on public.issued_documents for select to authenticated
  using (
    school_id = private.current_school_id()
    and (private.is_self_or_child(student_id) or private.can_process_document_type(document_type_id))
  );

-- -----------------------------------------------------------------------------
-- document_request_details — one read model for every screen
--   Staff (e.g. an admissions officer) are not allowed to read the student
--   directory or the finance tables, but they must see WHO a request is for and
--   whether its fee is paid. This view joins exactly that and applies the same
--   visibility as the document_requests policy (it runs as its owner, so the
--   WHERE clause below is the access rule — keep it identical to the policy).
-- -----------------------------------------------------------------------------
create view public.document_request_details with (security_barrier = true) as
select
  r.id, r.school_id, r.student_id, r.document_type_id, r.requested_by, r.status, r.invoice_id, r.note,
  r.reviewed_by, r.reviewed_at, r.review_decision, r.review_note,
  r.override_reason, r.override_waived, r.cancelled_reason, r.created_at, r.updated_at,
  t.code as type_code, t.name as type_name, t.fee_amount, t.currency as type_currency,
  t.requires_payment, t.requires_clearance, t.requires_approval, t.allow_override,
  p.first_name, p.middle_name, p.last_name, sp.admission_number,
  ib.invoice_number, ib.display_status as invoice_status, ib.balance_due as invoice_balance_due,
  ib.currency as invoice_currency,
  d.id as document_id, d.document_number, d.revoked_at as document_revoked_at
from public.document_requests r
join public.document_types t on t.id = r.document_type_id and t.school_id = r.school_id
join public.profiles p on p.id = r.student_id and p.school_id = r.school_id
left join public.student_profiles sp on sp.profile_id = r.student_id and sp.school_id = r.school_id
left join public.invoice_balances ib on ib.invoice_id = r.invoice_id
left join public.issued_documents d on d.request_id = r.id
where r.school_id = private.current_school_id()
  and (
    private.is_self_or_child(r.student_id)
    or r.requested_by = private.current_profile_id()
    or private.can_process_document_type(r.document_type_id)
  );
revoke all on public.document_request_details from public, anon, authenticated;
grant select on public.document_request_details to authenticated;

-- -----------------------------------------------------------------------------
-- Financial clearance — reusable, rule-driven
--   Cleared = no outstanding balance in any currency, ignoring the document's own
--   fee invoice (so "fee AND clearance" works: the fee is checked separately).
-- -----------------------------------------------------------------------------
create or replace function private.clearance_for(p_school_id uuid, p_student_id uuid, p_exclude_invoice uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_holds jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('currency', x.currency, 'balance', x.owed) order by x.currency), '[]'::jsonb)
    into v_holds
  from (
    select b.currency,
           b.balance - coalesce((
             select ib.balance_due from public.invoice_balances ib
             where ib.invoice_id = p_exclude_invoice and ib.currency = b.currency
           ), 0) as owed
    from public.student_balances b
    where b.school_id = p_school_id and b.student_id = p_student_id
  ) x
  where x.owed > 0;
  return jsonb_build_object('cleared', jsonb_array_length(v_holds) = 0, 'holds', v_holds);
end;
$$;

-- For the UI: is this student financially cleared? Family and school staff only.
create or replace function public.student_clearance(p_student_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_school uuid := private.current_school_id();
begin
  if v_school is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not (private.is_self_or_child(p_student_id) or private.is_document_staff()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_student_id and p.school_id = v_school) then
    raise exception 'Student not found' using errcode = '22023';
  end if;
  return private.clearance_for(v_school, p_student_id, null);
end;
$$;
revoke all on function public.student_clearance(uuid) from public, anon;
grant execute on function public.student_clearance(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Internals
-- -----------------------------------------------------------------------------
-- Is the payment requirement satisfied for this request?
create or replace function private.doc_payment_ok(p_req public.document_requests, p_type public.document_types)
returns boolean language sql stable security definer set search_path = '' as $$
  select not p_type.requires_payment
      or exists (
        select 1 from public.invoice_balances ib
        where ib.invoice_id = p_req.invoice_id and ib.status = 'issued' and ib.balance_due <= 0
      )
$$;

-- Recompute where a request stands after anything changed (payment posted or
-- reversed, approval given). Never touches generated/terminal requests.
create or replace function private.doc_advance(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.document_requests%rowtype;
  t public.document_types%rowtype;
  v_target public.document_request_status;
begin
  select * into r from public.document_requests where id = p_request_id for update;
  if not found or r.status not in ('requested', 'payment_pending', 'paid', 'under_review', 'approved') then
    return;
  end if;
  select * into t from public.document_types where id = r.document_type_id;

  if not private.doc_payment_ok(r, t) then
    v_target := 'payment_pending';
  elsif t.requires_approval and r.review_decision is distinct from 'approved' then
    v_target := 'under_review';
  else
    v_target := 'approved';
  end if;
  if v_target <> r.status then
    update public.document_requests set status = v_target where id = r.id;
  end if;
end;
$$;

-- Payments post or reverse -> the requests following that invoice move on or back.
create or replace function private.doc_on_payment_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_req uuid;
begin
  if new.invoice_id is null or new.status is not distinct from old.status then
    return null;
  end if;
  if new.status not in ('posted', 'reversed') and old.status not in ('posted') then
    return null;
  end if;
  for v_req in select id from public.document_requests where invoice_id = new.invoice_id loop
    perform private.doc_advance(v_req);
  end loop;
  return null;
end;
$$;
create trigger payments_document_sync after update of status on public.payments
  for each row execute function private.doc_on_payment_change();

-- Create + issue a fee invoice for a request (same ledger steps as the finance
-- functions, but callable by a student/parent, who can't call those).
create or replace function private.doc_create_invoice(
  p_school_id uuid, p_student_id uuid, p_guardian_id uuid, p_type public.document_types
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_year     uuid;
  v_currency text;
  v_fee      public.fee_type;
  v_inv      uuid;
  v_item     uuid;
  v_prefix   text;
  v_number   text;
  v_account  uuid;
begin
  select a.id into v_year from public.academic_years a where a.school_id = p_school_id and a.is_current;
  if v_year is null then
    raise exception 'The school has no current academic year, so a fee cannot be invoiced' using errcode = '22023';
  end if;
  select coalesce(p_type.currency, f.default_currency, 'USD'), f.invoice_prefix
    into v_currency, v_prefix
  from (select 1) d left join public.finance_settings f on f.school_id = p_school_id;
  v_fee := case p_type.code
    when 'transcript' then 'transcript' when 'replacement_transcript' then 'transcript'
    when 'certificate' then 'certificate' when 'id_card' then 'id_card' else 'other' end;

  insert into public.invoices (school_id, student_id, guardian_id, academic_year_id, currency, due_date, notes, created_by)
  values (p_school_id, p_student_id, p_guardian_id, v_year, v_currency, current_date,
          'Document fee: ' || p_type.name, private.current_profile_id())
  returning id into v_inv;
  insert into public.invoice_items (school_id, invoice_id, fee_type, description, amount)
  values (p_school_id, v_inv, v_fee, p_type.name, p_type.fee_amount)
  returning id into v_item;

  v_number := coalesce(v_prefix, 'INV') || '-' || extract(year from current_date)::int || '-'
    || lpad(private.next_finance_number(p_school_id, 'invoice', extract(year from current_date)::int)::text, 5, '0');
  v_account := private.ensure_student_account(p_school_id, p_student_id);
  insert into public.student_account_entries
    (school_id, account_id, student_id, currency, direction, entry_type, amount, description, invoice_id, invoice_item_id, created_by)
  values (p_school_id, v_account, p_student_id, v_currency, 'debit', 'charge', p_type.fee_amount, p_type.name, v_inv, v_item,
          private.current_profile_id());
  update public.invoices
     set status = 'issued', invoice_number = v_number, issue_date = current_date,
         issued_at = now(), issued_by = private.current_profile_id()
   where id = v_inv;
  return v_inv;
end;
$$;

-- Cancel an unpaid document invoice (ledger charges are reversed, never deleted).
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

-- -----------------------------------------------------------------------------
-- Admin: seed and edit document types
-- -----------------------------------------------------------------------------
create or replace function public.doc_seed_types()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid := private.current_school_id();
  v_n integer;
begin
  if v_school is null or private.current_app_role() <> 'school_admin' then
    raise exception 'Only a school administrator can do this' using errcode = '42501';
  end if;
  insert into public.document_types (school_id, code, name, description, admissions_handled)
  values
    (v_school, 'admission_letter', 'Admission letter', 'Confirms the student''s admission to the school.', true),
    (v_school, 'transcript', 'Official transcript', 'The student''s published report cards, term by term.', false),
    (v_school, 'replacement_transcript', 'Replacement transcript', 'A new copy of a transcript already issued.', false),
    (v_school, 'certificate', 'Certificate', 'Certificate of completion or attendance.', false),
    (v_school, 'clearance', 'Clearance letter', 'States the student''s financial standing with the school.', false),
    (v_school, 'id_card', 'Student ID card', 'Identity document for the student.', false),
    (v_school, 'report_card_copy', 'Report card copy', 'A certified copy of a published report card.', false)
  on conflict (school_id, code) do nothing;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform private.log_financial_event(v_school, 'DOCUMENT_TYPES_SEEDED', 'document_types', v_school, null, jsonb_build_object('added', v_n));
  end if;
  return v_n;
end;
$$;

create or replace function public.doc_save_type(
  p_id uuid, p_code text, p_name text, p_description text, p_fee numeric, p_currency text,
  p_requires_payment boolean, p_requires_clearance boolean, p_requires_approval boolean,
  p_allow_override boolean, p_admissions_handled boolean, p_active boolean
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid := private.current_school_id();
  v_id uuid;
  v_old jsonb;
  v_new jsonb;
begin
  if v_school is null or private.current_app_role() <> 'school_admin' then
    raise exception 'Only a school administrator can do this' using errcode = '42501';
  end if;
  if p_fee is null or p_fee < 0 or p_fee <> round(p_fee, 2) then
    raise exception 'The fee must be zero or more, with at most 2 decimals' using errcode = '22023';
  end if;
  if coalesce(p_requires_payment, false) and p_fee <= 0 then
    raise exception 'Set a fee above zero, or turn off "payment required"' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.document_types
      (school_id, code, name, description, fee_amount, currency, requires_payment, requires_clearance,
       requires_approval, allow_override, admissions_handled, active)
    values
      (v_school, lower(btrim(p_code)), btrim(p_name), nullif(btrim(p_description), ''), p_fee, nullif(p_currency, ''),
       coalesce(p_requires_payment, false), coalesce(p_requires_clearance, false), coalesce(p_requires_approval, false),
       coalesce(p_allow_override, false), coalesce(p_admissions_handled, false), coalesce(p_active, true))
    returning id into v_id;
    select to_jsonb(t) into v_new from public.document_types t where t.id = v_id;
    perform private.log_financial_event(v_school, 'DOCUMENT_TYPE_SAVED', 'document_types', v_id, null, v_new);
  else
    select to_jsonb(t) into v_old from public.document_types t where t.id = p_id and t.school_id = v_school;
    if v_old is null then
      raise exception 'Document type not found' using errcode = '22023';
    end if;
    update public.document_types set
      name = btrim(p_name), description = nullif(btrim(p_description), ''), fee_amount = p_fee,
      currency = nullif(p_currency, ''), requires_payment = coalesce(p_requires_payment, false),
      requires_clearance = coalesce(p_requires_clearance, false), requires_approval = coalesce(p_requires_approval, false),
      allow_override = coalesce(p_allow_override, false), admissions_handled = coalesce(p_admissions_handled, false),
      active = coalesce(p_active, true)
    where id = p_id and school_id = v_school;
    v_id := p_id;
    select to_jsonb(t) into v_new from public.document_types t where t.id = v_id;
    perform private.log_financial_event(v_school, 'DOCUMENT_TYPE_SAVED', 'document_types', v_id, v_old, v_new);
  end if;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Request workflow
-- -----------------------------------------------------------------------------
create or replace function public.doc_request(p_student_id uuid, p_type_id uuid, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_school  uuid := private.current_school_id();
  v_me      uuid := private.current_profile_id();
  v_role    public.app_role := private.current_app_role();
  v_type    public.document_types%rowtype;
  v_req     uuid;
  v_invoice uuid;
begin
  if v_school is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  -- Students and parents request for themselves / their linked children; staff for anyone in the school.
  if not (private.is_self_or_child(p_student_id) or v_role in ('school_admin', 'finance_officer', 'admissions_officer')) then
    raise exception 'You can only request documents for yourself or your child' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_student_id and p.school_id = v_school and p.role = 'student') then
    raise exception 'Student not found' using errcode = '22023';
  end if;
  select * into v_type from public.document_types where id = p_type_id and school_id = v_school;
  if not found or not v_type.active then
    raise exception 'This document is not available' using errcode = '22023';
  end if;
  if v_role = 'admissions_officer' and not v_type.admissions_handled then
    raise exception 'Admissions officers can only handle admission documents' using errcode = '42501';
  end if;

  insert into public.document_requests (school_id, student_id, document_type_id, requested_by, note)
  values (v_school, p_student_id, p_type_id, v_me, nullif(btrim(p_note), ''))
  returning id into v_req;

  if v_type.requires_payment then
    v_invoice := private.doc_create_invoice(
      v_school, p_student_id, case when v_role = 'parent' then v_me else null end, v_type);
    update public.document_requests set invoice_id = v_invoice where id = v_req;
  end if;
  perform private.doc_advance(v_req);
  perform private.log_financial_event(v_school, 'DOCUMENT_REQUESTED', 'document_requests', v_req, null,
    jsonb_build_object('student_id', p_student_id, 'document_type_id', p_type_id, 'invoice_id', v_invoice));
  return v_req;
exception when unique_violation then
  raise exception 'There is already an open request for this document' using errcode = '23505';
end;
$$;

create or replace function public.doc_cancel_request(p_request_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid := private.current_school_id();
  r public.document_requests%rowtype;
begin
  if v_school is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into r from public.document_requests where id = p_request_id and school_id = v_school for update;
  if not found then
    raise exception 'Request not found' using errcode = '22023';
  end if;
  if not (r.requested_by = private.current_profile_id() or private.can_process_document_type(r.document_type_id)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if r.status not in ('requested', 'payment_pending', 'paid', 'under_review', 'approved') then
    raise exception 'This request can no longer be cancelled' using errcode = '22023';
  end if;
  if r.invoice_id is not null then
    perform private.doc_cancel_invoice(v_school, r.invoice_id, 'Document request cancelled');
  end if;
  update public.document_requests set status = 'cancelled', cancelled_reason = left(btrim(coalesce(p_reason, '')), 300)
   where id = r.id;
  perform private.log_financial_event(v_school, 'DOCUMENT_REQUEST_CANCELLED', 'document_requests', r.id,
    jsonb_build_object('status', r.status), jsonb_build_object('status', 'cancelled'));
end;
$$;

create or replace function public.doc_review_request(p_request_id uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid := private.current_school_id();
  r public.document_requests%rowtype;
begin
  select * into r from public.document_requests where id = p_request_id and school_id = v_school for update;
  if not found then
    raise exception 'Request not found' using errcode = '22023';
  end if;
  if not private.can_process_document_type(r.document_type_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if r.status not in ('requested', 'payment_pending', 'paid', 'under_review', 'approved') then
    raise exception 'This request can no longer be reviewed' using errcode = '22023';
  end if;
  if not p_approve and char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'Give a reason when rejecting' using errcode = '22023';
  end if;

  update public.document_requests
     set reviewed_by = private.current_profile_id(), reviewed_at = now(),
         review_decision = case when p_approve then 'approved' else 'rejected' end,
         review_note = nullif(btrim(p_note), ''),
         status = case when p_approve then status else 'rejected' end
   where id = r.id;
  if not p_approve and r.invoice_id is not null then
    perform private.doc_cancel_invoice(v_school, r.invoice_id, 'Document request rejected');
  end if;
  if p_approve then
    perform private.doc_advance(r.id);
  end if;
  perform private.log_financial_event(v_school, case when p_approve then 'DOCUMENT_APPROVED' else 'DOCUMENT_REJECTED' end,
    'document_requests', r.id, jsonb_build_object('status', r.status), jsonb_build_object('note', nullif(btrim(p_note), '')));
end;
$$;

-- Build the document's content from live records, frozen at the moment of issue.
create or replace function private.doc_build_payload(p_school_id uuid, p_student_id uuid, p_type public.document_types, p_clearance jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_student jsonb;
  v_school jsonb;
  v_class text;
  v_year text;
  v_records jsonb := '[]'::jsonb;
begin
  select jsonb_build_object(
           'name', concat_ws(' ', p.first_name, p.middle_name, p.last_name),
           'admission_number', sp.admission_number,
           'date_of_birth', sp.date_of_birth,
           'gender', sp.gender,
           'admission_date', sp.admission_date)
    into v_student
  from public.profiles p
  left join public.student_profiles sp on sp.profile_id = p.id and sp.school_id = p.school_id
  where p.id = p_student_id and p.school_id = p_school_id;

  select jsonb_build_object('name', s.name, 'code', s.code) into v_school from public.schools s where s.id = p_school_id;

  select c.name, y.name into v_class, v_year
  from public.enrollments e
  join public.classes c on c.id = e.class_id and c.school_id = e.school_id
  join public.academic_years y on y.id = e.academic_year_id and y.school_id = e.school_id
  where e.student_id = p_student_id and e.school_id = p_school_id
  order by y.starts_on desc limit 1;

  if p_type.code in ('transcript', 'replacement_transcript', 'report_card_copy') then
    select coalesce(jsonb_agg(jsonb_build_object(
             'academic_year', y.name, 'term', tm.name, 'class', c.name,
             'average', rc.average, 'rank', rc.rank, 'class_size', rc.class_size,
             'issued_at', rc.issued_at, 'data', rc.data)
           order by y.starts_on, tm.starts_on), '[]'::jsonb)
      into v_records
    from public.report_cards rc
    join public.academic_years y on y.id = rc.academic_year_id and y.school_id = rc.school_id
    join public.academic_terms tm on tm.id = rc.term_id and tm.school_id = rc.school_id
    join public.classes c on c.id = rc.class_id and c.school_id = rc.school_id
    where rc.student_id = p_student_id and rc.school_id = p_school_id;
  end if;

  return jsonb_build_object(
    'document_type', p_type.name,
    'code', p_type.code,
    'school', v_school,
    'student', v_student,
    'class', v_class,
    'academic_year', v_year,
    'records', v_records,
    'financial_standing', p_clearance
  );
end;
$$;

create or replace function public.doc_generate(p_request_id uuid, p_override_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_school  uuid := private.current_school_id();
  v_me      uuid := private.current_profile_id();
  r public.document_requests%rowtype;
  t public.document_types%rowtype;
  v_clear   jsonb;
  v_unmet   text[] := '{}';
  v_doc     uuid;
  v_number  text;
  v_year    integer := extract(year from current_date)::int;
begin
  select * into r from public.document_requests where id = p_request_id and school_id = v_school for update;
  if not found then
    raise exception 'Request not found' using errcode = '22023';
  end if;
  if not private.can_process_document_type(r.document_type_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if r.status not in ('requested', 'payment_pending', 'paid', 'under_review', 'approved') then
    raise exception 'This request is not ready to generate' using errcode = '22023';
  end if;
  select * into t from public.document_types where id = r.document_type_id;

  -- Approval can never be overridden.
  if t.requires_approval and r.review_decision is distinct from 'approved' then
    raise exception 'APPROVAL_REQUIRED: this document needs approval first' using errcode = '22023';
  end if;

  v_clear := private.clearance_for(v_school, r.student_id, r.invoice_id);
  if not private.doc_payment_ok(r, t) then
    v_unmet := array_append(v_unmet, 'payment');
  end if;
  if t.requires_clearance and not (v_clear ->> 'cleared')::boolean then
    v_unmet := array_append(v_unmet, 'clearance');
  end if;

  if array_length(v_unmet, 1) is not null then
    if not (t.allow_override and private.current_app_role() = 'school_admin') then
      raise exception '%: %', case when 'clearance' = any (v_unmet) then 'FINANCIAL_CLEARANCE_REQUIRED' else 'PAYMENT_REQUIRED' end,
        'requirements not met (' || array_to_string(v_unmet, ', ') || ')' using errcode = '22023';
    end if;
    if char_length(btrim(coalesce(p_override_reason, ''))) < 3 then
      raise exception 'OVERRIDE_REASON_REQUIRED: give the reason for overriding' using errcode = '22023';
    end if;
    update public.document_requests
       set override_by = v_me, override_reason = btrim(p_override_reason), override_waived = v_unmet
     where id = r.id;
    perform private.log_financial_event(v_school, 'DOCUMENT_OVERRIDE', 'document_requests', r.id, null,
      jsonb_build_object('waived', to_jsonb(v_unmet), 'reason', btrim(p_override_reason)));
  end if;

  v_number := 'DOC-' || v_year || '-' || lpad(private.next_finance_number(v_school, 'document', v_year)::text, 5, '0');
  insert into public.issued_documents (school_id, request_id, student_id, document_type_id, document_number, payload, issued_by)
  values (v_school, r.id, r.student_id, r.document_type_id, v_number,
          private.doc_build_payload(v_school, r.student_id, t, v_clear), v_me)
  returning id into v_doc;
  update public.document_requests set status = 'generated' where id = r.id;
  perform private.log_financial_event(v_school, 'DOCUMENT_GENERATED', 'issued_documents', v_doc, null,
    jsonb_build_object('document_number', v_number, 'request_id', r.id, 'student_id', r.student_id));
  return v_doc;
end;
$$;

create or replace function public.doc_mark(p_request_id uuid, p_status public.document_request_status)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid := private.current_school_id();
  r public.document_requests%rowtype;
begin
  if p_status not in ('printed', 'delivered') then
    raise exception 'A document can only be marked printed or delivered' using errcode = '22023';
  end if;
  select * into r from public.document_requests where id = p_request_id and school_id = v_school for update;
  if not found or not private.can_process_document_type(r.document_type_id) then
    raise exception 'Request not found' using errcode = '22023';
  end if;
  if r.status not in ('generated', 'printed') or (p_status = 'printed' and r.status = 'printed') then
    raise exception 'The document is not at a stage where it can be marked %', p_status using errcode = '22023';
  end if;
  update public.document_requests set status = p_status where id = r.id;
  perform private.log_financial_event(v_school, 'DOCUMENT_' || upper(p_status::text), 'document_requests', r.id,
    jsonb_build_object('status', r.status), jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.doc_revoke(p_document_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid := private.current_school_id();
  d public.issued_documents%rowtype;
begin
  if v_school is null or private.current_app_role() <> 'school_admin' then
    raise exception 'Only a school administrator can revoke a document' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  select * into d from public.issued_documents where id = p_document_id and school_id = v_school for update;
  if not found then
    raise exception 'Document not found' using errcode = '22023';
  end if;
  update public.issued_documents
     set revoked_at = now(), revoked_by = private.current_profile_id(), revoke_reason = btrim(p_reason)
   where id = d.id;
  perform private.log_financial_event(v_school, 'DOCUMENT_REVOKED', 'issued_documents', d.id, null,
    jsonb_build_object('document_number', d.document_number, 'reason', btrim(p_reason)));
end;
$$;

-- -----------------------------------------------------------------------------
-- Public verification (QR). Reveals as little as possible: no grades, no full name.
-- -----------------------------------------------------------------------------
create or replace function public.verify_document(p_token text)
returns table (document_number text, school_name text, document_type text, student_label text, issued_on date, is_valid boolean)
language sql stable security definer set search_path = '' as $$
  select d.document_number,
         s.name,
         t.name,
         p.first_name || ' ' || left(p.last_name, 1) || '.',
         d.issued_at::date,
         d.revoked_at is null
  from public.issued_documents d
  join public.schools s on s.id = d.school_id
  join public.document_types t on t.id = d.document_type_id
  join public.profiles p on p.id = d.student_id and p.school_id = d.school_id
  where d.verification_token = p_token and char_length(p_token) = 64
$$;

-- -----------------------------------------------------------------------------
-- Audit: tokens never appear in the log; named events come from the functions above.
-- -----------------------------------------------------------------------------
-- (All document events are written through private.log_financial_event.)

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function private.is_document_staff() from public, anon;
revoke all on function private.can_process_document_type(uuid) from public, anon;
grant execute on function private.is_document_staff() to authenticated;
grant execute on function private.can_process_document_type(uuid) to authenticated;
revoke all on function private.clearance_for(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.doc_payment_ok(public.document_requests, public.document_types) from public, anon, authenticated;
revoke all on function private.doc_advance(uuid) from public, anon, authenticated;
revoke all on function private.doc_create_invoice(uuid, uuid, uuid, public.document_types) from public, anon, authenticated;
revoke all on function private.doc_cancel_invoice(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.doc_build_payload(uuid, uuid, public.document_types, jsonb) from public, anon, authenticated;

revoke all on function public.doc_seed_types() from public, anon;
revoke all on function public.doc_save_type(uuid, text, text, text, numeric, text, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon;
revoke all on function public.doc_request(uuid, uuid, text) from public, anon;
revoke all on function public.doc_cancel_request(uuid, text) from public, anon;
revoke all on function public.doc_review_request(uuid, boolean, text) from public, anon;
revoke all on function public.doc_generate(uuid, text) from public, anon;
revoke all on function public.doc_mark(uuid, public.document_request_status) from public, anon;
revoke all on function public.doc_revoke(uuid, text) from public, anon;
grant execute on function public.doc_seed_types() to authenticated;
grant execute on function public.doc_save_type(uuid, text, text, text, numeric, text, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.doc_request(uuid, uuid, text) to authenticated;
grant execute on function public.doc_cancel_request(uuid, text) to authenticated;
grant execute on function public.doc_review_request(uuid, boolean, text) to authenticated;
grant execute on function public.doc_generate(uuid, text) to authenticated;
grant execute on function public.doc_mark(uuid, public.document_request_status) to authenticated;
grant execute on function public.doc_revoke(uuid, text) to authenticated;
revoke all on function public.verify_document(text) from public;
grant execute on function public.verify_document(text) to anon, authenticated;
