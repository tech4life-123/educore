-- =============================================================================
-- EduCore — Adjustments & refunds tests (migration: finance_adjustments_refunds)
--
-- Same approach as the other suites: throwaway fixtures, every case runs as the
-- real `authenticated`/`anon` role with a forged JWT sub, everything is rolled
-- back. Run as the postgres role:
--   psql "$DATABASE_URL" -f supabase/tests/adjustments.sql
-- Cases run IN ORDER and build on each other.
-- =============================================================================

create or replace function pg_temp.educore_adjustment_tests()
returns table (test_id text, description text, expected text, actual text, result text)
language plpgsql
as $fn$
declare
  v_results jsonb := '[]'::jsonb;
  v_session text := session_user;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  adm_a uuid := gen_random_uuid(); fo_a uuid := gen_random_uuid(); tch_a uuid := gen_random_uuid();
  stu_a uuid := gen_random_uuid(); stu_r uuid := gen_random_uuid(); stu_d uuid := gen_random_uuid(); stu_o uuid := gen_random_uuid();
  par_a uuid := gen_random_uuid(); par_x uuid := gen_random_uuid(); par_r uuid := gen_random_uuid();
  adm_b uuid := gen_random_uuid();
  year_a uuid := gen_random_uuid(); year_b uuid := gen_random_uuid();
  inv1 uuid; inv2 uuid; inv3 uuid; inv_draft uuid; inv_cancel uuid;
  pay3 uuid; pay_pending uuid; t_cert uuid; r_cert uuid;
  adj_disc uuid; adj_schol uuid; adj_waiver uuid; adj_inv2 uuid;
  v_actor uuid; v_n bigint; v_text text; v_actual text; t record;
  rp text := $q$select public.finance_record_payment(%L, %L, %s, %L, %L::public.payment_method, %L, null, current_date, 'Payer', %L, %L)$q$;
begin
  begin
    insert into public.schools (id, name, code, slug, status) values
      (a, 'ADJ Test A', 'ADJTEST-A', 'adj-test-a', 'active'), (b, 'ADJ Test B', 'ADJTEST-B', 'adj-test-b', 'active');
    insert into auth.users (id, instance_id, aud, role, email)
    select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.id || '@adj.test'
    from unnest(array[adm_a, fo_a, tch_a, stu_a, stu_r, stu_d, stu_o, par_a, par_x, par_r, adm_b]) as x(id);
    insert into public.profiles (id, user_id, school_id, first_name, last_name, role, status) values
      (adm_a, adm_a, a, 'T', 'AdmA', 'school_admin', 'active'),
      (fo_a,  fo_a,  a, 'T', 'FinA', 'finance_officer', 'active'),
      (tch_a, tch_a, a, 'T', 'TchA', 'teacher', 'active'),
      (stu_a, stu_a, a, 'T', 'StuA', 'student', 'active'),
      (stu_r, stu_r, a, 'T', 'StuR', 'student', 'active'),
      (stu_d, stu_d, a, 'T', 'StuD', 'student', 'active'),
      (stu_o, stu_o, a, 'T', 'StuO', 'student', 'active'),
      (par_a, par_a, a, 'T', 'ParA', 'parent', 'active'),
      (par_r, par_r, a, 'T', 'ParR', 'parent', 'active'),
      (par_x, par_x, a, 'T', 'ParX', 'parent', 'active'),
      (adm_b, adm_b, b, 'T', 'AdmB', 'school_admin', 'active');
    insert into public.guardian_links (school_id, parent_id, student_id) values (a, par_a, stu_a), (a, par_r, stu_r);
    insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current) values
      (year_a, a, 'AY A', date '2026-01-01', date '2026-12-31', true), (year_b, b, 'AY B', date '2026-01-01', date '2026-12-31', true);

    -- ---- setup, through the real functions, as real users -----------------
    perform set_config('request.jwt.claims', json_build_object('sub', adm_a, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    perform public.doc_seed_types();
    select id into t_cert from public.document_types where school_id = a and code = 'certificate';
    perform public.doc_save_type(t_cert, null, 'Certificate', null, 10, 'USD', true, false, false, false, false, true);

    perform set_config('request.jwt.claims', json_build_object('sub', fo_a, 'role', 'authenticated')::text, true);
    inv1 := public.finance_create_invoice(stu_a, par_a, year_a, null, 'USD', current_date + 30, 'Tuition', '[{"fee_type":"tuition","amount":100}]'::jsonb);
    perform public.finance_issue_invoice(inv1);
    inv2 := public.finance_create_invoice(stu_a, par_a, year_a, null, 'USD', current_date + 30, 'Books', '[{"fee_type":"other","amount":100}]'::jsonb);
    perform public.finance_issue_invoice(inv2);
    inv_draft := public.finance_create_invoice(stu_a, par_a, year_a, null, 'USD', current_date + 30, 'Draft', '[{"fee_type":"other","amount":40}]'::jsonb);
    inv_cancel := public.finance_create_invoice(stu_a, par_a, year_a, null, 'USD', current_date + 30, 'Cancelled', '[{"fee_type":"other","amount":40}]'::jsonb);
    perform public.finance_issue_invoice(inv_cancel);
    perform public.finance_cancel_invoice(inv_cancel, 'setup');
    inv3 := public.finance_create_invoice(stu_r, par_r, year_a, null, 'USD', current_date + 30, 'Tuition R', '[{"fee_type":"tuition","amount":100}]'::jsonb);
    perform public.finance_issue_invoice(inv3);
    perform public.finance_record_payment(stu_r, inv3, 100, 'USD', 'bank'::public.payment_method, 'R-PAY-1', null, current_date, 'Payer', null, 'idem-r-000001');
    select id into pay3 from public.payments where reference = 'R-PAY-1';
    perform public.finance_confirm_payment(pay3);
    perform public.finance_record_payment(stu_o, null, 5, 'USD', 'cash'::public.payment_method, 'O-PAY-1', null, current_date, 'Payer', 'Test cash', 'idem-o-000001');
    select id into pay_pending from public.payments where reference = 'O-PAY-1';

    -- a document fee for stu_d (requested by the student)
    perform set_config('request.jwt.claims', json_build_object('sub', stu_d, 'role', 'authenticated')::text, true);
    r_cert := public.doc_request(stu_d, t_cert, null);
    perform set_config('role', v_session, true);
    perform set_config('request.jwt.claims', '', true);

    for t in select * from (values
      -- ===================== applying adjustments ======================
      ('A01','School admin gives a $20 discount on a $100 invoice',  'adm_a','exec', format($q$select public.finance_apply_adjustment(%L, 'discount', 20, 'Sibling discount')$q$, inv1), 'affected=1'),
      ('A02','The invoice now owes $80',                              'postgres','val', format('select balance_due::text from public.invoice_balances where invoice_id = %L', inv1), 'val=80.00'),
      ('A03','…and still shows the full $100 total and $20 discount', 'postgres','val', format($q$select total_amount::text || ' ' || adjustments_total::text from public.invoice_balances where invoice_id = %L$q$, inv1), 'val=100.00 20.00'),
      ('A04','Finance officer cannot grant an adjustment',            'fo_a','exec', format($q$select public.finance_apply_adjustment(%L, 'discount', 5, 'Nice')$q$, inv1), 'denied'),
      ('A05','Teacher cannot',                                        'tch_a','exec', format($q$select public.finance_apply_adjustment(%L, 'discount', 5, 'Nice')$q$, inv1), 'denied'),
      ('A06','A student cannot discount their own fee',               'stu_a','exec', format($q$select public.finance_apply_adjustment(%L, 'waiver', 5, 'Please')$q$, inv1), 'denied'),
      ('A07','A parent cannot',                                       'par_a','exec', format($q$select public.finance_apply_adjustment(%L, 'waiver', 5, 'Please')$q$, inv1), 'denied'),
      ('A08','Anonymous cannot',                                      'anon','exec', format($q$select public.finance_apply_adjustment(%L, 'waiver', 5, 'Please')$q$, inv1), 'denied'),
      ('A09','Another school''s admin cannot (invoice not found)',    'adm_b','exec', format($q$select public.finance_apply_adjustment(%L, 'waiver', 5, 'Please')$q$, inv1), 'denied'),
      ('A10','More than the invoice owes is refused',                 'adm_a','exec', format($q$select public.finance_apply_adjustment(%L, 'discount', 80.01, 'Too much')$q$, inv1), 'denied'),
      ('A11','Zero is refused',                                       'adm_a','exec', format($q$select public.finance_apply_adjustment(%L, 'discount', 0, 'Zero')$q$, inv1), 'denied'),
      ('A12','A negative amount is refused',                          'adm_a','exec', format($q$select public.finance_apply_adjustment(%L, 'discount', -5, 'Neg')$q$, inv1), 'denied'),
      ('A13','Three decimals are refused',                            'adm_a','exec', format($q$select public.finance_apply_adjustment(%L, 'discount', 1.005, 'Dec')$q$, inv1), 'denied'),
      ('A14','An unknown kind is refused',                            'adm_a','exec', format($q$select public.finance_apply_adjustment(%L, 'gift', 5, 'Kind')$q$, inv1), 'denied'),
      ('A15','A missing reason is refused',                           'adm_a','exec', format($q$select public.finance_apply_adjustment(%L, 'discount', 5, 'ab')$q$, inv1), 'denied'),
      ('A16','A draft invoice cannot be adjusted',                    'adm_a','exec', format($q$select public.finance_apply_adjustment(%L, 'discount', 5, 'Draft')$q$, inv_draft), 'denied'),
      ('A17','A cancelled invoice cannot be adjusted',                'adm_a','exec', format($q$select public.finance_apply_adjustment(%L, 'discount', 5, 'Gone')$q$, inv_cancel), 'denied'),
      ('A18','An unknown invoice is refused',                         'adm_a','exec', format($q$select public.finance_apply_adjustment(%L, 'discount', 5, 'None')$q$, gen_random_uuid()), 'denied'),

      -- ===================== ledger & balances =========================
      ('A19','A $20 CREDIT adjustment entry was posted',              'postgres','val', format($q$select direction::text || ' ' || amount::text from public.student_account_entries where invoice_id = %L and entry_type = 'adjustment'$q$, inv1), 'val=credit 20.00'),
      ('A20','Student balance: owes 180 (80 + 100), adjustments 20, paid 0','postgres','val', format($q$select balance::text || ' ' || total_adjustments::text || ' ' || total_paid::text || ' ' || total_charges::text from public.student_balances where student_id = %L$q$, stu_a), 'val=180.00 20.00 0 200.00'),
      ('A21','A scholarship of $30',                                  'adm_a','exec', format($q$select public.finance_apply_adjustment(%L, 'scholarship', 30, 'Principal scholarship')$q$, inv1), 'affected=1'),
      ('A22','A waiver of the remaining $50',                         'adm_a','exec', format($q$select public.finance_apply_adjustment(%L, 'waiver', 50, 'Hardship waiver')$q$, inv1), 'affected=1'),
      ('A23','The invoice now shows as paid, owing nothing',          'postgres','val', format($q$select balance_due::text || ' ' || display_status from public.invoice_balances where invoice_id = %L$q$, inv1), 'val=0.00 paid'),
      ('A24','Nothing further can be adjusted on it',                 'adm_a','exec', format($q$select public.finance_apply_adjustment(%L, 'discount', 1, 'More')$q$, inv1), 'denied'),
      ('A25','Three adjustments exist for the invoice',               'postgres','count', format('select 1 from public.invoice_adjustments where invoice_id = %L', inv1), 'rows=3'),

      -- ===================== who can read them =========================
      ('A26','The student sees their own adjustments',                'stu_a','count', 'select 1 from public.invoice_adjustments', 'rows=3'),
      ('A27','The linked parent sees them',                           'par_a','count', 'select 1 from public.invoice_adjustments', 'rows=3'),
      ('A28','An unlinked parent sees none',                          'par_x','count', 'select 1 from public.invoice_adjustments', 'rows=0'),
      ('A29','Another student sees none',                             'stu_o','count', 'select 1 from public.invoice_adjustments', 'rows=0'),
      ('A30','A teacher sees none',                                   'tch_a','count', 'select 1 from public.invoice_adjustments', 'rows=0'),
      ('A31','Finance officer sees all 3',                            'fo_a','count', 'select 1 from public.invoice_adjustments', 'rows=3'),
      ('A32','Other school''s admin sees none',                       'adm_b','count', 'select 1 from public.invoice_adjustments', 'rows=0'),
      ('A33','Anonymous cannot read adjustments',                     'anon','exec', 'select 1 from public.invoice_adjustments', 'denied'),
      ('A34','The student''s own invoice balance shows the waiver',   'stu_a','val', format('select balance_due::text from public.invoice_balances where invoice_id = %L', inv1), 'val=0.00'),

      -- ===================== tables are closed to direct writes ========
      ('A35','Direct insert into adjustments is closed',              'adm_a','exec', format($q$insert into public.invoice_adjustments (school_id, invoice_id, student_id, kind, amount, currency, reason, ledger_entry_id) select school_id, invoice_id, student_id, 'waiver', 1, 'USD', 'sneaky', ledger_entry_id from public.invoice_adjustments where invoice_id = %L limit 1$q$, inv1), 'denied'),
      ('A36','Direct update of adjustments is closed',                'adm_a','exec', format($q$update public.invoice_adjustments set amount = 1 where invoice_id = %L$q$, inv1), 'denied'),
      ('A37','An adjustment''s amount cannot be rewritten (even by the owner)','postgres','exec', format($q$update public.invoice_adjustments set amount = 1 where invoice_id = %L$q$, inv1), 'denied'),
      ('A38','An adjustment cannot be deleted',                       'postgres','exec', format($q$delete from public.invoice_adjustments where invoice_id = %L$q$, inv1), 'denied'),

      -- ===================== voiding ===================================
      ('A39','Finance officer cannot void',                           'fo_a','exec', format($q$select public.finance_void_adjustment((select id from public.invoice_adjustments where invoice_id = %L and kind = 'waiver'), 'Mistake')$q$, inv1), 'denied'),
      ('A40','Voiding needs a reason',                                'adm_a','exec', format($q$select public.finance_void_adjustment((select id from public.invoice_adjustments where invoice_id = %L and kind = 'waiver'), '')$q$, inv1), 'denied'),
      ('A41','Another school''s admin cannot void',                   'adm_b','exec', format($q$select public.finance_void_adjustment((select id from public.invoice_adjustments where invoice_id = %L and kind = 'waiver'), 'Mistake')$q$, inv1), 'denied'),
      ('A42','School admin voids the $50 waiver',                     'adm_a','exec', format($q$select public.finance_void_adjustment((select id from public.invoice_adjustments where invoice_id = %L and kind = 'waiver'), 'Granted in error')$q$, inv1), 'affected=1'),
      ('A43','The invoice owes $50 again',                            'postgres','val', format($q$select balance_due::text || ' ' || adjustments_total::text from public.invoice_balances where invoice_id = %L$q$, inv1), 'val=50.00 50.00'),
      ('A44','A reversal entry points back at the adjustment',        'postgres','val', format($q$select r.direction::text || ' ' || r.amount::text || ' ' || o.entry_type::text from public.student_account_entries r join public.student_account_entries o on o.id = r.reverses_entry_id where r.invoice_id = %L and r.entry_type = 'reversal'$q$, inv1), 'val=debit 50.00 adjustment'),
      ('A45','Voiding does not count as a payment reversal (total_paid stays 0)','postgres','val', format($q$select total_paid::text || ' ' || total_adjustments::text from public.student_balances where student_id = %L$q$, stu_a), 'val=0 50.00'),
      ('A46','Voiding twice is refused',                              'adm_a','exec', format($q$select public.finance_void_adjustment((select id from public.invoice_adjustments where invoice_id = %L and kind = 'waiver'), 'Again')$q$, inv1), 'denied'),
      ('A47','A voided adjustment cannot be edited',                  'postgres','exec', format($q$update public.invoice_adjustments set reason = 'edited' where invoice_id = %L and kind = 'waiver'$q$, inv1), 'denied'),
      ('A48','The voided row keeps who/why',                          'postgres','val', format($q$select status || ' ' || voided_reason from public.invoice_adjustments where invoice_id = %L and kind = 'waiver'$q$, inv1), 'val=voided Granted in error'),

      -- ===================== cancelling an invoice =====================
      ('A49','A $10 discount on the second invoice',                  'adm_a','exec', format($q$select public.finance_apply_adjustment(%L, 'discount', 10, 'Early bird')$q$, inv2), 'affected=1'),
      ('A50','Finance cancels that invoice',                          'fo_a','exec', format($q$select public.finance_cancel_invoice(%L, 'Wrong student')$q$, inv2), 'affected=1'),
      ('A51','Its discount was voided with it',                       'postgres','val', format($q$select string_agg(status, ',') from public.invoice_adjustments where invoice_id = %L$q$, inv2), 'val=voided'),
      ('A52','The invoice nets to nothing in the ledger',             'postgres','val', format($q$select (coalesce(sum(amount) filter (where direction = 'debit'), 0) - coalesce(sum(amount) filter (where direction = 'credit'), 0))::text from public.student_account_entries where invoice_id = %L$q$, inv2), 'val=0.00'),

      -- ===================== waiving a document fee ====================
      ('A53','The certificate request waits for its $10 fee',         'postgres','val', format('select status::text from public.document_requests where id = %L', r_cert), 'val=payment_pending'),
      ('A54','Admin waives the whole document fee',                   'adm_a','exec', format($q$select public.finance_apply_adjustment((select invoice_id from public.document_requests where id = %L), 'waiver', 10, 'Staff child')$q$, r_cert), 'affected=1'),
      ('A55','…so the request moves on without a payment',            'postgres','val', format('select status::text from public.document_requests where id = %L', r_cert), 'val=approved'),
      ('A56','Voiding that waiver puts it back to awaiting payment',  'adm_a','exec', format($q$select public.finance_void_adjustment((select a.id from public.invoice_adjustments a join public.document_requests r on r.invoice_id = a.invoice_id where r.id = %L), 'Not eligible')$q$, r_cert), 'affected=1'),
      ('A57','…and the request is waiting again',                     'postgres','val', format('select status::text from public.document_requests where id = %L', r_cert), 'val=payment_pending'),

      -- ===================== refunds ===================================
      ('R01','Finance officer cannot refund',                         'fo_a','exec', format($q$select public.finance_refund_payment(%L, 10, 'cash', null, 'Overpaid', null)$q$, pay3), 'denied'),
      ('R02','A parent cannot refund',                                'par_r','exec', format($q$select public.finance_refund_payment(%L, 10, 'cash', null, 'Please', null)$q$, pay3), 'denied'),
      ('R03','Anonymous cannot refund',                               'anon','exec', format($q$select public.finance_refund_payment(%L, 10, 'cash', null, 'Please', null)$q$, pay3), 'denied'),
      ('R04','Another school''s admin cannot refund',                 'adm_b','exec', format($q$select public.finance_refund_payment(%L, 10, 'cash', null, 'Please', null)$q$, pay3), 'denied'),
      ('R05','A pending payment cannot be refunded',                  'adm_a','exec', format($q$select public.finance_refund_payment(%L, 1, 'cash', null, 'Not posted', null)$q$, pay_pending), 'denied'),
      ('R06','Refund needs a reason',                                 'adm_a','exec', format($q$select public.finance_refund_payment(%L, 10, 'cash', null, ' ', null)$q$, pay3), 'denied'),
      ('R07','Refund of zero is refused',                             'adm_a','exec', format($q$select public.finance_refund_payment(%L, 0, 'cash', null, 'Zero', null)$q$, pay3), 'denied'),
      ('R08','A negative refund is refused',                          'adm_a','exec', format($q$select public.finance_refund_payment(%L, -3, 'cash', null, 'Negative', null)$q$, pay3), 'denied'),
      ('R09','A refund dated in the future is refused',               'adm_a','exec', format($q$select public.finance_refund_payment(%L, 10, 'cash', null, 'Future', current_date + 1)$q$, pay3), 'denied'),
      ('R10','More than was paid is refused',                         'adm_a','exec', format($q$select public.finance_refund_payment(%L, 100.01, 'cash', null, 'Too much', null)$q$, pay3), 'denied'),
      ('R11','Admin refunds $30 in cash',                             'adm_a','exec', format($q$select public.finance_refund_payment(%L, 30, 'cash', 'CASH-OUT-1', 'Overcharged', null)$q$, pay3), 'affected=1'),
      ('R12','The payment stays posted after a partial refund',       'postgres','val', format('select status::text from public.payments where id = %L', pay3), 'val=posted'),
      ('R13','Invoice: paid 70 net, refunded 30, owes 30',            'postgres','val', format($q$select amount_paid::text || ' ' || amount_refunded::text || ' ' || balance_due::text || ' ' || display_status from public.invoice_balances where invoice_id = %L$q$, inv3), 'val=70.00 30.00 30.00 partially_paid'),
      ('R14','A DEBIT refund entry was posted against the payment',   'postgres','val', format($q$select direction::text || ' ' || amount::text from public.student_account_entries where payment_id = %L and entry_type = 'refund'$q$, pay3), 'val=debit 30.00'),
      ('R15','Student account: paid 100, refunded 30, balance 30',    'postgres','val', format($q$select total_paid::text || ' ' || total_refunded::text || ' ' || balance::text from public.student_balances where student_id = %L$q$, stu_r), 'val=100.00 30.00 30.00'),
      ('R16','Cannot refund more than what is left (70.01)',          'adm_a','exec', format($q$select public.finance_refund_payment(%L, 70.01, 'cash', null, 'Too much', null)$q$, pay3), 'denied'),
      ('R17','The family sees the refund',                            'par_r','count', 'select 1 from public.payment_refunds', 'rows=1'),
      ('R18','…and the student',                                      'stu_r','count', 'select 1 from public.payment_refunds', 'rows=1'),
      ('R19','Another family sees none',                              'par_a','count', 'select 1 from public.payment_refunds', 'rows=0'),
      ('R20','A teacher sees none',                                   'tch_a','count', 'select 1 from public.payment_refunds', 'rows=0'),
      ('R21','Finance officer sees it',                               'fo_a','count', 'select 1 from public.payment_refunds', 'rows=1'),
      ('R22','Direct insert into refunds is closed',                  'adm_a','exec', format($q$insert into public.payment_refunds (school_id, payment_id, student_id, amount, currency, method, reason, ledger_entry_id) select school_id, payment_id, student_id, 1, 'USD', 'cash', 'sneaky', ledger_entry_id from public.payment_refunds limit 1$q$), 'denied'),
      ('R23','A refund cannot be edited (even by the owner)',         'postgres','exec', 'update public.payment_refunds set amount = 1', 'denied'),
      ('R24','A refund cannot be deleted',                            'postgres','exec', 'delete from public.payment_refunds', 'denied'),
      ('R25','Refunding the remaining $70 by bank',                   'adm_a','exec', format($q$select public.finance_refund_payment(%L, 70, 'bank', 'BANK-OUT-1', 'Student withdrew', null)$q$, pay3), 'affected=1'),
      ('R26','The fully refunded payment is now "refunded"',          'postgres','val', format('select status::text from public.payments where id = %L', pay3), 'val=refunded'),
      ('R27','Invoice: paid 0, refunded 100, owes the full 100 again','postgres','val', format($q$select amount_paid::text || ' ' || amount_refunded::text || ' ' || balance_due::text from public.invoice_balances where invoice_id = %L$q$, inv3), 'val=0 100.00 100.00'),
      ('R28','Nothing more can be refunded',                         'adm_a','exec', format($q$select public.finance_refund_payment(%L, 1, 'cash', null, 'Again', null)$q$, pay3), 'denied'),
      ('R29','The receipt no longer verifies as valid',               'postgres','val', format($q$select is_valid::text from public.verify_receipt((select verification_token from public.receipts where payment_id = %L))$q$, pay3), 'val=false'),
      ('R30','The family can still see the refunded payment',         'par_r','count', 'select 1 from public.payments', 'rows=1'),
      ('R31','A fully refunded payment cannot be reversed',           'fo_a','exec', format($q$select public.finance_reverse_payment(%L, 'Try')$q$, pay3), 'denied'),

      -- ===================== audit & hygiene ===========================
      ('X01','Adjustments, voids and refunds were audited',           'postgres','count', $q$select 1 from public.financial_audit_logs where action in ('ADJUSTMENT_APPLIED', 'ADJUSTMENT_VOIDED', 'REFUND_ISSUED')$q$, 'rows>=10'),
      ('X02','The full refund also audited the payment status change','postgres','count', format($q$select 1 from public.financial_audit_logs where action = 'PAYMENT_REFUNDED' and entity_id = %L$q$, pay3), 'rows=1'),
      ('X03','Internal helpers are not callable by browser roles',    'postgres','val', $q$select (has_function_privilege('authenticated', 'private.void_adjustment(uuid, text)', 'execute') or has_function_privilege('authenticated', 'private.void_invoice_adjustments(uuid, uuid, text)', 'execute') or has_function_privilege('authenticated', 'private.doc_advance_for_invoice(uuid)', 'execute') or has_function_privilege('anon', 'public.finance_apply_adjustment(uuid, text, numeric, text)', 'execute'))::text$q$, 'val=false'),
      ('X04','Direct ledger writes are still closed',                 'adm_a','exec', format($q$insert into public.student_account_entries (school_id, account_id, student_id, currency, direction, entry_type, amount, description) select school_id, account_id, student_id, currency, 'credit', 'adjustment', 5, 'sneaky' from public.student_account_entries limit 1$q$), 'denied')
    ) as c(id, descr, actor, kind, sql, expected)
    loop
      v_actor := case t.actor when 'adm_a' then adm_a when 'fo_a' then fo_a when 'tch_a' then tch_a
        when 'stu_a' then stu_a when 'stu_r' then stu_r when 'stu_d' then stu_d when 'stu_o' then stu_o
        when 'par_a' then par_a when 'par_x' then par_x when 'par_r' then par_r when 'adm_b' then adm_b end;
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

select * from pg_temp.educore_adjustment_tests();
