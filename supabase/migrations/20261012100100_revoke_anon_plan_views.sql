-- Supabase's default privileges give `anon` SELECT on new public views. These two
-- are security_invoker views over tables anon cannot read, so nothing was exposed,
-- but browser-facing objects should say so explicitly: signed-in users only.
revoke all on public.plan_installment_status, public.fee_reminders from public, anon;
grant select on public.plan_installment_status, public.fee_reminders to authenticated;
