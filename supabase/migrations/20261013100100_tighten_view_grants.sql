-- Views created in Phase 6b-6d inherited Supabase's default grants (insert/update/delete/truncate
-- for signed-in users). They cannot be written through, but read-only is the intent, so say so.
revoke all on public.plan_installment_status, public.fee_reminders, public.finance_receivables from public, anon, authenticated;
grant select on public.plan_installment_status, public.fee_reminders, public.finance_receivables to authenticated;
