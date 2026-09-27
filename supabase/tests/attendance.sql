-- =============================================================================
-- EduCore — Attendance authorization tests (migration 014)
--
-- Same approach as tenant_isolation.sql: throwaway fixtures, every case runs
-- as the real `authenticated` role with a forged JWT sub, and all data is
-- rolled back. Run as the postgres role:
--   psql "$DATABASE_URL" -f supabase/tests/attendance.sql
-- =============================================================================

create or replace function pg_temp.educore_attendance_tests()
returns table (test_id text, description text, expected text, actual text, result text)
language plpgsql
as $fn$
declare
  v_results jsonb := '[]'::jsonb;
  v_session text := session_user;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  adm_a uuid := gen_random_uuid(); tch_h uuid := gen_random_uuid(); tch_s uuid := gen_random_uuid(); tch_o uuid := gen_random_uuid();
  stu1 uuid := gen_random_uuid(); stu2 uuid := gen_random_uuid(); stu3 uuid := gen_random_uuid();
  par uuid := gen_random_uuid(); adm_b uuid := gen_random_uuid();
  p_tch_h uuid; p_tch_s uuid; p_stu1 uuid; p_stu2 uuid; p_stu3 uuid; p_par uuid;
  yr uuid := gen_random_uuid(); cls uuid := gen_random_uuid(); subj uuid := gen_random_uuid();
  reg1 uuid := gen_random_uuid();
  v_actor uuid; v_n bigint; v_actual text; t record;
begin
  begin
    insert into public.schools (id, name, code, slug, status) values
      (a, 'AT Test A', 'ATTEST-A', 'at-test-a', 'active'), (b, 'AT Test B', 'ATTEST-B', 'at-test-b', 'active');
    insert into auth.users (id, instance_id, aud, role, email)
    select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.id || '@at.test'
    from unnest(array[adm_a, tch_h, tch_s, tch_o, stu1, stu2, stu3, par, adm_b]) as x(id);
    insert into public.profiles (user_id, school_id, first_name, last_name, role, status) values
      (adm_a, a, 'T', 'AdmA', 'school_admin', 'active'), (tch_h, a, 'T', 'Homeroom', 'teacher', 'active'),
      (tch_s, a, 'T', 'Subject', 'teacher', 'active'), (tch_o, a, 'T', 'Other', 'teacher', 'active'),
      (stu1, a, 'T', 'Stu1', 'student', 'active'), (stu2, a, 'T', 'Stu2', 'student', 'active'),
      (stu3, a, 'T', 'Stu3', 'student', 'active'), (par, a, 'T', 'Par', 'parent', 'active'),
      (adm_b, b, 'T', 'AdmB', 'school_admin', 'active');
    select id into p_tch_h from public.profiles where user_id = tch_h;
    select id into p_tch_s from public.profiles where user_id = tch_s;
    select id into p_stu1 from public.profiles where user_id = stu1;
    select id into p_stu2 from public.profiles where user_id = stu2;
    select id into p_stu3 from public.profiles where user_id = stu3;
    select id into p_par from public.profiles where user_id = par;

    insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current)
      values (yr, a, 'AT Year', current_date - 60, current_date + 200, true);
    insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, homeroom_teacher_id)
      select cls, a, yr, g.id, '9A', p_tch_h from public.grade_levels g where g.school_id = a and g.name = 'Grade 9';
    insert into public.subjects (id, school_id, name, code) values (subj, a, 'Mathematics', 'MATH');
    insert into public.class_subjects (school_id, class_id, subject_id, teacher_id) values (a, cls, subj, p_tch_s);
    insert into public.enrollments (school_id, class_id, academic_year_id, student_id) values (a, cls, yr, p_stu1), (a, cls, yr, p_stu2);
    insert into public.guardian_links (school_id, parent_id, student_id) values (a, p_par, p_stu1);

    for t in select * from (values
      ('A01','Homeroom teacher takes today''s register (control)', 'teacher_h','exec', format('insert into public.attendance_registers (id, school_id, class_id, date) values (%L, %L, %L, current_date)', reg1, a, cls), 'affected=1'),
      ('A02','taken_by is set by the database',                   'postgres','count', format('select 1 from public.attendance_registers where id = %L and taken_by = %L', reg1, p_tch_h), 'rows=1'),
      ('A03','Mark student 1 absent (control)',                   'teacher_h','exec', format($q$insert into public.attendance_records (school_id, register_id, class_id, date, student_id, status) values (%L, %L, %L, current_date, %L, 'absent')$q$, a, reg1, cls, p_stu1), 'affected=1'),
      ('A04','Mark student 2 present (control)',                  'teacher_h','exec', format($q$insert into public.attendance_records (school_id, register_id, class_id, date, student_id, status) values (%L, %L, %L, date '2000-01-01', %L, 'present')$q$, a, reg1, cls, p_stu2), 'affected=1'),
      ('A05','Class and date always come from the register',      'postgres','count', format('select 1 from public.attendance_records where register_id = %L and date = current_date and class_id = %L', reg1, cls), 'rows=2'),
      ('A06','Mark a student who isn''t in the class',            'teacher_h','exec', format($q$insert into public.attendance_records (school_id, register_id, class_id, date, student_id) values (%L, %L, %L, current_date, %L)$q$, a, reg1, cls, p_stu3), 'denied'),
      ('A07','Subject teacher takes the register',                'teacher_s','exec', format('insert into public.attendance_registers (school_id, class_id, date) values (%L, %L, current_date - 1)', a, cls), 'denied'),
      ('A08','Other teacher adds a mark',                         'teacher_o','exec', format($q$update public.attendance_records set status = 'present' where register_id = %L$q$, reg1), 'affected=0'),
      ('A09','Register for a future date',                        'teacher_h','exec', format('insert into public.attendance_registers (school_id, class_id, date) values (%L, %L, current_date + 1)', a, cls), 'denied'),
      ('A10','Register before the academic year',                 'teacher_h','exec', format('insert into public.attendance_registers (school_id, class_id, date) values (%L, %L, current_date - 90)', a, cls), 'denied'),
      ('A11','School B admin takes a School A register',          'admin_b','exec',  format('insert into public.attendance_registers (school_id, class_id, date) values (%L, %L, current_date - 2)', a, cls), 'denied'),
      ('A12','Admin takes yesterday''s register (control)',       'admin_a','exec',  format('insert into public.attendance_registers (school_id, class_id, date) values (%L, %L, current_date - 1)', a, cls), 'affected=1'),
      ('V01','Student sees only their own mark',                  'student1','count','select 1 from public.attendance_records', 'rows=1'),
      ('V02','Other student sees only their own mark',            'student2','count','select 1 from public.attendance_records', 'rows=1'),
      ('V03','Parent sees their child''s mark',                   'parent','count',  format('select 1 from public.attendance_records where student_id = %L', p_stu1), 'rows=1'),
      ('V04','Parent sees no other student''s mark',              'parent','count',  format('select 1 from public.attendance_records where student_id <> %L', p_stu1), 'rows=0'),
      ('V05','Subject teacher of the class sees the marks',       'teacher_s','count','select 1 from public.attendance_records', 'rows=2'),
      ('V06','Unrelated teacher sees no marks',                   'teacher_o','count','select 1 from public.attendance_records', 'rows=0'),
      ('V07','School B admin sees no marks',                      'admin_b','count', 'select 1 from public.attendance_records', 'rows=0'),
      ('V08','Student changes own mark',                          'student1','exec', format($q$update public.attendance_records set status = 'present' where student_id = %L$q$, p_stu1), 'affected=0'),
      ('V09','Homeroom teacher corrects a mark (control)',        'teacher_h','exec', format($q$update public.attendance_records set status = 'excused' where student_id = %L$q$, p_stu1), 'affected=1'),
      ('V10','Students can''t read registers',                    'student1','count','select 1 from public.attendance_registers', 'rows=0'),
      ('AU1','Marks are audited',                                 'postgres','count', format($q$select 1 from public.audit_logs where action = 'attendance_records.insert' and user_id = %L$q$, tch_h), 'rows=2')
    ) as c(id, descr, actor, kind, sql, expected)
    loop
      v_actor := case t.actor when 'admin_a' then adm_a when 'teacher_h' then tch_h when 'teacher_s' then tch_s
        when 'teacher_o' then tch_o when 'student1' then stu1 when 'student2' then stu2 when 'parent' then par when 'admin_b' then adm_b end;
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

select * from pg_temp.educore_attendance_tests();
