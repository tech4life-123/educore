-- =============================================================================
-- EduCore — Finance foundation tests (migrations: finance_officer_role,
-- finance_foundation)
--
-- Same approach as the other suites: throwaway fixtures, every case runs as the
-- real `authenticated` role with a forged JWT sub, and everything is rolled
-- back. Run as the postgres role:
--   psql "$DATABASE_URL" -f supabase/tests/finance.sql
--
-- Cases run IN ORDER and build on each other (a payment confirmed in one case
-- is reversed in a later one). Spec example used throughout: charges 500 + 50 +
-- 25 = 575; payments 200 + 150 -> balance 225.
-- =============================================================================

create or replace function pg_temp.educore_finance_tests()
returns table (test_id text, description text, expected text, actual text, result text)
language plpgsql
as $fn$
declare
  v_results jsonb := '[]'::jsonb;
  v_session text := session_user;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  -- people (profile id = auth user id, to keep the fixtures readable)
  adm_a uuid := gen_random_uuid(); fo_a uuid := gen_random_uuid(); tch_a uuid := gen_random_uuid();
  stu_a uuid := gen_random_uuid(); stu_a2 uuid := gen_random_uuid(); par_a uuid := gen_random_uuid(); par_x uuid := gen_random_uuid();
  adm_b uuid := gen_random_uuid(); stu_b uuid := gen_random_uuid(); sup uuid := gen_random_uuid();
  year_a uuid := gen_random_uuid(); term_a uuid := gen_random_uuid(); year_b uuid := gen_random_uuid(); term_b uuid := gen_random_uuid();
  inv1 uuid; invd uuid; inv2 uuid; inv_tmp uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid;
  v_actor uuid; v_n bigint; v_text text; v_actual text; t record;
  v_year int := extract(year from current_date)::int;

  -- one-line payment recorder (builds the SQL so the case table stays readable)
  rp text := $q$select public.finance_record_payment(%L, %L, %s, %L, %L::public.payment_method, %L, null, current_date, 'Payer', %L, %L)$q$;
begin
  begin
    insert into public.schools (id, name, code, slug, status) values
      (a, 'FIN Test A', 'FINTEST-A', 'fin-test-a', 'active'), (b, 'FIN Test B', 'FINTEST-B', 'fin-test-b', 'active');
    insert into auth.users (id, instance_id, aud, role, email)
    select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.id || '@fin.test'
    from unnest(array[adm_a, fo_a, tch_a, stu_a, stu_a2, par_a, par_x, adm_b, stu_b, sup]) as x(id);
    insert into public.profiles (id, user_id, school_id, first_name, last_name, role, status) values
      (adm_a, adm_a, a, 'T', 'AdmA', 'school_admin', 'active'),
      (fo_a,  fo_a,  a, 'T', 'FinA', 'finance_officer', 'active'),
      (tch_a, tch_a, a, 'T', 'TchA', 'teacher', 'active'),
      (stu_a, stu_a, a, 'T', 'StuA', 'student', 'active'),
      (stu_a2, stu_a2, a, 'T', 'StuA2', 'student', 'active'),
      (par_a, par_a, a, 'T', 'ParA', 'parent', 'active'),
      (par_x, par_x, a, 'T', 'ParX', 'parent', 'active'),
      (adm_b, adm_b, b, 'T', 'AdmB', 'school_admin', 'active'),
      (stu_b, stu_b, b, 'T', 'StuB', 'student', 'active'),
      (sup, sup, null, 'T', 'Sup', 'super_admin', 'active');
    insert into public.student_profiles (school_id, profile_id, admission_number, date_of_birth, home_address)
    values (a, stu_a, 'ADM-001', date '2012-01-01', '12 Secret Road'), (a, stu_a2, 'ADM-002', date '2012-02-02', '13 Secret Road');
    insert into public.guardian_links (school_id, parent_id, student_id) values (a, par_a, stu_a);
    insert into public.academic_years (id, school_id, name, starts_on, ends_on) values
      (year_a, a, 'FY A', date '2026-01-01', date '2026-12-31'), (year_b, b, 'FY B', date '2026-01-01', date '2026-12-31');
    insert into public.academic_terms (id, school_id, academic_year_id, name, sequence) values
      (term_a, a, year_a, 'T1', 1), (term_b, b, year_b, 'T1', 1);

    -- ---- setup, through the real functions, as real users -----------------
    perform set_config('request.jwt.claims', json_build_object('sub', adm_a, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    inv1 := public.finance_create_invoice(stu_a, par_a, year_a, term_a, 'USD', current_date + 30, 'Term 1',
      '[{"fee_type":"tuition","amount":500,"description":"Tuition"},{"fee_type":"library","amount":50},{"fee_type":"id_card","amount":25}]'::jsonb);
    invd := public.finance_create_invoice(stu_a, null, year_a, null, 'USD', current_date + 30, null,
      '[{"fee_type":"library","amount":10}]'::jsonb);
    perform public.finance_issue_invoice(inv1);

    perform set_config('request.jwt.claims', json_build_object('sub', fo_a, 'role', 'authenticated')::text, true);
    p1 := public.finance_record_payment(stu_a, inv1, 200, 'USD', 'bank', 'B-1', null, current_date, 'Mr A', null, 'idem-key-0001');
    p2 := public.finance_record_payment(stu_a, inv1, 150, 'USD', 'orange_money', 'OM-1', 'TX-9', current_date, 'Mrs A', null, null);
    p4 := public.finance_record_payment(stu_a, inv1, 10, 'USD', 'cash', 'CASH-1', null, current_date, null, 'Paid at the office desk', null);
    p3 := public.finance_record_payment(stu_a, inv1, 300, 'USD', 'bank', 'B-3', null, current_date, null, null, null);
    perform set_config('role', v_session, true);
    perform set_config('request.jwt.claims', '', true);

    for t in select * from (values
      -- ===================== visibility ===============================
      ('F01','Finance officer sees the school''s invoices (issued + draft)', 'fo_a','count', 'select 1 from public.invoices', 'rows=2'),
      ('F02','Teacher sees no invoices',                         'tch_a','count', 'select 1 from public.invoices', 'rows=0'),
      ('F03','Other school''s admin sees no invoices',           'adm_b','count', 'select 1 from public.invoices', 'rows=0'),
      ('F04','Super admin sees no invoices (no automatic access)','sup','count', 'select 1 from public.invoices', 'rows=0'),
      ('F05','Student sees own issued invoice, not the draft',   'stu_a','count', 'select 1 from public.invoices', 'rows=1'),
      ('F06','Linked parent sees the child''s invoice',          'par_a','count', 'select 1 from public.invoices', 'rows=1'),
      ('F07','Another student sees nothing',                     'stu_a2','count', 'select 1 from public.invoices', 'rows=0'),
      ('F08','Unlinked parent sees nothing',                     'par_x','count', 'select 1 from public.invoices', 'rows=0'),
      ('F09','Student cannot see pending payments',              'stu_a','count', 'select 1 from public.payments', 'rows=0'),
      ('F10','Parent sees the child''s 3 charge entries',        'par_a','count', 'select 1 from public.student_account_entries', 'rows=3'),
      ('F11','Another student sees no ledger entries',           'stu_a2','count', 'select 1 from public.student_account_entries', 'rows=0'),
      ('F12','Teacher sees no ledger entries',                   'tch_a','count', 'select 1 from public.student_account_entries', 'rows=0'),
      ('F13','Anonymous cannot read invoices',                   'anon','count', 'select 1 from public.invoices', 'denied'),
      ('F14','Student sees own invoice lines only (not draft''s)','stu_a','count', 'select 1 from public.invoice_items', 'rows=3'),
      ('F15','Nobody reads the counters table',                  'adm_a','count', 'select 1 from public.finance_counters', 'denied'),

      -- ===================== direct writes are closed =================
      ('F16','School admin inserts an invoice directly',         'adm_a','exec', format($q$insert into public.invoices (school_id, student_id, academic_year_id, currency, due_date) values (%L, %L, %L, 'USD', current_date)$q$, a, stu_a, year_a), 'denied'),
      ('F17','Finance officer inserts a payment directly',       'fo_a','exec', format($q$insert into public.payments (school_id, student_id, amount, currency, method, reference, paid_on) values (%L, %L, 5, 'USD', 'bank', 'X', current_date)$q$, a, stu_a), 'denied'),
      ('F18','School admin inserts a ledger entry directly',     'adm_a','exec', format($q$insert into public.student_account_entries (school_id, account_id, student_id, currency, direction, entry_type, amount, description) select school_id, id, student_id, 'USD', 'credit', 'adjustment', 5, 'x' from public.student_accounts where student_id = %L$q$, stu_a), 'denied'),
      ('F19','School admin edits an invoice directly',           'adm_a','exec', format('update public.invoices set due_date = current_date where id = %L', inv1), 'denied'),
      ('F20','School admin deletes an invoice directly',         'adm_a','exec', format('delete from public.invoices where id = %L', invd), 'denied'),
      ('F21','School admin edits a payment directly',            'adm_a','exec', format($q$update public.payments set status = 'posted' where id = %L$q$, p1), 'denied'),
      ('F22','School admin deletes a ledger entry directly',     'adm_a','exec', 'delete from public.student_account_entries', 'denied'),

      -- ===================== fee configuration ========================
      ('F23','Finance officer creates a fee structure',          'fo_a','exec', format($q$insert into public.fee_structures (school_id, name, academic_year_id, currency) values (%L, 'Nope', %L, 'USD')$q$, a, year_a), 'denied'),
      ('F24','School admin creates a fee structure (control)',   'adm_a','exec', format($q$insert into public.fee_structures (school_id, name, academic_year_id, term_id, currency) values (%L, 'Grade 1 fees', %L, %L, 'USD')$q$, a, year_a, term_a), 'affected=1'),
      ('F25','Finance officer reads the fee structure',          'fo_a','count', 'select 1 from public.fee_structures', 'rows=1'),
      ('F26','Teacher cannot read fee structures',               'tch_a','count', 'select 1 from public.fee_structures', 'rows=0'),
      ('F27','Student cannot read fee structures',               'stu_a','count', 'select 1 from public.fee_structures', 'rows=0'),
      ('F28','Fee structure in a currency we do not support',    'adm_a','exec', format($q$insert into public.fee_structures (school_id, name, academic_year_id, currency) values (%L, 'EUR', %L, 'EUR')$q$, a, year_a), 'denied'),
      ('F29','School B admin builds a structure on A''s year',    'adm_b','exec', format($q$insert into public.fee_structures (school_id, name, academic_year_id, currency) values (%L, 'Sneaky', %L, 'USD')$q$, b, year_a), 'denied'),
      ('F30','Term from a different year in the same school',    'adm_a','exec', format($q$insert into public.fee_structures (school_id, name, academic_year_id, term_id, currency) values (%L, 'Mismatch', %L, %L, 'USD')$q$, a, year_a, term_b), 'denied'),
      ('F31','Negative fee item amount',                         'adm_a','exec', format($q$insert into public.fee_items (school_id, fee_structure_id, fee_type, amount) select school_id, id, 'tuition', -5 from public.fee_structures where school_id = %L$q$, a), 'denied'),
      ('F32','Finance officer changes finance settings',         'fo_a','exec', $q$update public.finance_settings set default_currency = 'LRD'$q$, 'affected=0'),
      ('F33','School admin changes the default currency',        'adm_a','exec', $q$update public.finance_settings set default_currency = 'LRD'$q$, 'affected=1'),
      ('F34','School A admin cannot touch School B''s settings', 'adm_a','exec', format($q$update public.finance_settings set invoice_prefix = 'HACK' where school_id = %L$q$, b), 'affected=0'),
      ('F35','Every school got a settings row (A + B)',          'postgres','count', format('select 1 from public.finance_settings where school_id in (%L, %L)', a, b), 'rows=2'),

      -- ===================== function gating ==========================
      ('F36','Teacher creates an invoice',                       'tch_a','exec', format($q$select public.finance_create_invoice(%L, null, %L, null, 'USD', current_date, null, '[{"fee_type":"tuition","amount":1}]')$q$, stu_a, year_a), 'denied'),
      ('F37','Parent confirms a payment',                        'par_a','exec', format('select public.finance_confirm_payment(%L)', p1), 'denied'),
      ('F38','Student issues an invoice',                        'stu_a','exec', format('select public.finance_issue_invoice(%L)', invd), 'denied'),
      ('F39','Super admin confirms a payment',                   'sup','exec', format('select public.finance_confirm_payment(%L)', p1), 'denied'),
      ('F40','Other school''s admin confirms our payment',       'adm_b','exec', format('select public.finance_confirm_payment(%L)', p1), 'denied'),
      ('F41','Anonymous calls a finance function',               'anon','exec', format('select public.finance_confirm_payment(%L)', p1), 'denied'),
      ('F42','Other school''s admin cancels our invoice',        'adm_b','exec', format($q$select public.finance_cancel_invoice(%L, 'not yours')$q$, inv1), 'denied'),
      ('F43','Other school''s admin records a payment for our student','adm_b','exec', format(rp, stu_a, null, '5', 'USD', 'bank', 'ZZ-1', null, null), 'denied'),

      -- ===================== invoice rules ============================
      ('F44','Invoice with no lines',                            'adm_a','exec', format($q$select public.finance_create_invoice(%L, null, %L, null, 'USD', current_date, null, '[]')$q$, stu_a, year_a), 'denied'),
      ('F45','Invoice for a teacher as the student',             'adm_a','exec', format($q$select public.finance_create_invoice(%L, null, %L, null, 'USD', current_date, null, '[{"fee_type":"tuition","amount":1}]')$q$, tch_a, year_a), 'denied'),
      ('F46','Invoice for another school''s student',            'adm_a','exec', format($q$select public.finance_create_invoice(%L, null, %L, null, 'USD', current_date, null, '[{"fee_type":"tuition","amount":1}]')$q$, stu_b, year_a), 'denied'),
      ('F47','Invoice with a term from another school',          'adm_a','exec', format($q$select public.finance_create_invoice(%L, null, %L, %L, 'USD', current_date, null, '[{"fee_type":"tuition","amount":1}]')$q$, stu_a, year_a, term_b), 'denied'),
      ('F48','Fee line with 3 decimals',                         'adm_a','exec', format($q$select public.finance_create_invoice(%L, null, %L, null, 'USD', current_date, null, '[{"fee_type":"tuition","amount":10.123}]')$q$, stu_a, year_a), 'denied'),
      ('F49','Fee line of zero',                                 'adm_a','exec', format($q$select public.finance_create_invoice(%L, null, %L, null, 'USD', current_date, null, '[{"fee_type":"tuition","amount":0}]')$q$, stu_a, year_a), 'denied'),
      ('F50','Guardian who is not linked to the student',        'adm_a','exec', format($q$select public.finance_create_invoice(%L, %L, %L, null, 'USD', current_date, null, '[{"fee_type":"tuition","amount":1}]')$q$, stu_a, par_x, year_a), 'denied'),
      ('F51','Invoice in an unsupported currency',               'adm_a','exec', format($q$select public.finance_create_invoice(%L, null, %L, null, 'EUR', current_date, null, '[{"fee_type":"tuition","amount":1}]')$q$, stu_a, year_a), 'denied'),
      ('F52','Issued invoice got the first gap-free number',     'postgres','val', format('select invoice_number from public.invoices where id = %L', inv1), format('val=INV-%s-00001', v_year)),
      ('F53','Issuing the same invoice twice',                   'adm_a','exec', format('select public.finance_issue_invoice(%L)', inv1), 'denied'),
      ('F54','The draft has no number and no ledger entries',    'postgres','count', format('select 1 from public.invoices i where i.id = %L and i.invoice_number is null and not exists (select 1 from public.student_account_entries e where e.invoice_id = i.id)', invd), 'rows=1'),
      ('F55','Draft status does not leak a paid state',          'postgres','val', format('select display_status from public.invoice_balances where invoice_id = %L', invd), 'val=draft'),
      ('F56','Charges 500+50+25 are in the ledger as 575',       'postgres','val', format('select balance::text from public.student_balances where student_id = %L', stu_a), 'val=575.00'),

      -- ===================== recording payments =======================
      ('F57','Payment without a reference',                      'fo_a','exec', format($q$select public.finance_record_payment(%L, %L, 5, 'USD', 'bank', '  ', null, current_date, null, null, null)$q$, stu_a, inv1), 'denied'),
      ('F58','Cash payment without an explanation',              'fo_a','exec', format($q$select public.finance_record_payment(%L, %L, 5, 'USD', 'cash', 'CASH-2', null, current_date, null, null, null)$q$, stu_a, inv1), 'denied'),
      ('F59','Payment dated in the future',                      'fo_a','exec', format($q$select public.finance_record_payment(%L, %L, 5, 'USD', 'bank', 'FUT-1', null, current_date + 1, null, null, null)$q$, stu_a, inv1), 'denied'),
      ('F60','Same bank reference twice',                        'fo_a','exec', format(rp, stu_a, inv1, '5', 'USD', 'bank', 'B-1', null, null), 'denied'),
      ('F61','Same reference through a different channel is fine','fo_a','exec', format(rp, stu_a, inv1, '5', 'USD', 'mtn_momo', 'B-1', null, null), 'affected=1'),
      ('F62','Retrying with the same request key returns the same payment','fo_a','val', format($q$select (public.finance_record_payment(%L, %L, 200, 'USD', 'bank', 'B-1', null, current_date, 'Mr A', null, 'idem-key-0001') = %L)::text$q$, stu_a, inv1, p1), 'val=true'),
      ('F63','Request key reused for a different amount',        'fo_a','exec', format(rp, stu_a, inv1, '999', 'USD', 'bank', 'B-77', null, 'idem-key-0001'), 'denied'),
      ('F64','Payment against a draft invoice',                  'fo_a','exec', format(rp, stu_a, invd, '5', 'USD', 'bank', 'DR-1', null, null), 'denied'),
      ('F65','Payment in a different currency than the invoice', 'fo_a','exec', format(rp, stu_a, inv1, '5', 'LRD', 'bank', 'LRD-1', null, null), 'denied'),
      ('F66','Payment for another student on this invoice',      'fo_a','exec', format(rp, stu_a2, inv1, '5', 'USD', 'bank', 'WRONG-1', null, null), 'denied'),
      ('F67','Zero / negative / 3-decimal amounts',              'fo_a','exec', format(rp, stu_a, inv1, '-5', 'USD', 'bank', 'NEG-1', null, null), 'denied'),
      ('F68','A pending payment changes no balance',             'postgres','val', format('select balance::text from public.student_balances where student_id = %L', stu_a), 'val=575.00'),
      ('F69','Payment states cannot skip: pending -> posted by SQL','postgres','exec', format($q$update public.payments set status = 'posted' where id = %L$q$, p4), 'denied'),
      ('F70','A payment''s amount cannot be edited, even by SQL', 'postgres','exec', format('update public.payments set amount = 1 where id = %L', p1), 'denied'),
      ('F71','A payment cannot be deleted, even by SQL',         'postgres','exec', format('delete from public.payments where id = %L', p1), 'denied'),

      -- ===================== confirming (the only road to the ledger) =
      ('F72','Finance officer confirms the 200 bank payment',    'fo_a','exec', format('select public.finance_confirm_payment(%L)', p1), 'affected=1'),
      ('F73','…it is POSTED with a ledger entry and a verifier', 'postgres','count', format('select 1 from public.payments where id = %L and status = ''posted'' and ledger_entry_id is not null and verified_by = %L and verified_at is not null', p1, fo_a), 'rows=1'),
      ('F74','…the balance dropped to 375',                      'postgres','val', format('select balance::text from public.student_balances where student_id = %L', stu_a), 'val=375.00'),
      ('F75','Confirming it again',                              'fo_a','exec', format('select public.finance_confirm_payment(%L)', p1), 'denied'),
      ('F76','School admin confirms the 150 mobile-money payment','adm_a','exec', format('select public.finance_confirm_payment(%L)', p2), 'affected=1'),
      ('F77','Spec example: 575 charged, 350 paid -> 225 owed',   'postgres','val', format('select balance::text from public.student_balances where student_id = %L', stu_a), 'val=225.00'),
      ('F78','…total_paid is 350 and total_charges 575',         'postgres','count', format('select 1 from public.student_balances where student_id = %L and total_paid = 350 and total_charges = 575', stu_a), 'rows=1'),
      ('F79','…invoice shows partially_paid, 350 paid, 225 due', 'postgres','count', format($q$select 1 from public.invoice_balances where invoice_id = %L and display_status = 'partially_paid' and amount_paid = 350 and balance_due = 225 and total_amount = 575$q$, inv1), 'rows=1'),
      ('F80','Parent now sees the two posted payments',          'par_a','count', 'select 1 from public.payments', 'rows=2'),
      ('F81','…but not the still-pending ones',                  'stu_a','count', $q$select 1 from public.payments where status = 'pending'$q$, 'rows=0'),
      ('F82','Parent reads the derived balance',                 'par_a','val', 'select balance::text from public.student_balances', 'val=225.00'),
      ('F83','Another student reads no balance',                 'stu_a2','count', 'select 1 from public.student_balances', 'rows=0'),
      ('F84','Overpayment: confirming 300 against 225 owed is refused','fo_a','exec', format('select public.finance_confirm_payment(%L)', p3), 'denied'),
      ('F86','The ledger is append-only: no update',             'postgres','exec', 'update public.student_account_entries set amount = amount + 1', 'denied'),
      ('F87','The ledger is append-only: no delete',             'postgres','exec', 'delete from public.student_account_entries', 'denied'),

      -- ===================== reject / reverse =========================
      ('F88','Reject a payment without a reason',                'fo_a','exec', format($q$select public.finance_reject_payment(%L, '')$q$, p4), 'denied'),
      ('F89','Reject the cash payment with a reason',            'fo_a','exec', format($q$select public.finance_reject_payment(%L, 'No receipt found')$q$, p4), 'affected=1'),
      ('F90','A rejected payment is final',                      'fo_a','exec', format('select public.finance_confirm_payment(%L)', p4), 'denied'),
      ('F91','A rejected reference may be entered again',        'fo_a','exec', format(rp, stu_a, inv1, '10', 'USD', 'cash', 'CASH-1', 'Receipt found, re-entered', null), 'affected=1'),
      ('F92','Reverse a payment without a reason',               'fo_a','exec', format($q$select public.finance_reverse_payment(%L, ' ')$q$, p2), 'denied'),
      ('F93','Teacher reverses a payment',                       'tch_a','exec', format($q$select public.finance_reverse_payment(%L, 'because')$q$, p2), 'denied'),
      ('F94','Reverse the 150 mobile-money payment',             'fo_a','exec', format($q$select public.finance_reverse_payment(%L, 'Wrong student')$q$, p2), 'affected=1'),
      ('F95','…the original entry is untouched, a reversal was added','postgres','count', format($q$select 1 from public.student_account_entries e where e.payment_id = %L and e.entry_type = 'payment' and e.amount = 150$q$, p2), 'rows=1'),
      ('F96','…balance is back to 375',                          'postgres','val', format('select balance::text from public.student_balances where student_id = %L', stu_a), 'val=375.00'),
      ('F97','…invoice amount_paid is 200 again',                'postgres','val', format('select amount_paid::text from public.invoice_balances where invoice_id = %L', inv1), 'val=200.00'),
      ('F98','Reversing it twice',                               'fo_a','exec', format($q$select public.finance_reverse_payment(%L, 'again')$q$, p2), 'denied'),
      ('F99','Reversing a payment that is still pending',        'fo_a','exec', format($q$select public.finance_reverse_payment(%L, 'nope')$q$, p3), 'denied'),
      ('F100','Ledger now: 3 charges + 2 payments + 1 reversal', 'postgres','count', format('select 1 from public.student_account_entries where student_id = %L', stu_a), 'rows=6'),
      ('F101','A reversed payment is no longer shown as paid to the family','stu_a','count', $q$select 1 from public.payments where status = 'posted'$q$, 'rows=1'),

      -- ===================== cancelling invoices ======================
      ('F102','Cancel an invoice that has a live payment',       'adm_a','exec', format($q$select public.finance_cancel_invoice(%L, 'Created in error')$q$, inv1), 'denied'),
      ('F103','Cancel without a reason',                         'adm_a','exec', format($q$select public.finance_cancel_invoice(%L, '')$q$, invd), 'denied'),
      ('F104','Cancel the unissued draft (no ledger effect)',    'adm_a','exec', format($q$select public.finance_cancel_invoice(%L, 'Not needed')$q$, invd), 'affected=1'),
      ('F105','A cancelled invoice cannot be issued',            'adm_a','exec', format('select public.finance_issue_invoice(%L)', invd), 'denied'),
      ('F106','A cancelled invoice cannot be cancelled again',   'adm_a','exec', format($q$select public.finance_cancel_invoice(%L, 'twice')$q$, invd), 'denied'),
      ('F107','A cancelled invoice''s status cannot be edited by SQL','postgres','exec', format($q$update public.invoices set status = 'issued' where id = %L$q$, invd), 'denied'),
      ('F108','An issued invoice''s currency cannot be edited',  'postgres','exec', format($q$update public.invoices set currency = 'LRD' where id = %L$q$, inv1), 'denied'),
      ('F109','Issued invoice lines cannot be edited',           'postgres','exec', format('update public.invoice_items set amount = 1 where invoice_id = %L', inv1), 'denied'),
      ('F110','Issued invoice lines cannot be deleted',          'postgres','exec', format('delete from public.invoice_items where invoice_id = %L', inv1), 'denied'),
      ('F111','Payment against a cancelled invoice',             'fo_a','exec', format(rp, stu_a, invd, '5', 'USD', 'bank', 'CAN-1', null, null), 'denied'),

      -- ===================== audit log ================================
      ('F112','INVOICE_ISSUED was logged',                       'postgres','count', format($q$select 1 from public.financial_audit_logs where school_id = %L and action = 'INVOICE_ISSUED' and entity_id = %L$q$, a, inv1), 'rows>=1'),
      ('F113','PAYMENT_POSTED was logged with the actor''s role','postgres','count', format($q$select 1 from public.financial_audit_logs where school_id = %L and action = 'PAYMENT_POSTED' and entity_id = %L and actor_role = 'finance_officer'$q$, a, p1), 'rows>=1'),
      ('F114','PAYMENT_REVERSED was logged',                     'postgres','count', format($q$select 1 from public.financial_audit_logs where school_id = %L and action = 'PAYMENT_REVERSED' and entity_id = %L$q$, a, p2), 'rows>=1'),
      ('F115','PAYMENT_REJECTED and INVOICE_CANCELLED were logged','postgres','count', format($q$select 1 from public.financial_audit_logs where school_id = %L and action in ('PAYMENT_REJECTED', 'INVOICE_CANCELLED')$q$, a), 'rows>=2'),
      ('F116','FEE_CHANGED and FINANCE_SETTINGS_CHANGED were logged','postgres','count', format($q$select 1 from public.financial_audit_logs where school_id = %L and action in ('FEE_CHANGED', 'FINANCE_SETTINGS_CHANGED')$q$, a), 'rows>=2'),
      ('F117','Finance officer can read the audit log',          'fo_a','count', 'select 1 from public.financial_audit_logs', 'rows>=1'),
      ('F118','Teacher cannot read the audit log',               'tch_a','count', 'select 1 from public.financial_audit_logs', 'rows=0'),
      ('F119','Student cannot read the audit log',               'stu_a','count', 'select 1 from public.financial_audit_logs', 'rows=0'),
      ('F120','Other school''s admin cannot read our audit log', 'adm_b','count', format('select 1 from public.financial_audit_logs where school_id = %L', a), 'rows=0'),
      ('F121','Super admin cannot read the audit log',           'sup','count', 'select 1 from public.financial_audit_logs', 'rows=0'),
      ('F122','Nobody can write the audit log directly',         'adm_a','exec', format($q$insert into public.financial_audit_logs (school_id, action, entity_type) values (%L, 'FAKE', 'x')$q$, a), 'denied'),
      ('F123','The audit log cannot be edited, even by SQL',     'postgres','exec', 'update public.financial_audit_logs set action = action', 'denied'),
      ('F124','The audit log cannot be deleted, even by SQL',    'postgres','exec', 'delete from public.financial_audit_logs', 'denied'),

      -- ===================== staff lookup view / profiles =============
      ('F125','Finance officer finds the school''s two students','fo_a','count', 'select 1 from public.finance_students', 'rows=2'),
      ('F126','…with the admission number',                      'fo_a','count', $q$select 1 from public.finance_students where admission_number = 'ADM-001'$q$, 'rows=1'),
      ('F127','Teacher gets nothing from the finance lookup',    'tch_a','count', 'select 1 from public.finance_students', 'rows=0'),
      ('F128','Student gets nothing from the finance lookup',    'stu_a','count', 'select 1 from public.finance_students', 'rows=0'),
      ('F129','School B''s admin sees only School B''s student', 'adm_b','count', 'select 1 from public.finance_students', 'rows=1'),
      ('F130','Finance officer cannot read sensitive student records','fo_a','count', 'select 1 from public.student_profiles', 'rows=0'),
      ('F131','Finance officer can read names in their own school','fo_a','count', 'select 1 from public.profiles', 'rows=7'),
      ('F132','Finance officer cannot read the other school''s people','fo_a','count', format('select 1 from public.profiles where school_id = %L', b), 'rows=0'),

      -- ===================== receipts (Phase 2) =======================
      ('R01','Confirming the 200 payment issued receipt #1 (575 -> 375)', 'postgres','count', format($q$select 1 from public.receipts where payment_id = %L and receipt_number = 'RCT-%s-00001' and previous_balance = 575 and remaining_balance = 375 and amount = 200$q$, p1, v_year), 'rows=1'),
      ('R02','…and receipt #2 for the 150 payment (375 -> 225)',    'postgres','count', format($q$select 1 from public.receipts where payment_id = %L and receipt_number = 'RCT-%s-00002' and previous_balance = 375 and remaining_balance = 225$q$, p2, v_year), 'rows=1'),
      ('R03','A refused (overpaying) confirmation issued no receipt','postgres','count', format('select 1 from public.receipts where payment_id = %L', p3), 'rows=0'),
      ('R04','Only the two confirmed payments have receipts',       'postgres','count', format('select 1 from public.receipts where school_id = %L', a), 'rows=2'),
      ('R05','Student reads own receipts',                          'stu_a','count', 'select 1 from public.receipts', 'rows=2'),
      ('R06','Linked parent reads the child''s receipts',            'par_a','count', 'select 1 from public.receipts', 'rows=2'),
      ('R07','Another student reads no receipts',                   'stu_a2','count', 'select 1 from public.receipts', 'rows=0'),
      ('R08','Finance officer reads the school''s receipts',         'fo_a','count', 'select 1 from public.receipts', 'rows=2'),
      ('R09','Teacher reads no receipts',                           'tch_a','count', 'select 1 from public.receipts', 'rows=0'),
      ('R10','Other school''s admin reads no receipts',              'adm_b','count', 'select 1 from public.receipts', 'rows=0'),
      ('R11','Super admin reads no receipts',                       'sup','count', 'select 1 from public.receipts', 'rows=0'),
      ('R12','Anonymous cannot read the receipts table',            'anon','count', 'select 1 from public.receipts', 'denied'),
      ('R13','Nobody inserts a receipt directly',                   'adm_a','exec', format($q$insert into public.receipts (school_id, receipt_number, payment_id, student_id, currency, amount, previous_balance, remaining_balance) values (%L, 'FAKE-1', %L, %L, 'USD', 1, 1, 0)$q$, a, p4, stu_a), 'denied'),
      ('R14','A receipt cannot be edited, even by SQL',             'postgres','exec', 'update public.receipts set amount = 1', 'denied'),
      ('R15','A receipt cannot be deleted, even by SQL',            'postgres','exec', 'delete from public.receipts', 'denied'),
      ('R16','Verifying a receipt''s token says it is valid',        'postgres','val', format($q$select is_valid::text from public.verify_receipt((select verification_token from public.receipts where payment_id = %L))$q$, p1), 'val=true'),
      ('R17','…it shows the amount but only the student''s first name and initial', 'postgres','val', format($q$select amount::text || ' ' || student_label from public.verify_receipt((select verification_token from public.receipts where payment_id = %L))$q$, p1), 'val=200.00 T S.'),
      ('R18','A reversed payment''s receipt verifies as NOT valid',   'postgres','val', format($q$select is_valid::text || ' ' || payment_status::text from public.verify_receipt((select verification_token from public.receipts where payment_id = %L))$q$, p2), 'val=false reversed'),
      ('R19','An unknown token verifies as nothing',                'postgres','count', $q$select 1 from public.verify_receipt('0123456789abcdef0123456789abcdef0123')$q$, 'rows=0'),
      ('R20','A short token verifies as nothing',                   'postgres','count', $q$select 1 from public.verify_receipt('abc')$q$, 'rows=0'),
      ('R21','Anonymous may call the verification function',        'postgres','val', $q$select has_function_privilege('anon', 'public.verify_receipt(text)', 'execute')::text$q$, 'val=true'),
      ('R22','…but not the confirm function',                       'postgres','val', $q$select has_function_privilege('anon', 'public.finance_confirm_payment(uuid)', 'execute')::text$q$, 'val=false'),
      ('R23','RECEIPT_GENERATED was audited',                       'postgres','count', format($q$select 1 from public.financial_audit_logs where school_id = %L and action = 'RECEIPT_GENERATED'$q$, a), 'rows>=2'),
      ('R24','…without leaking the verification token into the log', 'postgres','count', format($q$select 1 from public.financial_audit_logs where school_id = %L and action = 'RECEIPT_GENERATED' and new_data ? 'verification_token'$q$, a), 'rows=0'),

      -- ===================== reconciliation centre (Phase 2) ==========
      ('T01','Finance officer logs a $150 Orange Money transaction', 'fo_a','exec', $q$select public.finance_log_transaction('orange_money', 150, 'USD', 'OM-100', current_date, 'Mrs A', '+231770000000', null)$q$, 'affected=1'),
      ('T02','Logging the same method + reference again',           'fo_a','exec', $q$select public.finance_log_transaction('orange_money', 150, 'USD', 'OM-100', current_date, null, null, null)$q$, 'denied'),
      ('T03','Teacher logs a transaction',                          'tch_a','exec', $q$select public.finance_log_transaction('bank', 5, 'USD', 'T-1', current_date, null, null, null)$q$, 'denied'),
      ('T04','Parent logs a transaction',                           'par_a','exec', $q$select public.finance_log_transaction('bank', 5, 'USD', 'T-2', current_date, null, null, null)$q$, 'denied'),
      ('T05','Transaction dated in the future',                     'fo_a','exec', $q$select public.finance_log_transaction('bank', 5, 'USD', 'T-3', current_date + 1, null, null, null)$q$, 'denied'),
      ('T06','Finance officer sees the transaction',                'fo_a','count', 'select 1 from public.incoming_transactions', 'rows=1'),
      ('T07','Teacher sees no transactions',                        'tch_a','count', 'select 1 from public.incoming_transactions', 'rows=0'),
      ('T08','Student sees no transactions',                        'stu_a','count', 'select 1 from public.incoming_transactions', 'rows=0'),
      ('T09','Other school''s admin sees no transactions',           'adm_b','count', 'select 1 from public.incoming_transactions', 'rows=0'),
      ('T10','Super admin sees no transactions',                    'sup','count', 'select 1 from public.incoming_transactions', 'rows=0'),
      ('T11','Anonymous cannot read transactions',                  'anon','count', 'select 1 from public.incoming_transactions', 'denied'),
      ('T12','(setup) a pending payment of the WRONG amount (100)',  'fo_a','exec', format(rp, stu_a, inv1, '100', 'USD', 'orange_money', 'OM-WRONG', null, null), 'affected=1'),
      ('T13','Matching it to the $150 transaction is refused',      'fo_a','exec', $q$select public.finance_match_transaction((select id from public.incoming_transactions where reference = 'OM-100'), (select id from public.payments where reference = 'OM-WRONG'))$q$, 'denied'),
      ('T14','…and the transaction is still unmatched',              'fo_a','count', $q$select 1 from public.incoming_transactions where reference = 'OM-100' and status = 'unmatched'$q$, 'rows=1'),
      ('T15','(setup) a pending payment of the right amount (150)',  'fo_a','exec', format(rp, stu_a, inv1, '150', 'USD', 'orange_money', 'OM-RIGHT', null, null), 'affected=1'),
      ('T16','Parent cannot match',                                 'par_a','exec', $q$select public.finance_match_transaction((select id from public.incoming_transactions where reference = 'OM-100'), (select id from public.payments where reference = 'OM-RIGHT'))$q$, 'denied'),
      ('T17','Other school''s admin cannot match',                   'adm_b','exec', $q$select public.finance_match_transaction((select id from public.incoming_transactions where reference = 'OM-100'), (select id from public.payments where reference = 'OM-RIGHT'))$q$, 'denied'),
      ('T18','Finance officer matches the transaction to the right payment','fo_a','exec', $q$select public.finance_match_transaction((select id from public.incoming_transactions where reference = 'OM-100'), (select id from public.payments where reference = 'OM-RIGHT'))$q$, 'affected=1'),
      ('T19','…the payment is POSTED and the transaction MATCHED',  'postgres','count', $q$select 1 from public.payments p join public.incoming_transactions t on t.payment_id = p.id where p.reference = 'OM-RIGHT' and p.status = 'posted' and t.status = 'matched'$q$, 'rows=1'),
      ('T20','…a receipt was issued for it (#3)',                    'postgres','count', format($q$select 1 from public.receipts r join public.payments p on p.id = r.payment_id where p.reference = 'OM-RIGHT' and r.receipt_number = 'RCT-%s-00003'$q$, v_year), 'rows=1'),
      ('T21','…and the balance is 575 - 200 - 150 = 225',            'postgres','val', format('select balance::text from public.student_balances where student_id = %L', stu_a), 'val=225.00'),
      ('T22','…the payment went through RECONCILED on its way (audited)', 'postgres','count', format($q$select 1 from public.financial_audit_logs where school_id = %L and action = 'PAYMENT_RECONCILED'$q$, a), 'rows>=1'),
      ('T23','Matching the same transaction twice',                 'fo_a','exec', $q$select public.finance_match_transaction((select id from public.incoming_transactions where reference = 'OM-100'), (select id from public.payments where reference = 'OM-WRONG'))$q$, 'denied'),
      ('T24','Log a $25 bank transaction (no matching payment yet)', 'fo_a','exec', $q$select public.finance_log_transaction('bank', 25, 'USD', 'BK-200', current_date, 'Someone', null, null)$q$, 'affected=1'),
      ('T25','Assign it to a different student (no invoice)',        'fo_a','exec', format($q$select public.finance_assign_transaction((select id from public.incoming_transactions where reference = 'BK-200'), %L, null, 'Parent called to confirm')$q$, stu_a2), 'affected=1'),
      ('T26','…that student''s account holds a 25 credit',           'postgres','val', format('select balance::text from public.student_balances where student_id = %L', stu_a2), 'val=-25.00'),
      ('T27','Log a $9,999 bank transaction',                       'fo_a','exec', $q$select public.finance_log_transaction('bank', 9999, 'USD', 'BK-300', current_date, null, null, null)$q$, 'affected=1'),
      ('T28','Assigning it to an invoice that can''t take it is refused', 'fo_a','exec', format($q$select public.finance_assign_transaction((select id from public.incoming_transactions where reference = 'BK-300'), %L, %L, null)$q$, stu_a, inv1), 'denied'),
      ('T29','…and the failed assignment left NO payment behind',    'postgres','count', $q$select 1 from public.payments where reference = 'BK-300'$q$, 'rows=0'),
      ('T30','…and the transaction is still unmatched',              'fo_a','count', $q$select 1 from public.incoming_transactions where reference = 'BK-300' and status = 'unmatched'$q$, 'rows=1'),
      ('T31','Reject it without a reason',                          'fo_a','exec', $q$select public.finance_reject_transaction((select id from public.incoming_transactions where reference = 'BK-300'), ' ')$q$, 'denied'),
      ('T32','Reject it with a reason',                             'fo_a','exec', $q$select public.finance_reject_transaction((select id from public.incoming_transactions where reference = 'BK-300'), 'Not our account')$q$, 'affected=1'),
      ('T33','Rejecting it again',                                  'fo_a','exec', $q$select public.finance_reject_transaction((select id from public.incoming_transactions where reference = 'BK-300'), 'twice')$q$, 'denied'),
      ('T34','A rejected reference can be logged again',            'fo_a','exec', $q$select public.finance_log_transaction('bank', 9999, 'USD', 'BK-300', current_date, null, null, null)$q$, 'affected=1'),
      ('T35','Nobody inserts a transaction directly',               'adm_a','exec', format($q$insert into public.incoming_transactions (school_id, method, amount, currency, reference, transaction_date) values (%L, 'bank', 1, 'USD', 'X', current_date)$q$, a), 'denied'),
      ('T36','Nobody edits a transaction directly',                 'adm_a','exec', $q$update public.incoming_transactions set status = 'matched'$q$, 'denied'),
      ('T37','A transaction''s amount cannot be changed, even by SQL','postgres','exec', $q$update public.incoming_transactions set amount = 1$q$, 'denied'),
      ('T38','A handled transaction cannot be re-opened, even by SQL','postgres','exec', $q$update public.incoming_transactions set status = 'unmatched', payment_id = null where reference = 'OM-100'$q$, 'denied'),
      ('T39','A transaction cannot be deleted, even by SQL',        'postgres','exec', 'delete from public.incoming_transactions', 'denied'),
      ('T40','TRANSACTION_LOGGED / MATCHED / REJECTED were audited', 'postgres','count', format($q$select 1 from public.financial_audit_logs where school_id = %L and action in ('TRANSACTION_LOGGED', 'TRANSACTION_MATCHED', 'TRANSACTION_REJECTED') group by action$q$, a), 'rows=3'),
      ('T41','The reconciliation helper is not callable by browser roles', 'postgres','val', $q$select has_function_privilege('authenticated', 'private.reconcile_and_post(uuid)', 'execute')::text$q$, 'val=false')
    ) as c(id, descr, actor, kind, sql, expected)
    loop
      v_actor := case t.actor when 'adm_a' then adm_a when 'fo_a' then fo_a when 'tch_a' then tch_a when 'stu_a' then stu_a
        when 'stu_a2' then stu_a2 when 'par_a' then par_a when 'par_x' then par_x when 'adm_b' then adm_b when 'sup' then sup end;
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

select * from pg_temp.educore_finance_tests();
