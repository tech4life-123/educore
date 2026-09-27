-- =============================================================================
-- EduCore — Student & staff profile authorization tests (migration 015)
--
-- Same approach as tenant_isolation.sql: throwaway fixtures, every case runs
-- as the real `authenticated` role with a forged JWT sub, and all data is
-- rolled back. Run as the postgres role:
--   psql "$DATABASE_URL" -f supabase/tests/people_profiles.sql
-- =============================================================================

create or replace function pg_temp.educore_people_tests()
returns table (test_id text, description text, expected text, actual text, result text)
language plpgsql
as $fn$
declare
  v_results jsonb := '[]'::jsonb;
  v_session text := session_user;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  adm_a uuid := gen_random_uuid(); tch_c uuid := gen_random_uuid(); tch_o uuid := gen_random_uuid();
  stu1 uuid := gen_random_uuid(); stu2 uuid := gen_random_uuid(); par uuid := gen_random_uuid(); adm_b uuid := gen_random_uuid();
  p_tch_c uuid; p_stu1 uuid; p_stu2 uuid; p_par uuid;
  yr uuid := gen_random_uuid(); cls uuid := gen_random_uuid(); subj uuid := gen_random_uuid();
  v_actor uuid; v_n bigint; v_actual text; t record;
begin
  begin
    insert into public.schools (id, name, code, slug, status) values
      (a, 'PP Test A', 'PPTEST-A', 'pp-test-a', 'active'), (b, 'PP Test B', 'PPTEST-B', 'pp-test-b', 'active');
    insert into auth.users (id, instance_id, aud, role, email)
    select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.id || '@pp.test'
    from unnest(array[adm_a, tch_c, tch_o, stu1, stu2, par, adm_b]) as x(id);
    insert into public.profiles (user_id, school_id, first_name, last_name, role, status) values
      (adm_a, a, 'T', 'AdmA', 'school_admin', 'active'), (tch_c, a, 'T', 'ClassTeacher', 'teacher', 'active'),
      (tch_o, a, 'T', 'Other', 'teacher', 'active'), (stu1, a, 'T', 'Stu1', 'student', 'active'),
      (stu2, a, 'T', 'Stu2', 'student', 'active'), (par, a, 'T', 'Par', 'parent', 'active'),
      (adm_b, b, 'T', 'AdmB', 'school_admin', 'active');
    select id into p_tch_c from public.profiles where user_id = tch_c;
    select id into p_stu1 from public.profiles where user_id = stu1;
    select id into p_stu2 from public.profiles where user_id = stu2;
    select id into p_par from public.profiles where user_id = par;

    insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current) values (yr, a, 'PP Year', '2026-09-01', '2027-07-31', true);
    insert into public.classes (id, school_id, academic_year_id, grade_level_id, name)
      select cls, a, yr, g.id, '11A' from public.grade_levels g where g.school_id = a and g.name = 'Grade 11';
    insert into public.subjects (id, school_id, name, code) values (subj, a, 'Physics', 'PHY');
    insert into public.class_subjects (school_id, class_id, subject_id, teacher_id) values (a, cls, subj, p_tch_c);
    insert into public.enrollments (school_id, class_id, academic_year_id, student_id) values (a, cls, yr, p_stu1);
    insert into public.guardian_links (school_id, parent_id, student_id) values (a, p_par, p_stu1);
    insert into public.student_profiles (school_id, profile_id, admission_number) values (a, p_stu2, '2026-0002');

    for t in select * from (values
      ('P01','Admin records student 1''s details (control)',   'admin_a','exec', format($q$insert into public.student_profiles (school_id, profile_id, admission_number, gender, date_of_birth) values (%L, %L, '2026-0001', 'female', '2010-05-14')$q$, a, p_stu1), 'affected=1'),
      ('P02','Duplicate admission number (any case)',          'admin_a','exec', format($q$update public.student_profiles set admission_number = '2026-0002' where profile_id = %L$q$, p_stu1), 'denied'),
      ('P03','Student record for a teacher',                   'admin_a','exec', format($q$insert into public.student_profiles (school_id, profile_id) values (%L, %L)$q$, a, p_tch_c), 'denied'),
      ('P04','Teacher writes student details',                 'teacher_c','exec', format($q$update public.student_profiles set gender = 'male' where profile_id = %L$q$, p_stu1), 'affected=0'),
      ('P05','School B admin edits a School A record',         'admin_b','exec', format($q$update public.student_profiles set gender = 'male' where profile_id = %L$q$, p_stu1), 'affected=0'),
      ('R01','Teacher of the class sees only their student',   'teacher_c','count','select 1 from public.student_profiles', 'rows=1'),
      ('R02','Unrelated teacher sees no student details',      'teacher_o','count','select 1 from public.student_profiles', 'rows=0'),
      ('R03','Student sees only their own details',            'student1','count','select 1 from public.student_profiles', 'rows=1'),
      ('R04','Parent sees their child''s details',             'parent','count',  format('select 1 from public.student_profiles where profile_id = %L', p_stu1), 'rows=1'),
      ('R05','Parent sees no other student''s details',        'parent','count',  format('select 1 from public.student_profiles where profile_id <> %L', p_stu1), 'rows=0'),
      ('R06','School B admin sees no School A details',        'admin_b','count', 'select 1 from public.student_profiles', 'rows=0'),
      ('R07','Admin sees all student details',                 'admin_a','count', 'select 1 from public.student_profiles', 'rows=2'),
      ('S01','Admin records a teacher''s staff details',       'admin_a','exec', format($q$insert into public.staff_profiles (school_id, profile_id, employee_number, qualification) values (%L, %L, 'T-001', 'B.Sc. Physics')$q$, a, p_tch_c), 'affected=1'),
      ('S02','Staff record for a student',                     'admin_a','exec', format($q$insert into public.staff_profiles (school_id, profile_id) values (%L, %L)$q$, a, p_stu1), 'denied'),
      ('S03','Teacher sees their own staff record',            'teacher_c','count','select 1 from public.staff_profiles', 'rows=1'),
      ('S04','Other teacher sees no staff records',            'teacher_o','count','select 1 from public.staff_profiles', 'rows=0'),
      ('S05','Student sees no staff records',                  'student1','count','select 1 from public.staff_profiles', 'rows=0'),
      ('S06','Teacher edits their own staff record',           'teacher_c','exec', format($q$update public.staff_profiles set employee_number = 'X' where profile_id = %L$q$, p_tch_c), 'affected=0'),
      ('A01','Changes are audited',                            'postgres','count', format($q$select 1 from public.audit_logs where action in ('student_profiles.insert', 'staff_profiles.insert') and user_id = %L$q$, adm_a), 'rows=2')
    ) as c(id, descr, actor, kind, sql, expected)
    loop
      v_actor := case t.actor when 'admin_a' then adm_a when 'teacher_c' then tch_c when 'teacher_o' then tch_o
        when 'student1' then stu1 when 'parent' then par when 'admin_b' then adm_b end;
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

select * from pg_temp.educore_people_tests();
