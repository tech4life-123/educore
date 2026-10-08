-- =============================================================================
-- EduCore — Payment plan tests (migration: payment_plans)
--
-- Same approach as the other suites: throwaway fixtures, every case runs as the
-- real `authenticated`/`anon` role with a forged JWT sub, everything is rolled
-- back. Run as the postgres role:
--   psql "$DATABASE_URL" -f supabase/tests/plans.sql
-- Cases run IN ORDER and build on each other.
-- =============================================================================

create or replace function pg_temp.educore_plan_tests()
returns table (test_id text, description text, expected text, actual text, result text)
language plpgsql
as $fn$
declare
  v_results jsonb := '[]'::jsonb;
  v_session text := session_user;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  adm_a uuid := gen_random_uuid(); fo_a uuid := gen_random_uuid(); tch_a uuid := gen_random_uuid();
  stu_a uuid := gen_random_uuid(); par_a uuid := gen_random_uuid(); par_x uuid := gen_random_uuid();
  adm_b uuid := gen_random_uuid();
  year_a uuid := gen_random_uuid(); year_b uuid := gen_random_uuid();
  i1 uuid; i2 uuid; i3 uuid; i_draft uuid; i_cancel uuid; i_paid uuid;
  plan1 uuid; plan2 uuid; plan3 uuid; first_inst uuid;
  v_actor uuid; v_n bigint; v_text text; v_actual text; t record;
begin
  begin
    insert into public.schools (id, name, code, slug, status) values
      (a, 'ADJ Test A', 'ADJTEST-A', 'adj-test-a', 'active'), (b, 'ADJ Test B', 'ADJTEST-B', 'adj-test-b', 'active');
    insert into auth.users (id, instance_id, aud, role, email)
    select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.id || '@plan.test'
    from unnest(array[adm_a, fo_a, tch_a, stu_a, par_a, par_x, adm_b]) as x(id);
    insert into public.profiles (id, user_id, school_id, first_name, last_name, role, status) values
      (adm_a, adm_a, a, 'T', 'AdmA', 'school_admin', 'active'),
      (fo_a,  fo_a,  a, 'T', 'FinA', 'finance_officer', 'active'),
      (tch_a, tch_a, a, 'T', 'TchA', 'teacher', 'active'),
      (stu_a, stu_a, a, 'T', 'StuA', 'student', 'active'),
      (par_a, par_a, a, 'T', 'ParA', 'parent', 'active'),
      (par_x, par_x, a, 'T', 'ParX', 'parent', 'active'),
      (adm_b, adm_b, b, 'T', 'AdmB', 'school_admin', 'active');
    insert into public.guardian_links (school_id, parent_id, student_id) values (a, par_a, stu_a);
    insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current) values
      (year_a, a, 'AY A', date '2026-01-01', date '2026-12-31', true), (year_b, b, 'AY B', date '2026-01-01', date '2026-12-31', true);

    perform set_config('request.jwt.claims', json_build_object('sub', fo_a, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    i1 := public.finance_create_invoice(stu_a, par_a, year_a, null, 'USD', current_date + 30, 'Tuition', '[{"fee_type":"tuition","amount":100}]'::jsonb);
    perform public.finance_issue_invoice(i1);
    i2 := public.finance_create_invoice(stu_a, par_a, year_a, null, 'USD', current_date + 30, 'Books', '[{"fee_type":"other","amount":100}]'::jsonb);
    perform public.finance_issue_invoice(i2);
    i3 := public.finance_create_invoice(stu_a, par_a, year_a, null, 'USD', current_date + 30, 'Lab', '[{"fee_type":"laboratory","amount":60}]'::jsonb);
    perform public.finance_issue_invoice(i3);
    i_draft := public.finance_create_invoice(stu_a, par_a, year_a, null, 'USD', current_date + 30, 'Draft', '[{"fee_type":"other","amount":40}]'::jsonb);
    i_cancel := public.finance_create_invoice(stu_a, par_a, year_a, null, 'USD', current_date + 30, 'Cancelled', '[{"fee_type":"other","amount":40}]'::jsonb);
    perform public.finance_issue_invoice(i_cancel);
    perform public.finance_cancel_invoice(i_cancel, 'setup');
    i_paid := public.finance_create_invoice(stu_a, par_a, year_a, null, 'USD', current_date + 30, 'Paid', '[{"fee_type":"other","amount":20}]'::jsonb);
    perform public.finance_issue_invoice(i_paid);
    perform public.finance_confirm_payment(public.finance_record_payment(stu_a, i_paid, 20, 'USD', 'bank'::public.payment_method, 'PL-PAID-1', null, current_date, 'Payer', null, 'idem-pl-paid1'));
    perform set_config('role', v_session, true);
    perform set_config('request.jwt.claims', '', true);

    for t in select * from (values
      ('P01','Finance officer makes a 3-instalment plan (40/30/30) for a $100 invoice','fo_a','exec', format($q$select public.finance_create_payment_plan(%L, '[{"due_date":"%s","amount":40},{"due_date":"%s","amount":30},{"due_date":"%s","amount":30}]'::jsonb, 'Term plan')$q$, i1, (current_date + 10)::text, (current_date + 20)::text, (current_date + 30)::text), 'affected=1'),
      ('P02','Instalments are stored in order','postgres','val', format($q$select string_agg(seq || ':' || amount, ',' order by seq) from public.plan_installments pi join public.payment_plans pp on pp.id = pi.plan_id where pp.invoice_id = %L$q$, i1), 'val=1:40.00,2:30.00,3:30.00'),
      ('P03','Making a plan posts nothing to the ledger','postgres','val', format($q$select count(*)::text from public.student_account_entries where invoice_id = %L$q$, i1), 'val=1'),
      ('P04','The invoice balance is unchanged by the plan','postgres','val', format('select balance_due::text from public.invoice_balances where invoice_id = %L', i1), 'val=100.00'),
      ('P05','Nothing paid yet: all three are upcoming','postgres','val', format($q$select string_agg(status, ',' order by seq) from public.plan_installment_status where invoice_id = %L$q$, i1), 'val=upcoming,upcoming,upcoming'),
      ('P06','School admin can make a plan too','adm_a','exec', format($q$select public.finance_create_payment_plan(%L, '[{"due_date":"%s","amount":50},{"due_date":"%s","amount":50}]'::jsonb, 'Term plan')$q$, i2, (current_date + 5)::text, (current_date + 15)::text), 'affected=1'),
      ('P07','Teacher cannot','tch_a','exec', format($q$select public.finance_create_payment_plan(%L, '[{"due_date":"%s","amount":30},{"due_date":"%s","amount":30}]'::jsonb, 'Term plan')$q$, i3, (current_date + 5)::text, (current_date + 15)::text), 'denied'),
      ('P08','Student cannot','stu_a','exec', format($q$select public.finance_create_payment_plan(%L, '[{"due_date":"%s","amount":30},{"due_date":"%s","amount":30}]'::jsonb, 'Term plan')$q$, i3, (current_date + 5)::text, (current_date + 15)::text), 'denied'),
      ('P09','Parent cannot','par_a','exec', format($q$select public.finance_create_payment_plan(%L, '[{"due_date":"%s","amount":30},{"due_date":"%s","amount":30}]'::jsonb, 'Term plan')$q$, i3, (current_date + 5)::text, (current_date + 15)::text), 'denied'),
      ('P10','Anonymous cannot','anon','exec', format($q$select public.finance_create_payment_plan(%L, '[{"due_date":"%s","amount":30},{"due_date":"%s","amount":30}]'::jsonb, 'Term plan')$q$, i3, (current_date + 5)::text, (current_date + 15)::text), 'denied'),
      ('P11','Another schools admin cannot (invoice not found)','adm_b','exec', format($q$select public.finance_create_payment_plan(%L, '[{"due_date":"%s","amount":30},{"due_date":"%s","amount":30}]'::jsonb, 'Term plan')$q$, i3, (current_date + 5)::text, (current_date + 15)::text), 'denied'),
      ('P12','Instalments must add up to what is owed (too little)','fo_a','exec', format($q$select public.finance_create_payment_plan(%L, '[{"due_date":"%s","amount":30},{"due_date":"%s","amount":20}]'::jsonb, 'Term plan')$q$, i3, (current_date + 5)::text, (current_date + 15)::text), 'denied'),
      ('P13','…or too much','fo_a','exec', format($q$select public.finance_create_payment_plan(%L, '[{"due_date":"%s","amount":30},{"due_date":"%s","amount":40}]'::jsonb, 'Term plan')$q$, i3, (current_date + 5)::text, (current_date + 15)::text), 'denied'),
      ('P14','One instalment is not a plan','fo_a','exec', format($q$select public.finance_create_payment_plan(%L, '[{"due_date":"%s","amount":60}]'::jsonb, null)$q$, i3, (current_date + 5)::text), 'denied'),
      ('P15','More than 12 is refused','fo_a','exec', format($q$select public.finance_create_payment_plan(%L, (select jsonb_agg(jsonb_build_object('due_date', (current_date + g)::text, 'amount', 5)) from generate_series(1, 13) g), null)$q$, i3), 'denied'),
      ('P16','A due date in the past is refused','fo_a','exec', format($q$select public.finance_create_payment_plan(%L, '[{"due_date":"%s","amount":30},{"due_date":"%s","amount":30}]'::jsonb, null)$q$, i3, (current_date - 1)::text, (current_date + 5)::text), 'denied'),
      ('P17','Dates out of order are refused','fo_a','exec', format($q$select public.finance_create_payment_plan(%L, '[{"due_date":"%s","amount":30},{"due_date":"%s","amount":30}]'::jsonb, 'Term plan')$q$, i3, (current_date + 15)::text, (current_date + 5)::text), 'denied'),
      ('P18','The same date twice is refused','fo_a','exec', format($q$select public.finance_create_payment_plan(%L, '[{"due_date":"%s","amount":30},{"due_date":"%s","amount":30}]'::jsonb, 'Term plan')$q$, i3, (current_date + 5)::text, (current_date + 5)::text), 'denied'),
      ('P19','Three decimals are refused','fo_a','exec', format($q$select public.finance_create_payment_plan(%L, '[{"due_date":"%s","amount":30.005},{"due_date":"%s","amount":29.995}]'::jsonb, null)$q$, i3, (current_date + 5)::text, (current_date + 15)::text), 'denied'),
      ('P20','A zero instalment is refused','fo_a','exec', format($q$select public.finance_create_payment_plan(%L, '[{"due_date":"%s","amount":0},{"due_date":"%s","amount":60}]'::jsonb, 'Term plan')$q$, i3, (current_date + 5)::text, (current_date + 15)::text), 'denied'),
      ('P21','A negative instalment is refused','fo_a','exec', format($q$select public.finance_create_payment_plan(%L, '[{"due_date":"%s","amount":-10},{"due_date":"%s","amount":70}]'::jsonb, 'Term plan')$q$, i3, (current_date + 5)::text, (current_date + 15)::text), 'denied'),
      ('P22','A draft invoice cannot have a plan','fo_a','exec', format($q$select public.finance_create_payment_plan(%L, '[{"due_date":"%s","amount":20},{"due_date":"%s","amount":20}]'::jsonb, 'Term plan')$q$, i_draft, (current_date + 5)::text, (current_date + 15)::text), 'denied'),
      ('P23','A cancelled invoice cannot','fo_a','exec', format($q$select public.finance_create_payment_plan(%L, '[{"due_date":"%s","amount":20},{"due_date":"%s","amount":20}]'::jsonb, 'Term plan')$q$, i_cancel, (current_date + 5)::text, (current_date + 15)::text), 'denied'),
      ('P24','A fully paid invoice cannot','fo_a','exec', format($q$select public.finance_create_payment_plan(%L, '[{"due_date":"%s","amount":10},{"due_date":"%s","amount":10}]'::jsonb, 'Term plan')$q$, i_paid, (current_date + 5)::text, (current_date + 15)::text), 'denied'),
      ('P25','An unknown invoice is refused','fo_a','exec', format($q$select public.finance_create_payment_plan(%L, '[{"due_date":"%s","amount":30},{"due_date":"%s","amount":30}]'::jsonb, null)$q$, gen_random_uuid(), (current_date + 5)::text, (current_date + 15)::text), 'denied'),
      ('P26','A second active plan on the same invoice is refused','fo_a','exec', format($q$select public.finance_create_payment_plan(%L, '[{"due_date":"%s","amount":50},{"due_date":"%s","amount":50}]'::jsonb, 'Term plan')$q$, i1, (current_date + 10)::text, (current_date + 20)::text), 'denied'),
      ('P27','Instalments must be a list','fo_a','exec', format($q$select public.finance_create_payment_plan(%L, '{"a":1}'::jsonb, null)$q$, i3), 'denied'),
      ('P28','A missing amount is refused','fo_a','exec', format($q$select public.finance_create_payment_plan(%L, '[{"due_date":"%s"},{"due_date":"%s","amount":60}]'::jsonb, null)$q$, i3, (current_date + 5)::text, (current_date + 15)::text), 'denied'),
      ('P30','A $50 payment on the invoice','fo_a','exec', format($q$select public.finance_confirm_payment(public.finance_record_payment(%L, %L, 50, 'USD', 'bank'::public.payment_method, 'PL-P1', null, current_date, 'Payer', null, 'idem-pl-0001'))$q$, stu_a, i1), 'affected=1'),
      ('P31','Allocation: 1st paid, 2nd partly paid, 3rd upcoming','postgres','val', format($q$select string_agg(status || '/' || paid, ',' order by seq) from public.plan_installment_status where invoice_id = %L$q$, i1), 'val=paid/40.00,partial/10.00,upcoming/0.00'),
      ('P32','Remaining on the 2nd instalment is $20','postgres','val', format($q$select remaining::text from public.plan_installment_status where invoice_id = %L and seq = 2$q$, i1), 'val=20.00'),
      ('P33','Waiver of $20 by the admin settles the 2nd instalment','adm_a','exec', format($q$select public.finance_apply_adjustment(%L, 'waiver', 20, 'Hardship waiver')$q$, i1), 'affected=1'),
      ('P34','Now 1st and 2nd are paid, 3rd upcoming','postgres','val', format($q$select string_agg(status, ',' order by seq) from public.plan_installment_status where invoice_id = %L$q$, i1), 'val=paid,paid,upcoming'),
      ('P35','Paying the last $30 completes the plan','fo_a','exec', format($q$select public.finance_confirm_payment(public.finance_record_payment(%L, %L, 30, 'USD', 'bank'::public.payment_method, 'PL-P2', null, current_date, 'Payer', null, 'idem-pl-0002'))$q$, stu_a, i1), 'affected=1'),
      ('P36','All three paid','postgres','val', format($q$select string_agg(status, ',' order by seq) from public.plan_installment_status where invoice_id = %L$q$, i1), 'val=paid,paid,paid'),
      ('P37','A refund of $30 on the last payment reopens the 3rd instalment','adm_a','exec', format($q$select public.finance_refund_payment((select id from public.payments where reference = 'PL-P2'), 30, 'cash', null, 'Refund test', null)$q$), 'affected=1'),
      ('P38','…3rd is upcoming again','postgres','val', format($q$select string_agg(status, ',' order by seq) from public.plan_installment_status where invoice_id = %L$q$, i1), 'val=paid,paid,upcoming'),
      ('P40','Make the 1st instalment of the books plan overdue (fixture back-dating)','postgres','exec', format($q$do $d$ begin alter table public.plan_installments disable trigger plan_installments_guard; update public.plan_installments set due_date = current_date - 3 where seq = 1 and plan_id = (select id from public.payment_plans where invoice_id = %L); alter table public.plan_installments enable trigger plan_installments_guard; end $d$$q$, i2), 'affected=0'),
      ('P41','Unpaid and past due is overdue; the other stays upcoming','postgres','val', format($q$select string_agg(status, ',' order by seq) from public.plan_installment_status where invoice_id = %L$q$, i2), 'val=overdue,upcoming'),
      ('P42','Overdue instalments can be listed by finance staff','fo_a','count', $q$select 1 from public.plan_installment_status where status = 'overdue'$q$, 'rows=1'),
      ('P50','Parent sees the plan for their child (3 instalments on invoice 1 + 2 on invoice 2)','par_a','count', $q$select 1 from public.plan_installment_status$q$, 'rows=5'),
      ('P51','Student sees their own instalments','stu_a','count', $q$select 1 from public.plan_installment_status$q$, 'rows=5'),
      ('P52','An unrelated parent sees none','par_x','count', $q$select 1 from public.plan_installment_status$q$, 'rows=0'),
      ('P53','Another schools admin sees none','adm_b','count', $q$select 1 from public.plan_installment_status$q$, 'rows=0'),
      ('P54','Anonymous cannot read the view at all','anon','count', $q$select 1 from public.plan_installment_status$q$, 'denied'),
      ('P55','Parent can read the plans table rows for their child','par_a','count', $q$select 1 from public.payment_plans$q$, 'rows=2'),
      ('P56','Unrelated parent reads no plans','par_x','count', $q$select 1 from public.payment_plans$q$, 'rows=0'),
      ('P60','Direct insert of a plan is closed','fo_a','exec', format($q$insert into public.payment_plans (school_id, invoice_id, student_id, currency, base_settled) select school_id, invoice_id, student_id, currency, 0 from public.payment_plans limit 1$q$), 'denied'),
      ('P61','Direct insert of an instalment is closed','adm_a','exec', format($q$insert into public.plan_installments (school_id, plan_id, seq, due_date, amount) select school_id, plan_id, 9, current_date + 99, 1 from public.plan_installments limit 1$q$), 'denied'),
      ('P62','An instalment cannot be edited, even by the owner','postgres','exec', $q$update public.plan_installments set amount = 1$q$, 'denied'),
      ('P63','An instalment cannot be deleted','postgres','exec', $q$delete from public.plan_installments$q$, 'denied'),
      ('P64','A plans details cannot be edited','postgres','exec', $q$update public.payment_plans set base_settled = 999$q$, 'denied'),
      ('P65','A plan cannot be deleted','postgres','exec', $q$delete from public.payment_plans$q$, 'denied'),
      ('P66','Browser roles cannot edit plans directly','adm_a','exec', $q$update public.payment_plans set status = 'cancelled'$q$, 'denied'),
      ('P70','A short reason is refused','fo_a','exec', format($q$select public.finance_cancel_payment_plan((select id from public.payment_plans where invoice_id = %L), 'x')$q$, i2), 'denied'),
      ('P71','Teacher cannot cancel a plan','tch_a','exec', format($q$select public.finance_cancel_payment_plan((select id from public.payment_plans where invoice_id = %L), 'No reason')$q$, i2), 'denied'),
      ('P72','Parent cannot cancel a plan','par_a','exec', format($q$select public.finance_cancel_payment_plan((select id from public.payment_plans where invoice_id = %L), 'No reason')$q$, i2), 'denied'),
      ('P73','Another schools admin cannot cancel','adm_b','exec', format($q$select public.finance_cancel_payment_plan((select id from public.payment_plans where invoice_id = %L), 'No reason')$q$, i2), 'denied'),
      ('P74','Finance officer cancels the books plan','fo_a','exec', format($q$select public.finance_cancel_payment_plan((select id from public.payment_plans where invoice_id = %L and status = 'active'), 'Family asked to change it')$q$, i2), 'affected=1'),
      ('P75','Its instalments now read inactive','postgres','val', format($q$select string_agg(status, ',' order by seq) from public.plan_installment_status where invoice_id = %L$q$, i2), 'val=inactive,inactive'),
      ('P76','Cancelling again is refused','fo_a','exec', format($q$select public.finance_cancel_payment_plan((select id from public.payment_plans where invoice_id = %L order by created_at limit 1), 'Twice')$q$, i2), 'denied'),
      ('P77','A new plan can be made after cancelling','fo_a','exec', format($q$select public.finance_create_payment_plan(%L, '[{"due_date":"%s","amount":25},{"due_date":"%s","amount":25},{"due_date":"%s","amount":25},{"due_date":"%s","amount":25}]'::jsonb, 'x')$q$, i2, (current_date + 7)::text, (current_date + 14)::text, (current_date + 21)::text, (current_date + 28)::text), 'affected=1'),
      ('P78','Both plans are kept (history), only one active','postgres','val', format($q$select count(*)::text || '/' || count(*) filter (where status = 'active')::text from public.payment_plans where invoice_id = %L$q$, i2), 'val=2/1'),
      ('P80','Plan creation, instalments and cancellation were audited','postgres','count', $q$select 1 from public.financial_audit_logs where action in ('PLAN_CREATED', 'PLAN_CANCELLED')$q$, 'rows>=4'),
      ('P81','Internal guards are not callable by browser roles','postgres','val', $q$select (has_function_privilege('authenticated', 'public.finance_create_payment_plan(uuid, jsonb, text)', 'execute') and not has_function_privilege('anon', 'public.finance_create_payment_plan(uuid, jsonb, text)', 'execute'))::text$q$, 'val=true')
    ) as c(id, descr, actor, kind, sql, expected)
    loop
      v_actor := case t.actor when 'adm_a' then adm_a when 'fo_a' then fo_a when 'tch_a' then tch_a
        when 'stu_a' then stu_a
        when 'par_a' then par_a when 'par_x' then par_x when 'adm_b' then adm_b end;
      begin
        if t.actor = 'anon' then
          perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
          perform set_config('role', 'anon', true);
        elsif t.actor <> 'postgres' then
          perform set_config('request.jwt.claims', json_build_object('sub', v_actor, 'role', 'authenticated')::text, true);
          perform set_config('role', 'authenticated', true);
        end if;

        if t.kind = 'count' then
          execute 'select count(*) from (' || t.sql || ') s' into v_n;
          v_actual := 'rows=' || v_n;
          if t.expected like 'rows>=%' then
            v_actual := case when v_n >= substring(t.expected from 7)::bigint then t.expected else 'rows=' || v_n end;
          end if;
        elsif t.kind = 'val' then
          execute t.sql into v_text;
          v_actual := 'val=' || coalesce(v_text, 'null');
        else
          execute t.sql;
          get diagnostics v_n = row_count;
          v_actual := 'affected=' || v_n;
        end if;
      exception when others then
        v_actual := 'denied (' || sqlstate || ': ' || left(sqlerrm, 70) || ')';
      end;
      perform set_config('role', v_session, true);
      perform set_config('request.jwt.claims', '', true);
      v_results := v_results || jsonb_build_object('id', t.id, 'descr', t.descr, 'expected', t.expected, 'actual', v_actual,
        'result', case when t.expected = 'denied' and v_actual like 'denied%' then 'PASS'
                       when t.expected = v_actual then 'PASS' else 'FAIL' end);
    end loop;

    raise exception using errcode = 'P0001', message = '__educore_rollback__';
  exception when sqlstate 'P0001' then
    if sqlerrm <> '__educore_rollback__' then raise; end if;
  end;

  return query select e->>'id', e->>'descr', e->>'expected', e->>'actual', e->>'result'
               from jsonb_array_elements(v_results) e;
end;
$fn$;

select * from pg_temp.educore_plan_tests();
