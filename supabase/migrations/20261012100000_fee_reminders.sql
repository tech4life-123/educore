-- =============================================================================
-- EduCore — Finance Phase 6c: in-app fee reminders
--
-- Reminders are COMPUTED, not stored and not "sent": this view lists what is
-- overdue or due within the next 7 days, so a reminder appears by itself when
-- the time comes and disappears the moment it is paid, waived, refunded back
-- into view, or the invoice is cancelled. No scheduler, no copies to keep in
-- sync, nothing that can send the wrong thing twice.
--
--   * With an active payment plan: one row per unpaid instalment that is
--     overdue or due within 7 days (amount = what is still unpaid on it).
--   * Without a plan: one row per issued invoice that is overdue or due within
--     7 days (amount = balance due).
--
-- security_invoker: a student/parent sees only their own family's rows (via the
-- invoice / plan row-level security); finance staff see the whole school.
-- Dates use the database day (UTC), which is the same day as Liberia.
-- =============================================================================

create or replace view public.fee_reminders with (security_invoker = true) as
select
  r.school_id,
  r.student_id,
  r.invoice_id,
  r.installment_id,
  r.seq,
  r.invoice_number,
  r.currency,
  r.due_date,
  r.amount_due,
  case when r.due_date < current_date then 'overdue' else 'due_soon' end as kind,
  (current_date - r.due_date) as days_overdue
from (
  select
    s.school_id, s.student_id, s.invoice_id, s.installment_id, s.seq,
    ib.invoice_number, s.currency, s.due_date, s.remaining as amount_due
  from public.plan_installment_status s
  join public.invoice_balances ib on ib.invoice_id = s.invoice_id
  where s.status in ('overdue', 'partial', 'upcoming')
    and s.remaining > 0
    and s.due_date <= current_date + 7

  union all

  select
    ib.school_id, ib.student_id, ib.invoice_id, null::uuid, null::integer,
    ib.invoice_number, ib.currency, ib.due_date, ib.balance_due
  from public.invoice_balances ib
  where ib.status = 'issued'
    and ib.balance_due > 0
    and ib.due_date <= current_date + 7
    and not exists (
      select 1 from public.payment_plans p where p.invoice_id = ib.invoice_id and p.status = 'active'
    )
) r;
grant select on public.fee_reminders to authenticated;
