-- =============================================================================
-- EduCore — Finance Phase 6b: installments / payment plans
--
-- A plan splits what an ISSUED invoice still owes into 2–12 dated instalments.
-- It is an agreement, not money: nothing is posted to the ledger when a plan is
-- made, cancelled or missed. Payments are still recorded against the invoice as
-- always; the view `plan_installment_status` then allocates what has been
-- settled (net payments + discounts/waivers since the plan began) to the
-- instalments in date order. So refunds, reversals and waivers are reflected
-- automatically and there is nothing to keep in sync.
--
-- Finance staff (finance officer or school admin) may create and cancel plans;
-- the family can see their own. A plan is replaced by cancelling and re-creating.
-- =============================================================================

create table public.payment_plans (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  invoice_id       uuid not null,
  student_id       uuid not null,
  currency         text not null check (currency in ('USD', 'LRD')),
  -- What was already settled (paid + discounts) when the plan was made.
  base_settled     numeric(12, 2) not null check (base_settled >= 0),
  note             text check (note is null or char_length(btrim(note)) <= 300),
  status           text not null default 'active' check (status in ('active', 'cancelled')),
  cancelled_reason text check (cancelled_reason is null or char_length(btrim(cancelled_reason)) between 3 and 300),
  cancelled_by     uuid,
  cancelled_at     timestamptz,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  constraint payment_plans_id_school_key unique (id, school_id),
  constraint payment_plans_invoice_fkey foreign key (invoice_id, school_id)
    references public.invoices (id, school_id) on delete restrict,
  constraint payment_plans_student_fkey foreign key (student_id, school_id)
    references public.profiles (id, school_id) on delete restrict,
  constraint payment_plans_cancel_check check (status <> 'cancelled' or (cancelled_reason is not null and cancelled_at is not null))
);
create unique index payment_plans_one_active_idx on public.payment_plans (invoice_id) where status = 'active';
create index payment_plans_school_idx on public.payment_plans (school_id, created_at desc);

create table public.plan_installments (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools(id) on delete cascade,
  plan_id    uuid not null,
  seq        integer not null check (seq between 1 and 12),
  due_date   date not null,
  amount     numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  created_at timestamptz not null default now(),
  constraint plan_installments_plan_seq_key unique (plan_id, seq),
  constraint plan_installments_plan_fkey foreign key (plan_id, school_id)
    references public.payment_plans (id, school_id) on delete restrict
);

-- Plans only ever go active → cancelled, once; instalments never change.
create or replace function private.guard_payment_plan()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Payment plans are never deleted; cancel them instead' using errcode = '42501';
  end if;
  if old.status <> 'active' then
    raise exception 'A cancelled plan cannot be changed' using errcode = '42501';
  end if;
  if (to_jsonb(new) - array['status', 'cancelled_reason', 'cancelled_by', 'cancelled_at'])
     is distinct from (to_jsonb(old) - array['status', 'cancelled_reason', 'cancelled_by', 'cancelled_at']) then
    raise exception 'A plan''s details cannot be changed; cancel it and make a new one' using errcode = '42501';
  end if;
  return new;
end; $$;
create trigger payment_plans_guard before update or delete on public.payment_plans
  for each row execute function private.guard_payment_plan();

create or replace function private.guard_plan_installment()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Instalments cannot be changed; cancel the plan and make a new one' using errcode = '42501';
end; $$;
create trigger plan_installments_guard before update or delete on public.plan_installments
  for each row execute function private.guard_plan_installment();

alter table public.payment_plans enable row level security;
alter table public.payment_plans force row level security;
alter table public.plan_installments enable row level security;
alter table public.plan_installments force row level security;
revoke all on public.payment_plans, public.plan_installments from public, anon, authenticated;
grant select on public.payment_plans, public.plan_installments to authenticated;

create policy "Finance staff and the family can read plans"
  on public.payment_plans for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and ((select private.is_finance_staff()) or (select private.is_self_or_child(student_id)))
  );
create policy "Finance staff and the family can read instalments"
  on public.plan_installments for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and exists (
      select 1 from public.payment_plans p
      where p.id = plan_installments.plan_id and p.school_id = plan_installments.school_id
        and ((select private.is_finance_staff()) or (select private.is_self_or_child(p.student_id)))
    )
  );

-- --------------------------------------------------------------- status view
-- Settled money goes to the earliest instalments first.

create or replace view public.plan_installment_status with (security_invoker = true) as
select
  s.installment_id,
  s.school_id,
  s.plan_id,
  s.invoice_id,
  s.student_id,
  s.currency,
  s.seq,
  s.due_date,
  s.amount,
  s.paid,
  s.amount - s.paid as remaining,
  case
    when s.plan_status <> 'active' or s.invoice_status <> 'issued' then 'inactive'
    when s.paid >= s.amount then 'paid'
    when s.due_date < current_date then 'overdue'
    when s.paid > 0 then 'partial'
    else 'upcoming'
  end as status,
  s.plan_status
from (
  select
    pi.id as installment_id,
    pi.school_id,
    pi.plan_id,
    pp.invoice_id,
    pp.student_id,
    pp.currency,
    pi.seq,
    pi.due_date,
    pi.amount,
    pp.status as plan_status,
    i.status as invoice_status,
    (least(
      pi.amount,
      greatest(
        0,
        greatest(0, coalesce(ib.amount_paid, 0) + coalesce(ib.adjustments_total, 0) - pp.base_settled)
          - (sum(pi.amount) over (partition by pi.plan_id order by pi.seq) - pi.amount)
      )
    ))::numeric(12, 2) as paid
  from public.plan_installments pi
  join public.payment_plans pp on pp.id = pi.plan_id and pp.school_id = pi.school_id
  join public.invoices i on i.id = pp.invoice_id and i.school_id = pp.school_id
  left join public.invoice_balances ib on ib.invoice_id = pp.invoice_id
) s;
grant select on public.plan_installment_status to authenticated;

-- --------------------------------------------------------------- functions

create or replace function public.finance_create_payment_plan(p_invoice_id uuid, p_installments jsonb, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_school  uuid := private.assert_finance_staff();
  v_inv     public.invoices%rowtype;
  v_bal     record;
  v_plan    uuid;
  v_n       integer;
  v_item    jsonb;
  v_i       integer := 0;
  v_due     date;
  v_prev    date;
  v_amount  numeric;
  v_sum     numeric := 0;
begin
  if p_installments is null or jsonb_typeof(p_installments) <> 'array' then
    raise exception 'Instalments must be a list' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_installments);
  if v_n < 2 or v_n > 12 then
    raise exception 'A plan needs between 2 and 12 instalments' using errcode = '22023';
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id and school_id = v_school for update;
  if not found then raise exception 'Invoice not found' using errcode = '22023'; end if;
  if v_inv.status <> 'issued' then
    raise exception 'Only an issued invoice can have a payment plan (status: %)', v_inv.status using errcode = '22023';
  end if;
  if exists (select 1 from public.payment_plans where invoice_id = p_invoice_id and status = 'active') then
    raise exception 'This invoice already has a payment plan. Cancel it first.' using errcode = '22023';
  end if;

  select total_amount, balance_due into v_bal from public.invoice_balances where invoice_id = p_invoice_id;
  if v_bal.balance_due <= 0 then
    raise exception 'This invoice has nothing left to pay' using errcode = '22023';
  end if;

  -- validate every instalment before writing anything
  for v_item in select * from jsonb_array_elements(p_installments) loop
    begin
      v_due := (v_item->>'due_date')::date;
      v_amount := (v_item->>'amount')::numeric;
    exception when others then
      raise exception 'Each instalment needs a valid due date and amount' using errcode = '22023';
    end;
    if v_due is null or v_amount is null or v_amount <= 0 or v_amount <> round(v_amount, 2) then
      raise exception 'Each instalment needs a due date and an amount above zero with at most 2 decimals' using errcode = '22023';
    end if;
    if v_due < current_date then
      raise exception 'An instalment cannot be due in the past' using errcode = '22023';
    end if;
    if v_prev is not null and v_due <= v_prev then
      raise exception 'Instalment dates must be in order, one after another' using errcode = '22023';
    end if;
    v_prev := v_due;
    v_sum := v_sum + v_amount;
  end loop;
  if v_sum <> v_bal.balance_due then
    raise exception 'The instalments add up to % but the invoice owes %', v_sum, v_bal.balance_due using errcode = '22023';
  end if;

  insert into public.payment_plans (school_id, invoice_id, student_id, currency, base_settled, note, created_by)
  values (v_school, p_invoice_id, v_inv.student_id, v_inv.currency, v_bal.total_amount - v_bal.balance_due,
          nullif(btrim(p_note), ''), private.current_profile_id())
  returning id into v_plan;

  for v_item in select * from jsonb_array_elements(p_installments) loop
    v_i := v_i + 1;
    insert into public.plan_installments (school_id, plan_id, seq, due_date, amount)
    values (v_school, v_plan, v_i, (v_item->>'due_date')::date, (v_item->>'amount')::numeric);
  end loop;

  perform private.log_financial_event(v_school, 'PLAN_CREATED', 'payment_plans', v_plan, null,
    jsonb_build_object('invoice_id', p_invoice_id, 'instalments', v_n, 'total', v_sum, 'currency', v_inv.currency));
  return v_plan;
end; $$;

create or replace function public.finance_cancel_payment_plan(p_plan_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid := private.assert_finance_staff();
  v_plan   public.payment_plans%rowtype;
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  select * into v_plan from public.payment_plans where id = p_plan_id and school_id = v_school for update;
  if not found then raise exception 'Plan not found' using errcode = '22023'; end if;
  if v_plan.status <> 'active' then raise exception 'This plan is already cancelled' using errcode = '22023'; end if;
  update public.payment_plans
     set status = 'cancelled', cancelled_reason = btrim(p_reason),
         cancelled_by = private.current_profile_id(), cancelled_at = now()
   where id = p_plan_id;
  perform private.log_financial_event(v_school, 'PLAN_CANCELLED', 'payment_plans', p_plan_id,
    jsonb_build_object('status', 'active'), jsonb_build_object('status', 'cancelled', 'reason', btrim(p_reason)));
end; $$;

revoke all on function public.finance_create_payment_plan(uuid, jsonb, text) from public, anon;
revoke all on function public.finance_cancel_payment_plan(uuid, text) from public, anon;
grant execute on function public.finance_create_payment_plan(uuid, jsonb, text) to authenticated;
grant execute on function public.finance_cancel_payment_plan(uuid, text) to authenticated;
