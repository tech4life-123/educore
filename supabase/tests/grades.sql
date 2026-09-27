-- =============================================================================
-- EduCore — Assessments & grades authorization tests (migration 010)
--
-- Same approach as tenant_isolation.sql: throwaway fixtures, every case runs
-- as the real `authenticated` role with a forged JWT sub, and all data is
-- rolled back. Run as the postgres role:
--   psql "$DATABASE_URL" -f supabase/tests/grades.sql
-- =============================================================================

create or replace function pg_temp.educore_grades_tests()
returns table (test_id text, description text, expected text, actual text, result text)
language plpgsql
as $fn$
declare
  v_results jsonb := '[]'::jsonb;
  v_session text := session_user;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  adm_a uuid := gen_random_uuid(); tch_a uuid := gen_random_uuid(); tch_a2 uuid := gen_random_uuid();
  stu_a1 uuid := gen_random_uuid(); stu_a2 uuid := gen_random_uuid(); stu_a3 uuid := gen_random_uuid();
  par_a uuid := gen_random_uuid(); adm_b uuid := gen_random_uuid();
  p_tch_a uuid; p_tch_a2 uuid; p_stu_a1 uuid; p_stu_a2 uuid; p_stu_a3 uuid; p_par_a uuid;
  yr uuid := gen_random_uuid(); term uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid(); ex uuid := gen_random_uuid();
  cls uuid := gen_random_uuid(); s_math uuid := gen_random_uuid(); s_eng uuid := gen_random_uuid();
  cs_math uuid := gen_random_uuid(); cs_eng uuid := gen_random_uuid();
  asmt uuid := gen_random_uuid(); asmt_ex uuid := gen_random_uuid();
  cat_tests uuid;
  v_actor uuid; v_n bigint; v_actual text; t record;
begin
  begin
    insert into public.schools (id, name, code, slug, status) values
      (a, 'GR Test A', 'GRTEST-A', 'gr-test-a', 'active'), (b, 'GR Test B', 'GRTEST-B', 'gr-test-b', 'active');
    insert into auth.users (id, instance_id, aud, role, email)
    select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.id || '@gr.test'
    from unnest(array[adm_a, tch_a, tch_a2, stu_a1, stu_a2, stu_a3, par_a, adm_b]) as x(id);
    insert into public.profiles (user_id, school_id, first_name, last_name, role, status) values
      (adm_a, a, 'T', 'AdmA', 'school_admin', 'active'), (tch_a, a, 'T', 'MathTeacher', 'teacher', 'active'),
      (tch_a2, a, 'T', 'EngTeacher', 'teacher', 'active'), (stu_a1, a, 'T', 'StuA1', 'student', 'active'),
      (stu_a2, a, 'T', 'StuA2', 'student', 'active'), (stu_a3, a, 'T', 'StuA3', 'student', 'active'),
      (par_a, a, 'T', 'ParA', 'parent', 'active'), (adm_b, b, 'T', 'AdmB', 'school_admin', 'active');
    select id into p_tch_a from public.profiles where user_id = tch_a;
    select id into p_tch_a2 from public.profiles where user_id = tch_a2;
    select id into p_stu_a1 from public.profiles where user_id = stu_a1;
    select id into p_stu_a2 from public.profiles where user_id = stu_a2;
    select id into p_stu_a3 from public.profiles where user_id = stu_a3;
    select id into p_par_a from public.profiles where user_id = par_a;

    insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current)
      values (yr, a, '2026/2027', '2026-09-01', '2027-07-31', true);
    insert into public.academic_terms (id, school_id, academic_year_id, name, sequence) values (term, a, yr, 'First Semester', 1);
    insert into public.grading_periods (id, school_id, term_id, name, sequence, kind) values
      (p1, a, term, '1st Period', 1, 'marking_period'), (ex, a, term, 'First Semester Exam', 4, 'exam');
    insert into public.classes (id, school_id, academic_year_id, grade_level_id, name)
      select cls, a, yr, g.id, '10A' from public.grade_levels g where g.school_id = a and g.name = 'Grade 10';
    insert into public.subjects (id, school_id, name, code) values (s_math, a, 'Mathematics', 'MATH'), (s_eng, a, 'English', 'ENG');
    insert into public.class_subjects (id, school_id, class_id, subject_id, teacher_id) values
      (cs_math, a, cls, s_math, p_tch_a), (cs_eng, a, cls, s_eng, p_tch_a2);
    insert into public.enrollments (school_id, class_id, academic_year_id, student_id) values
      (a, cls, yr, p_stu_a1), (a, cls, yr, p_stu_a2);
    insert into public.guardian_links (school_id, parent_id, student_id, relationship) values (a, p_par_a, p_stu_a1, 'mother');
    select id into cat_tests from public.assessment_categories where school_id = a and name = 'Tests';

    for t in select * from (values
      ('C01','New schools get 5 default categories',            'postgres','count', format('select 1 from public.assessment_categories where school_id = %L', a), 'rows=5'),
      ('Q01','Math teacher creates a test (control)',           'teacher_a','exec', format($q$insert into public.assessments (id, school_id, class_subject_id, grading_period_id, category_id, title, max_score) values (%L, %L, %L, %L, %L, 'Test 1', 20)$q$, asmt, a, cs_math, p1, cat_tests), 'affected=1'),
      ('Q02','created_by is set to the teacher',                'postgres','count', format('select 1 from public.assessments where id = %L and created_by = %L', asmt, p_tch_a), 'rows=1'),
      ('Q03','English teacher creates a Math assessment',       'teacher_a2','exec',format($q$insert into public.assessments (school_id, class_subject_id, grading_period_id, category_id, title, max_score) values (%L, %L, %L, %L, 'Rogue', 20)$q$, a, cs_math, p1, cat_tests), 'denied'),
      ('Q04','Student creates an assessment',                   'student_a1','exec',format($q$insert into public.assessments (school_id, class_subject_id, grading_period_id, category_id, title, max_score) values (%L, %L, %L, %L, 'Rogue', 20)$q$, a, cs_math, p1, cat_tests), 'denied'),
      ('Q05','School B admin creates a School A assessment',    'admin_b', 'exec',  format($q$insert into public.assessments (school_id, class_subject_id, grading_period_id, category_id, title, max_score) values (%L, %L, %L, %L, 'Rogue', 20)$q$, a, cs_math, p1, cat_tests), 'denied'),
      ('Q06','Marking-period assessment without a category',    'teacher_a','exec', format($q$insert into public.assessments (school_id, class_subject_id, grading_period_id, title, max_score) values (%L, %L, %L, 'No category', 20)$q$, a, cs_math, p1), 'denied'),
      ('Q07','Exam assessment without a category (control)',    'teacher_a','exec', format($q$insert into public.assessments (id, school_id, class_subject_id, grading_period_id, category_id, title, max_score) values (%L, %L, %L, %L, %L, 'Semester exam', 100)$q$, asmt_ex, a, cs_math, ex, cat_tests), 'affected=1'),
      ('Q08','…exam assessments never carry a category',        'postgres','count', format('select 1 from public.assessments where id = %L and category_id is null', asmt_ex), 'rows=1'),
      ('N01','Teacher scores student A1 18/20 (control)',       'teacher_a','exec', format($q$insert into public.assessment_scores (school_id, assessment_id, student_id, score) values (%L, %L, %L, 18)$q$, a, asmt, p_stu_a1), 'affected=1'),
      ('N02','Score above the maximum',                         'teacher_a','exec', format($q$insert into public.assessment_scores (school_id, assessment_id, student_id, score) values (%L, %L, %L, 25)$q$, a, asmt, p_stu_a2), 'denied'),
      ('N03','Score for a student not in the class',            'teacher_a','exec', format($q$insert into public.assessment_scores (school_id, assessment_id, student_id, score) values (%L, %L, %L, 10)$q$, a, asmt, p_stu_a3), 'denied'),
      ('N04','English teacher scores a Math test',              'teacher_a2','exec',format($q$insert into public.assessment_scores (school_id, assessment_id, student_id, score) values (%L, %L, %L, 10)$q$, a, asmt, p_stu_a2), 'denied'),
      ('N05','Teacher scores student A2 15/20 (control)',       'teacher_a','exec', format($q$insert into public.assessment_scores (school_id, assessment_id, student_id, score) values (%L, %L, %L, 15)$q$, a, asmt, p_stu_a2), 'affected=1'),
      ('N06','Lower the maximum below an existing score',       'teacher_a','exec', format('update public.assessments set max_score = 10 where id = %L', asmt), 'denied'),
      ('R01','Student sees own score before publishing',        'student_a1','count','select 1 from public.assessment_scores', 'rows=0'),
      ('R02','Parent sees child''s score before publishing',    'parent_a','count', 'select 1 from public.assessment_scores', 'rows=0'),
      ('R03','English teacher sees Math scores',                'teacher_a2','count','select 1 from public.assessment_scores', 'rows=0'),
      ('R04','Admin A sees the scores',                         'admin_a', 'count', 'select 1 from public.assessment_scores', 'rows=2'),
      ('R05','School B admin sees School A scores',             'admin_b', 'count', 'select 1 from public.assessment_scores', 'rows=0'),
      ('U01','Teacher submits Math, 1st period (control)',      'teacher_a','exec', format($q$insert into public.grade_submissions (school_id, class_subject_id, grading_period_id) values (%L, %L, %L)$q$, a, cs_math, p1), 'affected=1'),
      ('U02','Teacher edits a score after submitting',          'teacher_a','exec', format('update public.assessment_scores set score = 19 where student_id = %L', p_stu_a1), 'denied'),
      ('U03','Admin corrects a submitted score',                'admin_a', 'exec',  format('update public.assessment_scores set score = 19 where student_id = %L', p_stu_a1), 'affected=1'),
      ('U04','Admin returns the submission',                    'admin_a', 'exec',  format('delete from public.grade_submissions where class_subject_id = %L', cs_math), 'affected=1'),
      ('U05','Teacher publishes the period',                    'teacher_a','exec', format('select public.set_grading_period_published(%L, true)', p1), 'denied'),
      ('U06','Admin publishes the period (control)',            'admin_a', 'exec',  format('select public.set_grading_period_published(%L, true)', p1), 'affected=1'),
      ('V01','Student A1 now sees only their own score',        'student_a1','count','select 1 from public.assessment_scores', 'rows=1'),
      ('V02','Parent sees their child''s score',                'parent_a','count', format('select 1 from public.assessment_scores where student_id = %L', p_stu_a1), 'rows=1'),
      ('V03','Parent sees no other student''s score',           'parent_a','count', format('select 1 from public.assessment_scores where student_id <> %L', p_stu_a1), 'rows=0'),
      ('V04','Student sees published assessments only',         'student_a1','count','select 1 from public.assessments', 'rows=1'),
      ('V05','Student not in the class sees no assessments',    'student_a3','count','select 1 from public.assessments', 'rows=0'),
      ('L01','Admin edits a score in a published period',       'admin_a', 'exec',  format('update public.assessment_scores set score = 20 where student_id = %L', p_stu_a1), 'denied'),
      ('L02','Teacher adds an assessment to a published period','teacher_a','exec', format($q$insert into public.assessments (school_id, class_subject_id, grading_period_id, category_id, title, max_score) values (%L, %L, %L, %L, 'Late quiz', 10)$q$, a, cs_math, p1, cat_tests), 'denied'),
      ('L03','Teacher deletes a published assessment',          'teacher_a','exec', format('delete from public.assessments where id = %L', asmt), 'denied'),
      ('L04','Remove a graded student from the class',          'admin_a', 'exec',  format('delete from public.enrollments where student_id = %L', p_stu_a1), 'denied'),
      ('S01','Teacher changes category weights',                'teacher_a','exec', format('update public.assessment_categories set weight = 90 where id = %L', cat_tests), 'affected=0'),
      ('S02','Admin changes category weights (control)',        'admin_a', 'exec',  format('update public.assessment_categories set weight = 50 where id = %L', cat_tests), 'affected=1'),
      ('S03','Teacher changes the exam weight',                 'teacher_a','exec', format('update public.school_settings set exam_weight = 90 where school_id = %L', a), 'affected=0'),
      ('A01','Audit trail records the teacher''s score entries','postgres','count', format($q$select 1 from public.audit_logs where action = 'assessment_scores.insert' and user_id = %L$q$, tch_a), 'rows=2')
    ) as c(id, descr, actor, kind, sql, expected)
    loop
      v_actor := case t.actor when 'admin_a' then adm_a when 'teacher_a' then tch_a when 'teacher_a2' then tch_a2
        when 'student_a1' then stu_a1 when 'student_a3' then stu_a3 when 'parent_a' then par_a when 'admin_b' then adm_b end;
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

select * from pg_temp.educore_grades_tests();
