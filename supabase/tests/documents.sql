-- =============================================================================
-- EduCore — Document services tests (migrations: admissions_officer_role,
-- document_services)
--
-- Same approach as the other suites: throwaway fixtures, every case runs as the
-- real `authenticated`/`anon` role with a forged JWT sub, everything is rolled
-- back. Run as the postgres role:
--   psql "$DATABASE_URL" -f supabase/tests/documents.sql
-- Cases run IN ORDER and build on each other.
-- =============================================================================

create or replace function pg_temp.educore_document_tests()
returns table (test_id text, description text, expected text, actual text, result text)
language plpgsql
as $fn$
declare
  v_results jsonb := '[]'::jsonb;
  v_session text := session_user;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  adm_a uuid := gen_random_uuid(); fo_a uuid := gen_random_uuid(); adms_a uuid := gen_random_uuid(); tch_a uuid := gen_random_uuid();
  stu_a uuid := gen_random_uuid(); stu_c uuid := gen_random_uuid(); stu_d uuid := gen_random_uuid(); stu_e uuid := gen_random_uuid();
  par_a uuid := gen_random_uuid(); par_x uuid := gen_random_uuid();
  adm_b uuid := gen_random_uuid(); stu_b uuid := gen_random_uuid(); sup uuid := gen_random_uuid();
  year_a uuid := gen_random_uuid(); term_a uuid := gen_random_uuid(); year_b uuid := gen_random_uuid();
  grade_a uuid := gen_random_uuid(); class_a uuid := gen_random_uuid();
  t_adm uuid; t_tr uuid; t_cert uuid; t_clr uuid; t_card uuid; t_rtr uuid;
  inv_owe uuid;
  r_adm uuid; r_tr uuid; r_cert uuid; r_clr uuid; r_rev uuid; r_can uuid;
  v_actor uuid; v_n bigint; v_text text; v_actual text; t record;
  v_year int := extract(year from current_date)::int;
  rp text := $q$select public.finance_record_payment(%L, %L, %s, %L, %L::public.payment_method, %L, null, current_date, 'Payer', %L, %L)$q$;
begin
  begin
    insert into public.schools (id, name, code, slug, status) values
      (a, 'DOC Test A', 'DOCTEST-A', 'doc-test-a', 'active'), (b, 'DOC Test B', 'DOCTEST-B', 'doc-test-b', 'active');
    insert into auth.users (id, instance_id, aud, role, email)
    select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.id || '@doc.test'
    from unnest(array[adm_a, fo_a, adms_a, tch_a, stu_a, stu_c, stu_d, stu_e, par_a, par_x, adm_b, stu_b, sup]) as x(id);
    insert into public.profiles (id, user_id, school_id, first_name, last_name, role, status) values
      (adm_a, adm_a, a, 'T', 'AdmA', 'school_admin', 'active'),
      (fo_a,  fo_a,  a, 'T', 'FinA', 'finance_officer', 'active'),
      (adms_a, adms_a, a, 'T', 'AdmissionsA', 'admissions_officer', 'active'),
      (tch_a, tch_a, a, 'T', 'TchA', 'teacher', 'active'),
      (stu_a, stu_a, a, 'T', 'StuA', 'student', 'active'),
      (stu_c, stu_c, a, 'T', 'StuC', 'student', 'active'),
      (stu_d, stu_d, a, 'T', 'StuD', 'student', 'active'),
      (stu_e, stu_e, a, 'T', 'StuE', 'student', 'active'),
      (par_a, par_a, a, 'T', 'ParA', 'parent', 'active'),
      (par_x, par_x, a, 'T', 'ParX', 'parent', 'active'),
      (adm_b, adm_b, b, 'T', 'AdmB', 'school_admin', 'active'),
      (stu_b, stu_b, b, 'T', 'StuB', 'student', 'active'),
      (sup, sup, null, 'T', 'Sup', 'super_admin', 'active');
    insert into public.student_profiles (school_id, profile_id, admission_number) values
      (a, stu_a, 'ADM-001'), (a, stu_c, 'ADM-003');
    insert into public.guardian_links (school_id, parent_id, student_id) values (a, par_a, stu_a);
    insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current) values
      (year_a, a, 'DY A', date '2026-01-01', date '2026-12-31', true), (year_b, b, 'DY B', date '2026-01-01', date '2026-12-31', true);
    insert into public.academic_terms (id, school_id, academic_year_id, name, sequence) values (term_a, a, year_a, 'T1', 1);
    select id into grade_a from public.grade_levels where school_id = a order by sequence limit 1;
    insert into public.classes (id, school_id, academic_year_id, grade_level_id, name) values (class_a, a, year_a, grade_a, 'Class 1');
    insert into public.enrollments (school_id, academic_year_id, class_id, student_id) values (a, year_a, class_a, stu_a);
    insert into public.report_cards (school_id, student_id, class_id, academic_year_id, term_id, data, average, class_size)
    values (a, stu_a, class_a, year_a, term_a, '{"subjects": []}'::jsonb, 77.5, 20);

    -- ---- setup, through the real functions, as real users -----------------
    perform set_config('request.jwt.claims', json_build_object('sub', adm_a, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    perform public.doc_seed_types();
    select id into t_adm  from public.document_types where school_id = a and code = 'admission_letter';
    select id into t_tr   from public.document_types where school_id = a and code = 'transcript';
    select id into t_rtr  from public.document_types where school_id = a and code = 'replacement_transcript';
    select id into t_cert from public.document_types where school_id = a and code = 'certificate';
    select id into t_clr  from public.document_types where school_id = a and code = 'clearance';
    select id into t_card from public.document_types where school_id = a and code = 'id_card';
    -- Admission letter: $50 fee required, admissions-handled, no override.
    perform public.doc_save_type(t_adm, null, 'Admission letter', null, 50, 'USD', true, false, false, false, true, true);
    -- Transcript: $10 fee AND financial clearance; the admin may override.
    perform public.doc_save_type(t_tr, null, 'Official transcript', null, 10, 'USD', true, true, false, true, false, true);
    -- Certificate: needs approval, fee set but not required.
    perform public.doc_save_type(t_cert, null, 'Certificate', null, 5, 'USD', false, false, true, false, false, true);
    -- Clearance letter: no fee, requires clearance.
    perform public.doc_save_type(t_clr, null, 'Clearance letter', null, 0, null, false, true, false, false, false, true);
    -- ID card switched off.
    perform public.doc_save_type(t_card, null, 'Student ID card', null, 0, null, false, false, false, false, false, false);

    -- stu_a owes tuition (so is NOT financially cleared).
    inv_owe := public.finance_create_invoice(stu_a, par_a, year_a, null, 'USD', current_date + 30, 'Tuition',
      '[{"fee_type":"tuition","amount":100}]'::jsonb);
    perform public.finance_issue_invoice(inv_owe);

    -- requests, as the people who would make them
    perform set_config('request.jwt.claims', json_build_object('sub', stu_c, 'role', 'authenticated')::text, true);
    r_adm  := public.doc_request(stu_c, t_adm, 'Please');
    r_cert := public.doc_request(stu_c, t_cert, null);
    perform set_config('request.jwt.claims', json_build_object('sub', par_a, 'role', 'authenticated')::text, true);
    r_tr   := public.doc_request(stu_a, t_tr, null);
    perform set_config('request.jwt.claims', json_build_object('sub', stu_a, 'role', 'authenticated')::text, true);
    r_clr  := public.doc_request(stu_a, t_clr, null);
    perform set_config('request.jwt.claims', json_build_object('sub', stu_d, 'role', 'authenticated')::text, true);
    r_rev  := public.doc_request(stu_d, t_adm, null);
    perform set_config('request.jwt.claims', json_build_object('sub', stu_e, 'role', 'authenticated')::text, true);
    r_can  := public.doc_request(stu_e, t_adm, null);
    perform set_config('role', v_session, true);
    perform set_config('request.jwt.claims', '', true);

    for t in select * from (values
      -- ===================== configuration ============================
      ('D01','Seeding created the 7 standard document types',      'adm_a','count', 'select 1 from public.document_types', 'rows=7'),
      ('D02','Seeding again adds nothing (idempotent)',            'adm_a','val', 'select public.doc_seed_types()::text', 'val=0'),
      ('D03','Other school''s admin sees none of our types',       'adm_b','count', 'select 1 from public.document_types', 'rows=0'),
      ('D04','A student can read the catalogue (to request)',      'stu_c','count', 'select 1 from public.document_types', 'rows=7'),
      ('D05','Finance officer cannot save a document type',        'fo_a','exec', format($q$select public.doc_save_type(%L, null, 'X', null, 1, 'USD', false, false, false, false, false, true)$q$, t_cert), 'denied'),
      ('D06','Admissions officer cannot save a document type',     'adms_a','exec', format($q$select public.doc_save_type(%L, null, 'X', null, 1, 'USD', false, false, false, false, false, true)$q$, t_cert), 'denied'),
      ('D07','Student cannot seed types',                          'stu_c','exec', 'select public.doc_seed_types()', 'denied'),
      ('D08','"Payment required" with a zero fee is refused',      'adm_a','exec', format($q$select public.doc_save_type(%L, null, 'Certificate', null, 0, 'USD', true, false, false, false, false, true)$q$, t_cert), 'denied'),
      ('D09','Negative fee is refused',                            'adm_a','exec', format($q$select public.doc_save_type(%L, null, 'Certificate', null, -1, 'USD', false, false, false, false, false, true)$q$, t_cert), 'denied'),
      ('D10','Direct insert into document_types is closed',        'adm_a','exec', format($q$insert into public.document_types (school_id, code, name) values (%L, 'sneaky', 'Sneaky')$q$, a), 'denied'),
      ('D11','School admin can add a custom document type',        'adm_a','exec', $q$select public.doc_save_type(null, 'enrolment_proof', 'Proof of enrolment', null, 2, 'USD', false, false, false, false, false, true)$q$, 'affected=1'),
      ('D12','Bad document code is refused',                       'adm_a','exec', $q$select public.doc_save_type(null, 'Bad Code!', 'Bad', null, 2, 'USD', false, false, false, false, false, true)$q$, 'denied'),

      -- ===================== requests ================================
      ('D13','Fee-required request waits for payment',             'postgres','val', format('select status::text from public.document_requests where id = %L', r_adm), 'val=payment_pending'),
      ('D14','…and an issued $50 invoice was created on the ledger','postgres','val', format($q$select i.status::text || ' ' || (select sum(amount) from public.invoice_items where invoice_id = i.id)::text from public.invoices i join public.document_requests r on r.invoice_id = i.id where r.id = %L$q$, r_adm), 'val=issued 50.00'),
      ('D15','Approval-required request goes to review',           'postgres','val', format('select status::text from public.document_requests where id = %L', r_cert), 'val=under_review'),
      ('D16','…without creating an invoice (fee not required)',    'postgres','val', format('select (invoice_id is null)::text from public.document_requests where id = %L', r_cert), 'val=true'),
      ('D17','Request with no extra rules is ready (approved)',    'postgres','val', format('select status::text from public.document_requests where id = %L', r_clr), 'val=approved'),
      ('D18','A parent''s request for a linked child works',       'postgres','val', format('select status::text from public.document_requests where id = %L', r_tr), 'val=payment_pending'),
      ('D19','A second open request for the same document',        'stu_c','exec', format('select public.doc_request(%L, %L, null)', stu_c, t_cert), 'denied'),
      ('D20','Requesting a switched-off document',                 'stu_c','exec', format('select public.doc_request(%L, %L, null)', stu_c, t_card), 'denied'),
      ('D21','Student requests for a different student',           'stu_c','exec', format('select public.doc_request(%L, %L, null)', stu_a, t_clr), 'denied'),
      ('D22','Unlinked parent requests for someone''s child',      'par_x','exec', format('select public.doc_request(%L, %L, null)', stu_a, t_cert), 'denied'),
      ('D23','Teacher requests a document',                        'tch_a','exec', format('select public.doc_request(%L, %L, null)', stu_a, t_cert), 'denied'),
      ('D24','Anonymous requests a document',                      'anon','exec', format('select public.doc_request(%L, %L, null)', stu_a, t_cert), 'denied'),
      ('D25','Super admin requests a document',                    'sup','exec', format('select public.doc_request(%L, %L, null)', stu_a, t_cert), 'denied'),
      ('D26','Student sees only their own 2 requests',             'stu_c','count', 'select 1 from public.document_requests', 'rows=2'),
      ('D27','Linked parent sees the child''s 2 requests',         'par_a','count', 'select 1 from public.document_requests', 'rows=2'),
      ('D28','Unlinked parent sees none',                          'par_x','count', 'select 1 from public.document_requests', 'rows=0'),
      ('D29','Teacher sees none',                                  'tch_a','count', 'select 1 from public.document_requests', 'rows=0'),
      ('D30','Finance officer sees all 6',                         'fo_a','count', 'select 1 from public.document_requests', 'rows=6'),
      ('D31','Admissions officer sees only the 3 admission letters','adms_a','count', 'select 1 from public.document_requests', 'rows=3'),
      ('D32','Other school''s admin sees none',                    'adm_b','count', 'select 1 from public.document_requests', 'rows=0'),
      ('D33','Direct insert into document_requests is closed',     'adm_a','exec', format($q$insert into public.document_requests (school_id, student_id, document_type_id, requested_by) values (%L, %L, %L, %L)$q$, a, stu_a, t_clr, adm_a), 'denied'),
      ('D34','Direct status edit is closed',                       'adm_a','exec', format($q$update public.document_requests set status = 'generated' where id = %L$q$, r_adm), 'denied'),

      -- ===================== clearance ================================
      ('D35','A student who owes money is not cleared',            'par_a','val', format($q$select (public.student_clearance(%L) ->> 'cleared')$q$, stu_a), 'val=false'),
      ('D36','Any unpaid fee counts as owed (stu_c''s open $50)',   'stu_c','val', format($q$select (public.student_clearance(%L) ->> 'cleared')$q$, stu_c), 'val=false'),
      ('D37','A student cannot read another student''s clearance', 'stu_c','exec', format('select public.student_clearance(%L)', stu_a), 'denied'),
      ('D38','Finance staff can read a student''s clearance',      'fo_a','val', format($q$select (public.student_clearance(%L) ->> 'cleared')$q$, stu_a), 'val=false'),
      ('D39','Anonymous cannot read clearance',                    'anon','exec', format('select public.student_clearance(%L)', stu_a), 'denied'),

      -- ===================== generation gates =========================
      ('D40','Generating an unpaid admission letter (admissions officer)', 'adms_a','exec', format('select public.doc_generate(%L, null)', r_adm), 'denied'),
      ('D41','Not even the admin may bypass a type that forbids override','adm_a','exec', format($q$select public.doc_generate(%L, 'because')$q$, r_adm), 'denied'),
      ('D42','Admissions officer cannot touch a transcript',       'adms_a','exec', format('select public.doc_generate(%L, null)', r_tr), 'denied'),
      ('D43','Teacher cannot generate',                            'tch_a','exec', format('select public.doc_generate(%L, null)', r_clr), 'denied'),
      ('D44','Student cannot generate',                            'stu_a','exec', format('select public.doc_generate(%L, null)', r_clr), 'denied'),
      ('D45','Other school''s admin cannot generate',              'adm_b','exec', format('select public.doc_generate(%L, null)', r_clr), 'denied'),

      -- ===================== paying the document fee ==================
      ('D46','Finance records the $50 admission fee',              'fo_a','exec', format(rp, stu_c, (select invoice_id from public.document_requests where id = r_adm), '50', 'USD', 'bank', 'ADM-PAY-1', null, 'idem-adm-0001'), 'affected=1'),
      ('D47','A pending payment does not release the document',    'postgres','val', format('select status::text from public.document_requests where id = %L', r_adm), 'val=payment_pending'),
      ('D48','Confirming the payment',                             'fo_a','exec', $q$select public.finance_confirm_payment((select id from public.payments where reference = 'ADM-PAY-1'))$q$, 'affected=1'),
      ('D49','…moves the request on by itself (approved)',         'postgres','val', format('select status::text from public.document_requests where id = %L', r_adm), 'val=approved'),
      ('D50','Admissions officer now generates the admission letter','adms_a','exec', format('select public.doc_generate(%L, null)', r_adm), 'affected=1'),
      ('D51','The request is generated',                           'postgres','val', format('select status::text from public.document_requests where id = %L', r_adm), 'val=generated'),
      ('D52','Document numbers are gap-free',                      'postgres','val', format('select document_number from public.issued_documents where request_id = %L', r_adm), format('val=DOC-%s-00001', v_year)),
      ('D53','Generating twice is refused',                        'adms_a','exec', format('select public.doc_generate(%L, null)', r_adm), 'denied'),
      ('D54','Student sees their own issued document',             'stu_c','count', 'select 1 from public.issued_documents', 'rows=1'),
      ('D55','Another student sees none',                          'stu_a','count', 'select 1 from public.issued_documents', 'rows=0'),
      ('D56','Admissions officer sees the admission letter',       'adms_a','count', 'select 1 from public.issued_documents', 'rows=1'),
      ('D57','Teacher sees none',                                  'tch_a','count', 'select 1 from public.issued_documents', 'rows=0'),
      ('D58','Anonymous cannot read issued documents',             'anon','count', 'select 1 from public.issued_documents', 'denied'),
      ('D59','An issued document cannot be edited',                'postgres','exec', $q$update public.issued_documents set payload = '{}'::jsonb$q$, 'denied'),
      ('D60','An issued document cannot be deleted',               'postgres','exec', 'delete from public.issued_documents', 'denied'),
      ('D61a','Once the fee is paid the student is cleared',      'stu_c','val', format($q$select (public.student_clearance(%L) ->> 'cleared')$q$, stu_c), 'val=true'),
      ('D61','The payload carries the student and school',         'postgres','val', format($q$select (payload -> 'student' ->> 'admission_number') || ' / ' || (payload -> 'school' ->> 'name') from public.issued_documents where request_id = %L$q$, r_adm), 'val=ADM-003 / DOC Test A'),

      -- ===================== fee AND clearance (transcript) ===========
      ('D62','Transcript blocked while the fee is unpaid',         'fo_a','exec', format('select public.doc_generate(%L, null)', r_tr), 'denied'),
      ('D63','Finance records the $10 transcript fee',             'fo_a','exec', format(rp, stu_a, (select invoice_id from public.document_requests where id = r_tr), '10', 'USD', 'bank', 'TR-PAY-1', null, 'idem-tr-00001'), 'affected=1'),
      ('D64','Confirming it',                                      'fo_a','exec', $q$select public.finance_confirm_payment((select id from public.payments where reference = 'TR-PAY-1'))$q$, 'affected=1'),
      ('D65','Fee paid -> request ready, but the hold remains',    'postgres','val', format('select status::text from public.document_requests where id = %L', r_tr), 'val=approved'),
      ('D66','Financial hold blocks the transcript (finance officer)','fo_a','exec', format('select public.doc_generate(%L, null)', r_tr), 'denied'),
      ('D67','Finance officer cannot override even with a reason', 'fo_a','exec', format($q$select public.doc_generate(%L, 'please')$q$, r_tr), 'denied'),
      ('D68','Admin must give a reason to override',               'adm_a','exec', format('select public.doc_generate(%L, null)', r_tr), 'denied'),
      ('D69','Admin overrides the hold with a reason',             'adm_a','exec', format($q$select public.doc_generate(%L, 'Family agreed a payment plan')$q$, r_tr), 'affected=1'),
      ('D70','The override is recorded on the request',            'postgres','val', format($q$select array_to_string(override_waived, ',') || ' | ' || override_reason from public.document_requests where id = %L$q$, r_tr), 'val=clearance | Family agreed a payment plan'),
      ('D71','The override is in the financial audit log',         'postgres','count', format($q$select 1 from public.financial_audit_logs where action = 'DOCUMENT_OVERRIDE' and entity_id = %L$q$, r_tr), 'rows=1'),
      ('D72','The student''s academic record was NOT hidden by the debt','postgres','val', format($q$select jsonb_array_length(payload -> 'records')::text from public.issued_documents where request_id = %L$q$, r_tr), 'val=1'),
      ('D73','The transcript records the standing at issue time',  'postgres','val', format($q$select payload -> 'financial_standing' ->> 'cleared' from public.issued_documents where request_id = %L$q$, r_tr), 'val=false'),
      ('D74','The student still owes the tuition (override changed no balance)','postgres','val', format($q$select balance::text from public.student_balances where student_id = %L$q$, stu_a), 'val=100.00'),

      -- ===================== approval ================================
      ('D75','Approval-required document cannot be generated unapproved','adm_a','exec', format('select public.doc_generate(%L, null)', r_cert), 'denied'),
      ('D76','Teacher cannot review',                              'tch_a','exec', format($q$select public.doc_review_request(%L, true, null)$q$, r_cert), 'denied'),
      ('D77','Student cannot review',                              'stu_c','exec', format($q$select public.doc_review_request(%L, true, null)$q$, r_cert), 'denied'),
      ('D78','Rejecting needs a reason',                           'adm_a','exec', format($q$select public.doc_review_request(%L, false, '')$q$, r_cert), 'denied'),
      ('D79','Admin approves the certificate',                     'adm_a','exec', format($q$select public.doc_review_request(%L, true, 'Looks fine')$q$, r_cert), 'affected=1'),
      ('D80','…and it is ready',                                   'postgres','val', format('select status::text from public.document_requests where id = %L', r_cert), 'val=approved'),
      ('D81','Admin generates the certificate',                    'adm_a','exec', format('select public.doc_generate(%L, null)', r_cert), 'affected=1'),

      -- ===================== printing / delivery ======================
      ('D82','Cannot mark delivered before it is generated',       'adm_a','exec', format('select public.doc_mark(%L, %L::public.document_request_status)', r_clr, 'delivered'), 'denied'),
      ('D83','Mark the certificate printed',                       'adm_a','exec', format('select public.doc_mark(%L, %L::public.document_request_status)', r_cert, 'printed'), 'affected=1'),
      ('D84','Printed twice is refused',                           'adm_a','exec', format('select public.doc_mark(%L, %L::public.document_request_status)', r_cert, 'printed'), 'denied'),
      ('D85','Mark it delivered',                                  'adm_a','exec', format('select public.doc_mark(%L, %L::public.document_request_status)', r_cert, 'delivered'), 'affected=1'),
      ('D86','Only printed/delivered can be set this way',         'adm_a','exec', format('select public.doc_mark(%L, %L::public.document_request_status)', r_clr, 'approved'), 'denied'),
      ('D87','A delivered request can never change',               'postgres','exec', format($q$update public.document_requests set status = 'approved' where id = %L$q$, r_cert), 'denied'),
      ('D88','A delivered request cannot be cancelled',            'stu_c','exec', format($q$select public.doc_cancel_request(%L, 'x')$q$, r_cert), 'denied'),

      -- ===================== a payment reversal sends it back =========
      ('D89','Finance records and confirms the fee for stu_d',     'fo_a','exec', format(rp, stu_d, (select invoice_id from public.document_requests where id = r_rev), '50', 'USD', 'bank', 'REV-PAY-1', null, 'idem-rev-0001'), 'affected=1'),
      ('D90','Confirm it',                                         'fo_a','exec', $q$select public.finance_confirm_payment((select id from public.payments where reference = 'REV-PAY-1'))$q$, 'affected=1'),
      ('D91','Request became approved',                            'postgres','val', format('select status::text from public.document_requests where id = %L', r_rev), 'val=approved'),
      ('D92','Finance reverses that payment',                      'fo_a','exec', $q$select public.finance_reverse_payment((select id from public.payments where reference = 'REV-PAY-1'), 'Bounced')$q$, 'affected=1'),
      ('D93','A reversed payment sends the request back to payment_pending','postgres','val', format('select status::text from public.document_requests where id = %L', r_rev), 'val=payment_pending'),
      ('D94','…and the letter can no longer be generated',         'adms_a','exec', format('select public.doc_generate(%L, null)', r_rev), 'denied'),

      -- ===================== cancel / reject ==========================
      ('D95','Cancelling needs to be the requester or staff',      'stu_c','exec', format($q$select public.doc_cancel_request(%L, 'x')$q$, r_can), 'denied'),
      ('D96','The requester cancels their own request',            'stu_e','exec', format($q$select public.doc_cancel_request(%L, 'Changed my mind')$q$, r_can), 'affected=1'),
      ('D97','…and the unpaid fee invoice is cancelled with it',   'postgres','val', format($q$select i.status::text from public.invoices i join public.document_requests r on r.invoice_id = i.id where r.id = %L$q$, r_can), 'val=cancelled'),
      ('D98','…leaving the student owing nothing for it',          'postgres','val', format($q$select coalesce((select balance::text from public.student_balances where student_id = %L), '0')$q$, stu_e), 'val=0.00'),
      ('D99','A cancelled request can be requested again',         'stu_e','exec', format('select public.doc_request(%L, %L, null)', stu_e, t_adm), 'affected=1'),
      ('D100','A cancelled request cannot be reviewed',            'adm_a','exec', format($q$select public.doc_review_request(%L, true, null)$q$, r_can), 'denied'),
      ('D101','Rejecting an admission letter cancels its invoice', 'adm_a','exec', format($q$select public.doc_review_request((select id from public.document_requests where student_id = %L and status = 'payment_pending'), false, 'Not enrolled')$q$, stu_e), 'affected=1'),
      ('D102','…and the request is rejected',                      'postgres','val', format($q$select status::text from public.document_requests where student_id = %L and review_decision = 'rejected'$q$, stu_e), 'val=rejected'),

      -- ===================== public verification ======================
      ('D103','Anyone can run verify_document',                    'postgres','val', $q$select has_function_privilege('anon', 'public.verify_document(text)', 'execute')::text$q$, 'val=true'),
      ('D104','Verification returns the document number',          'postgres','val', format($q$select document_number from public.verify_document((select verification_token from public.issued_documents where request_id = %L))$q$, r_adm), format('val=DOC-%s-00001', v_year)),
      ('D105','A made-up token verifies as nothing',               'anon','count', $q$select 1 from public.verify_document(repeat('a', 64))$q$, 'rows=0'),
      ('D106','A short token is rejected',                         'anon','count', $q$select 1 from public.verify_document('abc')$q$, 'rows=0'),
      ('D107','Verification shows first name + last initial only', 'postgres','val', format($q$select student_label from public.verify_document((select verification_token from public.issued_documents where request_id = %L))$q$, r_adm), 'val=T S.'),
      ('D108','…and the document is valid',                        'postgres','val', format($q$select is_valid::text from public.verify_document((select verification_token from public.issued_documents where request_id = %L))$q$, r_adm), 'val=true'),
      ('D109','Only a school admin can revoke',                    'fo_a','exec', format($q$select public.doc_revoke((select id from public.issued_documents where request_id = %L), 'Forged')$q$, r_adm), 'denied'),
      ('D110','Revoking needs a reason',                           'adm_a','exec', format($q$select public.doc_revoke((select id from public.issued_documents where request_id = %L), '')$q$, r_adm), 'denied'),
      ('D111','The school admin revokes the document',             'adm_a','exec', format($q$select public.doc_revoke((select id from public.issued_documents where request_id = %L), 'Issued in error')$q$, r_adm), 'affected=1'),
      ('D112','A revoked document verifies as invalid',            'postgres','val', format($q$select is_valid::text from public.verify_document((select verification_token from public.issued_documents where request_id = %L))$q$, r_adm), 'val=false'),
      ('D113','Revoking twice is refused',                         'adm_a','exec', format($q$select public.doc_revoke((select id from public.issued_documents where request_id = %L), 'Again')$q$, r_adm), 'denied'),

      -- ===================== audit ====================================
      ('D117','Read model: admissions officer sees only admission requests, with names','adms_a','count', 'select 1 from public.document_request_details where first_name is not null', 'rows=4'),
      ('D118','Read model: a student sees their own requests',      'stu_c','count', 'select 1 from public.document_request_details', 'rows=2'),
      ('D119','Read model: a teacher sees none',                    'tch_a','count', 'select 1 from public.document_request_details', 'rows=0'),
      ('D120','Read model: the other school sees none',             'adm_b','count', 'select 1 from public.document_request_details', 'rows=0'),
      ('D121','Read model: anonymous is refused',                   'anon','count', 'select 1 from public.document_request_details', 'denied'),
      ('D122','Read model: an unlinked parent sees none',           'par_x','count', 'select 1 from public.document_request_details', 'rows=0'),
      ('D114','Requests, approvals, generation and revocation were audited','postgres','count', $q$select 1 from public.financial_audit_logs where action in ('DOCUMENT_REQUESTED', 'DOCUMENT_APPROVED', 'DOCUMENT_GENERATED', 'DOCUMENT_REVOKED', 'DOCUMENT_PRINTED', 'DOCUMENT_DELIVERED', 'DOCUMENT_REQUEST_CANCELLED', 'DOCUMENT_REJECTED')$q$, 'rows>=8'),
      ('D115','No verification token ever reaches the audit log',  'postgres','count', $q$select 1 from public.financial_audit_logs where new_data::text like '%verification_token%' or old_data::text like '%verification_token%'$q$, 'rows=0'),
      ('D116','The internal helpers are not callable by browser roles','postgres','val', $q$select (has_function_privilege('authenticated', 'private.doc_advance(uuid)', 'execute') or has_function_privilege('authenticated', 'private.doc_create_invoice(uuid, uuid, uuid, public.document_types)', 'execute'))::text$q$, 'val=false')
    ) as c(id, descr, actor, kind, sql, expected)
    loop
      v_actor := case t.actor when 'adm_a' then adm_a when 'fo_a' then fo_a when 'adms_a' then adms_a when 'tch_a' then tch_a
        when 'stu_a' then stu_a when 'stu_c' then stu_c when 'stu_d' then stu_d when 'stu_e' then stu_e
        when 'par_a' then par_a when 'par_x' then par_x when 'adm_b' then adm_b when 'sup' then sup end;
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

select * from pg_temp.educore_document_tests();
