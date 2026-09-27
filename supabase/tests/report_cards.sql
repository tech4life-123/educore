-- =============================================================================
-- EduCore — Report card authorization tests (migration 012)
--
-- Same approach as tenant_isolation.sql: throwaway fixtures, every case runs
-- as the real `authenticated` role with a forged JWT sub, and all data is
-- rolled back. Run as the postgres role:
--   psql "$DATABASE_URL" -f supabase/tests/report_cards.sql
-- =============================================================================

create or replace function pg_temp.educore_report_card_tests()
returns table (test_id text, description text, expected text, actual text, result text)
language plpgsql
as $fn$
declare
  v_results jsonb := '[]'::jsonb;
  v_session text := session_user;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  adm_a uuid := gen_random_uuid(); tch_h uuid := gen_random_uuid(); tch_o uuid := gen_random_uuid();
  stu1 uuid := gen_random_uuid(); stu2 uuid := gen_random_uuid(); stu3 uuid := gen_random_uuid();
  par uuid := gen_random_uuid(); adm_b uuid := gen_random_uuid();
  p_adm_a uuid; p_tch_h uuid; p_stu1 uuid; p_stu2 uuid; p_stu3 uuid; p_par uuid;
  yr uuid := gen_random_uuid(); yr2 uuid := gen_random_uuid();
  term uuid := gen_random_uuid(); term_other uuid := gen_random_uuid();
  cls uuid := gen_random_uuid();
  v_actor uuid; v_n bigint; v_actual text; t record;
begin
  begin
    insert into public.schools (id, name, code, slug, status) values
      (a, 'RC Test A', 'RCTEST-A', 'rc-test-a', 'active'), (b, 'RC Test B', 'RCTEST-B', 'rc-test-b', 'active');
    insert into auth.users (id, instance_id, aud, role, email)
    select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.id || '@rc.test'
    from unnest(array[adm_a, tch_h, tch_o, stu1, stu2, stu3, par, adm_b]) as x(id);
    insert into public.profiles (user_id, school_id, first_name, last_name, role, status) values
      (adm_a, a, 'T', 'AdmA', 'school_admin', 'active'), (tch_h, a, 'T', 'Homeroom', 'teacher', 'active'),
      (tch_o, a, 'T', 'Other', 'teacher', 'active'), (stu1, a, 'T', 'Stu1', 'student', 'active'),
      (stu2, a, 'T', 'Stu2', 'student', 'active'), (stu3, a, 'T', 'Stu3', 'student', 'active'),
      (par, a, 'T', 'Par', 'parent', 'active'), (adm_b, b, 'T', 'AdmB', 'school_admin', 'active');
    select id into p_adm_a from public.profiles where user_id = adm_a;
    select id into p_tch_h from public.profiles where user_id = tch_h;
    select id into p_stu1 from public.profiles where user_id = stu1;
    select id into p_stu2 from public.profiles where user_id = stu2;
    select id into p_stu3 from public.profiles where user_id = stu3;
    select id into p_par from public.profiles where user_id = par;

    insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current) values
      (yr, a, '2026/2027', '2026-09-01', '2027-07-31', true), (yr2, a, '2027/2028', '2027-09-01', '2028-07-31', false);
    insert into public.academic_terms (id, school_id, academic_year_id, name, sequence) values
      (term, a, yr, 'First Semester', 1), (term_other, a, yr2, 'First Semester', 1);
    insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, homeroom_teacher_id)
      select cls, a, yr, g.id, '10A', p_tch_h from public.grade_levels g where g.school_id = a and g.name = 'Grade 10';
    insert into public.enrollments (school_id, class_id, academic_year_id, student_id) values (a, cls, yr, p_stu1), (a, cls, yr, p_stu2);
    insert into public.guardian_links (school_id, parent_id, student_id, relationship) values (a, p_par, p_stu1, 'father');

    for t in select * from (values
      ('RC01','Admin issues a report card (control)',             'admin_a','exec', format($q$insert into public.report_cards (school_id, student_id, class_id, academic_year_id, term_id, data, average, rank, class_size) values (%L, %L, %L, %L, %L, '{"v":1}', 81.5, 1, 2)$q$, a, p_stu1, cls, yr, term), 'affected=1'),
      ('RC02','issued_by and year are set by the database',       'postgres','count', format('select 1 from public.report_cards where student_id = %L and issued_by = %L and academic_year_id = %L', p_stu1, p_adm_a, yr), 'rows=1'),
      ('RC03','Homeroom teacher issues a report card',            'teacher_h','exec', format($q$insert into public.report_cards (school_id, student_id, class_id, academic_year_id, term_id, data, class_size) values (%L, %L, %L, %L, %L, '{}', 2)$q$, a, p_stu2, cls, yr, term), 'denied'),
      ('RC04','Card for a student not in the class',              'admin_a','exec', format($q$insert into public.report_cards (school_id, student_id, class_id, academic_year_id, term_id, data, class_size) values (%L, %L, %L, %L, %L, '{}', 2)$q$, a, p_stu3, cls, yr, term), 'denied'),
      ('RC05','Card for a semester of another year',              'admin_a','exec', format($q$insert into public.report_cards (school_id, student_id, class_id, academic_year_id, term_id, data, class_size) values (%L, %L, %L, %L, %L, '{}', 2)$q$, a, p_stu2, cls, yr, term_other), 'denied'),
      ('RC06','School B admin issues a School A card',            'admin_b','exec', format($q$insert into public.report_cards (school_id, student_id, class_id, academic_year_id, term_id, data, class_size) values (%L, %L, %L, %L, %L, '{}', 2)$q$, a, p_stu2, cls, yr, term), 'denied'),
      ('RV01','Student sees own card',                            'student1','count','select 1 from public.report_cards', 'rows=1'),
      ('RV02','Another student sees no cards',                    'student2','count','select 1 from public.report_cards', 'rows=0'),
      ('RV03','Linked parent sees the child''s card',             'parent','count',  'select 1 from public.report_cards', 'rows=1'),
      ('RV04','Homeroom teacher sees the class''s cards',         'teacher_h','count','select 1 from public.report_cards', 'rows=1'),
      ('RV05','Other teacher sees no cards',                      'teacher_o','count','select 1 from public.report_cards', 'rows=0'),
      ('RV06','School B admin sees no School A cards',            'admin_b','count', 'select 1 from public.report_cards', 'rows=0'),
      ('RV07','Student alters own card',                          'student1','exec', format('update public.report_cards set rank = 1 where student_id = %L', p_stu1), 'affected=0'),
      ('RM01','Homeroom teacher writes a remark (control)',       'teacher_h','exec', format($q$insert into public.report_card_remarks (school_id, student_id, class_id, term_id, remark) values (%L, %L, %L, %L, 'Excellent work.')$q$, a, p_stu1, cls, term), 'affected=1'),
      ('RM02','…and for a student without an issued card',        'teacher_h','exec', format($q$insert into public.report_card_remarks (school_id, student_id, class_id, term_id, remark) values (%L, %L, %L, %L, 'Keep trying.')$q$, a, p_stu2, cls, term), 'affected=1'),
      ('RM03','Other teacher writes a remark',                    'teacher_o','exec', format($q$insert into public.report_card_remarks (school_id, student_id, class_id, term_id, remark) values (%L, %L, %L, %L, 'x')$q$, a, p_stu2, cls, term), 'denied'),
      ('RM04','Student writes a remark',                          'student1','exec', format($q$update public.report_card_remarks set remark = 'Perfect student' where student_id = %L$q$, p_stu1), 'affected=0'),
      ('RM05','Student sees own remark (card issued)',            'student1','count','select 1 from public.report_card_remarks', 'rows=1'),
      ('RM06','Student without an issued card sees no remark',    'student2','count','select 1 from public.report_card_remarks', 'rows=0'),
      ('RM07','Parent sees the child''s remark',                  'parent','count',  'select 1 from public.report_card_remarks', 'rows=1'),
      ('RM08','Remark author is set by the database',             'postgres','count', format('select 1 from public.report_card_remarks where student_id = %L and author_id = %L', p_stu1, p_tch_h), 'rows=1'),
      ('PD01','Admin overrides promotion (control)',              'admin_a','exec', format($q$insert into public.promotion_decisions (school_id, student_id, academic_year_id, decision) values (%L, %L, %L, 'promoted')$q$, a, p_stu1, yr), 'affected=1'),
      ('PD02','Teacher overrides promotion',                      'teacher_h','exec', format($q$insert into public.promotion_decisions (school_id, student_id, academic_year_id, decision) values (%L, %L, %L, 'promoted')$q$, a, p_stu2, yr), 'denied'),
      ('PD03','Promotion decision for a parent account',          'admin_a','exec', format($q$insert into public.promotion_decisions (school_id, student_id, academic_year_id, decision) values (%L, %L, %L, 'promoted')$q$, a, p_par, yr), 'denied'),
      ('PD04','Student sees own promotion decision',              'student1','count','select 1 from public.promotion_decisions', 'rows=1'),
      ('PD05','Other student sees none',                          'student2','count','select 1 from public.promotion_decisions', 'rows=0'),
      ('AU01','Issuing is audited',                               'postgres','count', format($q$select 1 from public.audit_logs where action = 'report_cards.insert' and user_id = %L$q$, adm_a), 'rows=1')
    ) as c(id, descr, actor, kind, sql, expected)
    loop
      v_actor := case t.actor when 'admin_a' then adm_a when 'teacher_h' then tch_h when 'teacher_o' then tch_o
        when 'student1' then stu1 when 'student2' then stu2 when 'parent' then par when 'admin_b' then adm_b end;
      begin
        if t.actor <> 'postgres' then
          perform set_config('request.jwt.claims', json_build_object('sub', v_actor, 'role','authenticated')::text, true);
          perform set_config('role', 'authenticated', true);
        end if;
        if t.kind = 'count' then
          execute 'select count(*) from (' || t.sql || ') s' into v_n;
          v_actual := 'rows=' || v_n;
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

select * from pg_temp.educore_report_card_tests();
