-- =============================================================================
-- EduCore — Finance Phase 6d: receivables (the basis for the outlook / forecast)
--
-- Everything that is still to be collected, with the date it falls due:
--   * one row per unpaid instalment of an active payment plan, and
--   * one row per issued invoice with a balance and no active plan.
-- It is the same logic as fee_reminders without the 7-day window, so the
-- outlook, the reminders and the invoice pages can never disagree.
-- security_invoker: staff see their school; a family would only see its own.
-- =============================================================================

create or replace view public.finance_receivables with (security_invoker = true) as
select
  s.school_id, s.student_id, s.invoice_id, s.installment_id, s.seq,
  ib.invoice_number, s.currency, s.due_date, s.remaining as amount_due
from public.plan_installment_status s
join public.invoice_balances ib on ib.invoice_id = s.invoice_id
where s.status in ('overdue', 'partial', 'upcoming')
  and s.remaining > 0

union all

select
  ib.school_id, ib.student_id, ib.invoice_id, null::uuid, null::integer,
  ib.invoice_number, ib.currency, ib.due_date, ib.balance_due
from public.invoice_balances ib
where ib.status = 'issued'
  and ib.balance_due > 0
  and not exists (
    select 1 from public.payment_plans p where p.invoice_id = ib.invoice_id and p.status = 'active'
  );

revoke all on public.finance_receivables from public, anon;
grant select on public.finance_receivables to authenticated;
