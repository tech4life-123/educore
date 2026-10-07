-- =============================================================================
-- EduCore — Finance Phase 4 (foundation): payment-provider feeds
--
-- Mobile-money providers (Orange Money, MTN MoMo) tell us "this money arrived"
-- by calling a callback URL. This migration is the database half of receiving
-- that message safely. It deliberately does NOT move money or post anything:
--
--   provider message --(signature checked by the app)--> provider_ingest()
--        --> provider_events        (raw, idempotent log of what was received)
--        --> incoming_transactions  (source = 'provider', status 'unmatched')
--
-- From there the existing reconciliation centre takes over: a finance officer
-- matches or assigns it, exactly as for a bank statement line. A provider
-- message is never trusted to settle an invoice by itself.
--
--   * payment_provider_accounts  one row per school + provider + environment
--   * payment_provider_secrets   the per-account callback signing secret;
--                                no browser role can read it
--   * provider_events            every verified message, once (idempotency key
--                                = account + the provider's transaction id)
--   * provider_ingest()          callable ONLY by the server's service role
--   * provider_account_*         school-admin management functions
--
-- 'mock' is a sandbox-only provider used to exercise the whole path without
-- any real credentials. Real providers are created in 'sandbox' first.
-- =============================================================================

create table public.payment_provider_accounts (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  provider    text not null check (provider in ('mock', 'orange_money', 'mtn_momo')),
  environment text not null default 'sandbox' check (environment in ('sandbox', 'live')),
  label       text not null check (char_length(btrim(label)) between 1 and 80),
  status      text not null default 'active' check (status in ('active', 'disabled')),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint payment_provider_accounts_id_school_key unique (id, school_id),
  constraint payment_provider_accounts_one_per_env unique (school_id, provider, environment),
  constraint payment_provider_mock_is_sandbox check (provider <> 'mock' or environment = 'sandbox')
);

create trigger payment_provider_accounts_set_updated_at before update on public.payment_provider_accounts
  for each row execute function private.set_updated_at();

alter table public.payment_provider_accounts enable row level security;
alter table public.payment_provider_accounts force row level security;
revoke all on public.payment_provider_accounts from anon, authenticated;
grant select on public.payment_provider_accounts to authenticated;

create policy "Finance staff can read their school's provider accounts"
  on public.payment_provider_accounts for select to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_finance_staff()));

-- The signing secret lives in its own table so that no select grant, view or
-- policy on the accounts table can ever expose it.
create table public.payment_provider_secrets (
  account_id     uuid primary key,
  school_id      uuid not null,
  webhook_secret text not null check (char_length(webhook_secret) >= 32),
  rotated_at     timestamptz not null default now(),
  constraint payment_provider_secrets_account_fkey foreign key (account_id, school_id)
    references public.payment_provider_accounts (id, school_id) on delete cascade
);
alter table public.payment_provider_secrets enable row level security;
alter table public.payment_provider_secrets force row level security;
revoke all on public.payment_provider_secrets from public, anon, authenticated;

-- Every verified provider message, once. outcome says what we did with it.
create table public.provider_events (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null,
  account_id      uuid not null,
  provider        text not null,
  external_id     text not null check (char_length(btrim(external_id)) between 1 and 100),
  outcome         text not null check (outcome in ('ingested', 'ignored', 'conflict')),
  detail          text,
  transaction_id  uuid,
  payload         jsonb not null,
  delivery_count  integer not null default 1 check (delivery_count >= 1),
  received_at     timestamptz not null default now(),
  last_received_at timestamptz not null default now(),
  constraint provider_events_account_fkey foreign key (account_id, school_id)
    references public.payment_provider_accounts (id, school_id) on delete restrict,
  constraint provider_events_transaction_fkey foreign key (transaction_id)
    references public.incoming_transactions (id) on delete restrict,
  -- the idempotency key: a provider that re-delivers the same message changes nothing
  constraint provider_events_once unique (account_id, external_id)
);
create index provider_events_school_idx on public.provider_events (school_id, received_at desc);

-- Append-only apart from the redelivery counter and one status upgrade.
create or replace function private.guard_provider_event()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_volatile text[] := array['delivery_count', 'last_received_at', 'outcome', 'detail', 'transaction_id', 'payload'];
begin
  if tg_op = 'DELETE' then
    raise exception 'Provider events are never deleted' using errcode = '42501';
  end if;
  -- identity of the event never changes
  if (to_jsonb(new) - v_volatile) is distinct from (to_jsonb(old) - v_volatile) then
    raise exception 'Provider events cannot be changed' using errcode = '42501';
  end if;
  -- The one allowed rewrite: a message first logged as "not successful yet"
  -- (e.g. pending) that the provider later reports as successful.
  if new.outcome is distinct from old.outcome or new.detail is distinct from old.detail
     or new.transaction_id is distinct from old.transaction_id or new.payload is distinct from old.payload then
    if not (old.outcome = 'ignored' and old.detail like 'Provider status:%' and new.outcome in ('ingested', 'conflict')) then
      raise exception 'Provider events cannot be changed' using errcode = '42501';
    end if;
  end if;
  return new;
end; $$;
create trigger provider_events_guard before update or delete on public.provider_events
  for each row execute function private.guard_provider_event();

alter table public.provider_events enable row level security;
alter table public.provider_events force row level security;
revoke all on public.provider_events from public, anon, authenticated;
grant select on public.provider_events to authenticated;

create policy "Finance staff can read their school's provider events"
  on public.provider_events for select to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_finance_staff()));

-- The server's service role needs to read the secret and call the ingest
-- function; nothing else. (Supabase always has this role; the guard keeps the
-- migration runnable on a plain Postgres.)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on public.payment_provider_accounts, public.payment_provider_secrets to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------- ingest

-- Called by the callback route AFTER it has verified the provider's signature.
-- Returns {"outcome": ..., "transaction_id": ..., "duplicate": bool}.
create or replace function public.provider_ingest(
  p_account      uuid,
  p_external_id  text,
  p_status       text,
  p_amount       numeric,
  p_currency     text,
  p_date         date,
  p_payer_name   text,
  p_payer_phone  text,
  p_payload      jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acc    public.payment_provider_accounts%rowtype;
  v_ext    text := btrim(coalesce(p_external_id, ''));
  v_event  public.provider_events%rowtype;
  v_method public.payment_method;
  v_tx     uuid;
  v_detail text;
  v_date   date := least(coalesce(p_date, current_date), current_date);
begin
  -- Serialise deliveries per account so two simultaneous copies of one message
  -- cannot both get past the duplicate check.
  select * into v_acc from public.payment_provider_accounts where id = p_account for update;
  if not found then
    raise exception 'Unknown provider account' using errcode = '22023';
  end if;
  if v_acc.status <> 'active' then
    raise exception 'This provider account is disabled' using errcode = '22023';
  end if;
  if char_length(v_ext) not between 1 and 100 then
    raise exception 'The provider transaction id is missing or too long' using errcode = '22023';
  end if;

  select * into v_event from public.provider_events where account_id = p_account and external_id = v_ext;
  if found then
    update public.provider_events
       set delivery_count = delivery_count + 1, last_received_at = now()
     where id = v_event.id;
    -- A repeat of something we already acted on changes nothing. The only
    -- exception is a message we parked as "not successful yet" that now is.
    if not (v_event.outcome = 'ignored' and v_event.detail like 'Provider status:%'
            and lower(coalesce(p_status, '')) = 'successful') then
      return jsonb_build_object('outcome', v_event.outcome, 'transaction_id', v_event.transaction_id, 'duplicate', true);
    end if;
  end if;

  v_method := case v_acc.provider
    when 'orange_money' then 'orange_money'::public.payment_method
    when 'mtn_momo' then 'mtn_momo'::public.payment_method
    else 'other'::public.payment_method end;

  -- Only a completed, well-formed payment becomes a transaction. Anything else
  -- is still logged, so finance can see the provider sent it.
  if lower(coalesce(p_status, '')) <> 'successful' then
    v_detail := 'Provider status: ' || coalesce(nullif(btrim(p_status), ''), 'missing');
  elsif p_amount is null or p_amount <= 0 or p_amount > 10000000 or p_amount <> round(p_amount, 2) then
    v_detail := 'Invalid amount';
  elsif p_currency is null or p_currency not in ('USD', 'LRD') then
    v_detail := 'Unsupported currency: ' || coalesce(left(p_currency, 10), 'missing');
  end if;

  if v_detail is not null then
    if v_event.id is null then
      insert into public.provider_events (school_id, account_id, provider, external_id, outcome, detail, payload)
      values (v_acc.school_id, v_acc.id, v_acc.provider, v_ext, 'ignored', v_detail, coalesce(p_payload, '{}'::jsonb));
    end if;
    return jsonb_build_object('outcome', 'ignored', 'transaction_id', null, 'duplicate', false, 'detail', v_detail);
  end if;

  begin
    insert into public.incoming_transactions
      (school_id, method, amount, currency, reference, transaction_date, payer_name, payer_phone, notes, source)
    values
      (v_acc.school_id, v_method, p_amount, p_currency, v_ext, v_date,
       nullif(left(btrim(coalesce(p_payer_name, '')), 120), ''),
       nullif(left(btrim(coalesce(p_payer_phone, '')), 30), ''),
       'Received from ' || v_acc.label || ' (' || v_acc.environment || ')', 'provider')
    returning id into v_tx;
  exception when unique_violation then
    -- Someone already logged this exact reference (e.g. from a statement).
    select id into v_tx from public.incoming_transactions
     where school_id = v_acc.school_id and method = v_method and reference = v_ext and status <> 'rejected';
    if v_event.id is null then
      insert into public.provider_events (school_id, account_id, provider, external_id, outcome, detail, transaction_id, payload)
      values (v_acc.school_id, v_acc.id, v_acc.provider, v_ext, 'conflict',
              'A transaction with this reference was already logged', v_tx, coalesce(p_payload, '{}'::jsonb));
    else
      update public.provider_events set outcome = 'conflict', detail = 'A transaction with this reference was already logged',
             transaction_id = v_tx, payload = coalesce(p_payload, '{}'::jsonb) where id = v_event.id;
    end if;
    return jsonb_build_object('outcome', 'conflict', 'transaction_id', v_tx, 'duplicate', false);
  end;

  if v_event.id is null then
    insert into public.provider_events (school_id, account_id, provider, external_id, outcome, transaction_id, payload)
    values (v_acc.school_id, v_acc.id, v_acc.provider, v_ext, 'ingested', v_tx, coalesce(p_payload, '{}'::jsonb));
  else
    update public.provider_events set outcome = 'ingested', detail = null, transaction_id = v_tx,
           payload = coalesce(p_payload, '{}'::jsonb) where id = v_event.id;
  end if;
  return jsonb_build_object('outcome', 'ingested', 'transaction_id', v_tx, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------- management

create or replace function private.new_provider_secret()
returns text language sql volatile set search_path = '' as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
$$;
revoke all on function private.new_provider_secret() from public, anon, authenticated;

create or replace function private.assert_school_admin()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_school uuid := private.current_school_id();
begin
  if v_school is null or private.current_app_role() <> 'school_admin' then
    raise exception 'Only a school administrator can do this' using errcode = '42501';
  end if;
  return v_school;
end; $$;
revoke all on function private.assert_school_admin() from public, anon;
grant execute on function private.assert_school_admin() to authenticated;

-- Creates the account and its signing secret. The secret is returned ONCE.
create or replace function public.provider_account_create(p_provider text, p_environment text, p_label text)
returns table (account_id uuid, webhook_secret text)
language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid := private.assert_school_admin();
  v_id     uuid;
  v_secret text := private.new_provider_secret();
begin
  if p_provider not in ('mock', 'orange_money', 'mtn_momo') then
    raise exception 'Unknown provider' using errcode = '22023';
  end if;
  if coalesce(p_environment, '') not in ('sandbox', 'live') then
    raise exception 'Choose sandbox or live' using errcode = '22023';
  end if;
  if p_provider = 'mock' and p_environment <> 'sandbox' then
    raise exception 'The mock provider is sandbox-only' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_label, ''))) not between 1 and 80 then
    raise exception 'Give the account a name of up to 80 characters' using errcode = '22023';
  end if;
  if exists (select 1 from public.payment_provider_accounts
              where school_id = v_school and provider = p_provider and environment = p_environment) then
    raise exception 'You already have a % % account', p_provider, p_environment using errcode = '22023';
  end if;

  insert into public.payment_provider_accounts (school_id, provider, environment, label, created_by)
  values (v_school, p_provider, p_environment, btrim(p_label), private.current_profile_id())
  returning id into v_id;
  insert into public.payment_provider_secrets (account_id, school_id, webhook_secret)
  values (v_id, v_school, v_secret);

  perform private.log_financial_event(v_school, 'PROVIDER_ACCOUNT_CREATED', 'payment_provider_accounts', v_id, null,
    jsonb_build_object('provider', p_provider, 'environment', p_environment, 'label', btrim(p_label)));
  return query select v_id, v_secret;
end; $$;

create or replace function public.provider_account_set_status(p_account uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid := private.assert_school_admin();
  v_old text;
begin
  if p_status not in ('active', 'disabled') then
    raise exception 'Choose active or disabled' using errcode = '22023';
  end if;
  select status into v_old from public.payment_provider_accounts where id = p_account and school_id = v_school for update;
  if not found then raise exception 'Provider account not found' using errcode = '22023'; end if;
  if v_old = p_status then return; end if;
  update public.payment_provider_accounts set status = p_status where id = p_account;
  perform private.log_financial_event(v_school, 'PROVIDER_ACCOUNT_STATUS_CHANGED', 'payment_provider_accounts', p_account,
    jsonb_build_object('status', v_old), jsonb_build_object('status', p_status));
end; $$;

-- Issues a fresh signing secret (the old one stops working immediately).
create or replace function public.provider_account_rotate_secret(p_account uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid := private.assert_school_admin();
  v_secret text := private.new_provider_secret();
begin
  perform 1 from public.payment_provider_accounts where id = p_account and school_id = v_school for update;
  if not found then raise exception 'Provider account not found' using errcode = '22023'; end if;
  update public.payment_provider_secrets set webhook_secret = v_secret, rotated_at = now() where account_id = p_account;
  perform private.log_financial_event(v_school, 'PROVIDER_SECRET_ROTATED', 'payment_provider_accounts', p_account, null, null);
  return v_secret;
end; $$;

-- ---------------------------------------------------------------- grants

revoke all on function public.provider_ingest(uuid, text, text, numeric, text, date, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.provider_account_create(text, text, text) from public, anon;
revoke all on function public.provider_account_set_status(uuid, text) from public, anon;
revoke all on function public.provider_account_rotate_secret(uuid) from public, anon;
grant execute on function public.provider_account_create(text, text, text) to authenticated;
grant execute on function public.provider_account_set_status(uuid, text) to authenticated;
grant execute on function public.provider_account_rotate_secret(uuid) to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.provider_ingest(uuid, text, text, numeric, text, date, text, text, jsonb) to service_role;
  end if;
end $$;
