-- =============================================================================
-- EduCore — Receivables tests (migration: finance_receivables)
--
-- Same approach as the other suites: throwaway fixtures, every case runs as the
-- real `authenticated`/`anon` role with a forged JWT sub, everything is rolled
-- back. Run as the postgres role:
--   psql "$DATABASE_URL" -f supabase/tests/receivables.sql
-- Cases run IN ORDER and build on each other.
-- =============================================================================

create or replace function pg_temp.educore_receivable_tests()
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
  i_far uuid; i_soon uuid; i_late uuid; i_plan uuid; i_draft uuid; i_paid uuid; i_other uuid;
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
    i_far  := public.finance_create_invoice(stu_a, par_a, year_a, null, 'USD', current_date + 30, 'Far', '[{"fee_type":"tuition","amount":100}]'::jsonb);
    i_soon := public.finance_create_invoice(stu_a, par_a, year_a, null, 'USD', current_date + 3,  'Soon', '[{"fee_type":"other","amount":50}]'::jsonb);
    i_late := public.finance_create_invoice(stu_a, par_a, year_a, null, 'USD', current_date - 5,  'Late', '[{"fee_type":"other","amount":70}]'::jsonb);
    i_plan := public.finance_create_invoice(stu_a, par_a, year_a, null, 'USD', current_date - 20, 'Planned', '[{"fee_type":"laboratory","amount":90}]'::jsonb);
    i_draft := public.finance_create_invoice(stu_a, par_a, year_a, null, 'USD', current_date - 9, 'Draft', '[{"fee_type":"other","amount":40}]'::jsonb);
    i_paid := public.finance_create_invoice(stu_a, par_a, year_a, null, 'USD', current_date - 9, 'Paid', '[{"fee_type":"other","amount":20}]'::jsonb);
    perform public.finance_issue_invoice(i_far);
    perform public.finance_issue_invoice(i_soon);
    perform public.finance_issue_invoice(i_late);
    perform public.finance_issue_invoice(i_plan);
    perform public.finance_issue_invoice(i_paid);
    perform public.finance_confirm_payment(public.finance_record_payment(stu_a, i_paid, 20, 'USD', 'bank'::public.payment_method, 'RM-PAID-1', null, current_date, 'Payer', null, 'idem-rm-paid1'));
    -- the planned invoice: instalments today, in 5 days and in 40 days
    perform public.finance_create_payment_plan(i_plan, format('[{"due_date":"%s","amount":30},{"due_date":"%s","amount":30},{"due_date":"%s","amount":30}]', current_date, current_date + 5, current_date + 40)::jsonb, null);
    perform set_config('role', v_session, true);
    perform set_config('request.jwt.claims', '', true);

    for t in select * from (values
      ('R01','Staff see 6 receivable rows: far, soon, late, and 3 instalments of the planned invoice','fo_a','count', $q$select 1 from public.finance_receivables$q$, 'rows=6'),
      ('R02','A far-off invoice IS a receivable (unlike a reminder)','postgres','val', format($q$select amount_due::text from public.finance_receivables where invoice_id = %L$q$, i_far), 'val=100.00'),
      ('R03','Planned invoice: three instalments, no invoice-level row','postgres','val', format($q$select count(*)::text || '/' || count(*) filter (where installment_id is null)::text from public.finance_receivables where invoice_id = %L$q$, i_plan), 'val=3/0'),
      ('R04','Instalments add up to what the invoice owes','postgres','val', format($q$select sum(amount_due)::text from public.finance_receivables where invoice_id = %L$q$, i_plan), 'val=90.00'),
      ('R05','Draft invoices are not receivables','postgres','count', format($q$select 1 from public.finance_receivables where invoice_id = %L$q$, i_draft), 'rows=0'),
      ('R06','Paid invoices are not receivables','postgres','count', format($q$select 1 from public.finance_receivables where invoice_id = %L$q$, i_paid), 'rows=0'),
      ('R07','Total outstanding for the student is 100+50+70+90 = 310','postgres','val', format($q$select sum(amount_due)::text from public.finance_receivables where student_id = %L$q$, stu_a), 'val=310.00'),
      ('R08','That matches the student balance view','postgres','val', format($q$select balance::text from public.student_balances where student_id = %L$q$, stu_a), 'val=310.00'),
      ('R09','The parent sees their childs rows','par_a','count', $q$select 1 from public.finance_receivables$q$, 'rows=6'),
      ('R10','An unrelated parent sees none','par_x','count', $q$select 1 from public.finance_receivables$q$, 'rows=0'),
      ('R11','Another schools admin sees none','adm_b','count', $q$select 1 from public.finance_receivables$q$, 'rows=0'),
      ('R12','Anonymous cannot read','anon','count', $q$select 1 from public.finance_receivables$q$, 'denied'),
      ('R13','A waiver of $50 removes the soon-due invoice','adm_a','exec', format($q$select public.finance_apply_adjustment(%L, 'waiver', 50, 'Hardship')$q$, i_soon), 'affected=1'),
      ('R14','…and it leaves the receivables','postgres','count', format($q$select 1 from public.finance_receivables where invoice_id = %L$q$, i_soon), 'rows=0'),
      ('R15','Cancelling the plan turns three rows into one invoice-level row','fo_a','exec', format($q$select public.finance_cancel_payment_plan((select id from public.payment_plans where invoice_id = %L), 'Back to normal')$q$, i_plan), 'affected=1'),
      ('R16','…one row of $90','postgres','val', format($q$select count(*)::text || ' ' || sum(amount_due)::text from public.finance_receivables where invoice_id = %L$q$, i_plan), 'val=1 90.00')
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

select * from pg_temp.educore_receivable_tests();
