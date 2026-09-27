-- =============================================================================
-- EduCore — Platform tools tests (migration 017)
--
-- Same approach as tenant_isolation.sql: throwaway fixtures, every case runs
-- as the real `authenticated` role with a forged JWT sub, and all data is
-- rolled back. Run as the postgres role:
--   psql "$DATABASE_URL" -f supabase/tests/platform.sql
-- =============================================================================

create or replace function pg_temp.educore_platform_tests()
returns table (test_id text, description text, expected text, actual text, result text)
language plpgsql
as $fn$
declare
  v_results jsonb := '[]'::jsonb;
  v_session text := session_user;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  sup uuid := gen_random_uuid(); adm uuid := gen_random_uuid(); tch uuid := gen_random_uuid();
  stu1 uuid := gen_random_uuid(); stu2 uuid := gen_random_uuid(); stu3 uuid := gen_random_uuid();
  adm_b uuid := gen_random_uuid(); newu uuid := gen_random_uuid(); newu2 uuid := gen_random_uuid();
  p_stu1 uuid; p_stu2 uuid; p_stu3 uuid;
  yr uuid := gen_random_uuid(); cls uuid := gen_random_uuid(); t1 uuid := gen_random_uuid(); t2 uuid := gen_random_uuid();
  reg uuid := gen_random_uuid();
  v_actor uuid; v_n bigint; v_actual text; t record;
  stats text;
begin
  begin
    insert into public.schools (id, name, code, slug, status, county) values
      (a, 'PL Test A', 'PLTEST-A', 'pl-test-a', 'active', 'Montserrado'),
      (b, 'PL Test B', 'PLTEST-B', 'pl-test-b', 'active', 'Bong');
    update public.school_settings set passing_score = 70 where school_id = a;
    insert into auth.users (id, instance_id, aud, role, email)
    select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.id || '@pl.test'
    from unnest(array[sup, adm, tch, stu1, stu2, stu3, adm_b, newu, newu2]) as x(id);
    insert into public.profiles (user_id, school_id, first_name, last_name, role, status) values
      (sup, null, 'T', 'Super', 'super_admin', 'active'),
      (adm, a, 'T', 'Adm', 'school_admin', 'active'), (tch, a, 'T', 'Tch', 'teacher', 'active'),
      (stu1, a, 'T', 'Stu1', 'student', 'active'), (stu2, a, 'T', 'Stu2', 'student', 'active'),
      (stu3, a, 'T', 'Stu3', 'student', 'active'), (adm_b, b, 'T', 'AdmB', 'school_admin', 'active');
    select id into p_stu1 from public.profiles where user_id = stu1;
    select id into p_stu2 from public.profiles where user_id = stu2;
    select id into p_stu3 from public.profiles where user_id = stu3;
    insert into public.student_profiles (school_id, profile_id, gender) values
      (a, p_stu1, 'female'), (a, p_stu2, 'female'), (a, p_stu3, 'male');

    insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current)
      values (yr, a, 'PL Year', current_date - 30, current_date + 300, true);
    insert into public.academic_terms (id, school_id, academic_year_id, name, sequence) values
      (t1, a, yr, 'First Semester', 1), (t2, a, yr, 'Second Semester', 2);
    insert into public.classes (id, school_id, academic_year_id, grade_level_id, name)
      select cls, a, yr, g.id, '10A' from public.grade_levels g where g.school_id = a and g.name = 'Grade 10';
    insert into public.enrollments (school_id, class_id, academic_year_id, student_id) values
      (a, cls, yr, p_stu1), (a, cls, yr, p_stu2), (a, cls, yr, p_stu3);

    stats := format('select 1 from public.platform_school_statistics() where school_id = %L', a);

    for t in select * from (values
      -- fixtures issued by the school admin (report cards and registers record who did it)
      ('F01','Admin issues S1 card, semester 1 (60)',        'admin','exec', format($q$insert into public.report_cards (school_id, student_id, class_id, academic_year_id, term_id, data, average, class_size) values (%L, %L, %L, %L, %L, '{}', 60, 3)$q$, a, p_stu1, cls, yr, t1), 'affected=1'),
      ('F02','Admin issues S1 card, semester 2 (75)',        'admin','exec', format($q$insert into public.report_cards (school_id, student_id, class_id, academic_year_id, term_id, data, average, class_size) values (%L, %L, %L, %L, %L, '{}', 75, 3)$q$, a, p_stu1, cls, yr, t2), 'affected=1'),
      ('F03','Admin issues S2 card, semester 1 (80)',        'admin','exec', format($q$insert into public.report_cards (school_id, student_id, class_id, academic_year_id, term_id, data, average, class_size) values (%L, %L, %L, %L, %L, '{}', 80, 3)$q$, a, p_stu2, cls, yr, t1), 'affected=1'),
      ('F04','Admin issues S3 card, semester 2 (69.4)',      'admin','exec', format($q$insert into public.report_cards (school_id, student_id, class_id, academic_year_id, term_id, data, average, class_size) values (%L, %L, %L, %L, %L, '{}', 69.4, 3)$q$, a, p_stu3, cls, yr, t2), 'affected=1'),
      ('F05','Admin takes a register',                       'admin','exec', format('insert into public.attendance_registers (id, school_id, class_id, date) values (%L, %L, %L, current_date - 3)', reg, a, cls), 'affected=1'),
      ('F06','…with present, late and absent marks',         'admin','exec', format($q$insert into public.attendance_records (school_id, register_id, class_id, date, student_id, status) values (%L, %L, %L, current_date, %L, 'present'), (%L, %L, %L, current_date, %L, 'late'), (%L, %L, %L, current_date, %L, 'absent')$q$, a, reg, cls, p_stu1, a, reg, cls, p_stu2, a, reg, cls, p_stu3), 'affected=3'),

      -- statistics
      ('T01','School admin reads platform statistics',       'admin','count',   'select 1 from public.platform_school_statistics()', 'denied'),
      ('T02','Student reads platform statistics',            'student1','count','select 1 from public.platform_school_statistics()', 'denied'),
      ('T03','Super admin: people counts',                   'super','count', stats || ' and students = 3 and female = 2 and male = 1 and teachers = 1 and admins = 1', 'rows=1'),
      ('T04','Super admin: current year, classes, enrolled', 'super','count', stats || ' and current_year = ''PL Year'' and classes = 1 and enrolled = 3', 'rows=1'),
      ('T05','Super admin: attendance marks',                'super','count', stats || ' and att_present = 1 and att_late = 1 and att_absent = 1 and att_excused = 0', 'rows=1'),
      ('T06','Pass rate uses each student''s latest card',   'super','count', stats || ' and graded_students = 3 and passed = 2 and passing_score = 70', 'rows=1'),
      ('T07','Empty school returns zeros, not nulls',        'super','count', format('select 1 from public.platform_school_statistics() where school_id = %L and students = 0 and graded_students = 0 and current_year is null', b), 'rows=1'),

      -- status changes
      ('S01','School admin suspends their own school',       'admin','exec',   format($q$select public.platform_set_school_status(%L, 'suspended')$q$, a), 'denied'),
      ('S02','Other school''s admin suspends it',            'admin_b','exec', format($q$select public.platform_set_school_status(%L, 'suspended')$q$, a), 'denied'),
      ('S03','Teacher suspends the school',                  'teacher','exec', format($q$select public.platform_set_school_status(%L, 'suspended')$q$, a), 'denied'),
      ('S04','Super admin suspends the school (control)',    'super','exec',   format($q$select public.platform_set_school_status(%L, 'suspended')$q$, a), 'affected=1'),
      ('S05','…the change is audited with the actor',        'postgres','count', format($q$select 1 from public.audit_logs where entity_id = %L and action = 'schools.update' and user_id = %L and new_data->>'status' = 'suspended'$q$, a, sup), 'rows=1'),
      ('S06','Suspended: admin sees no classes',             'admin','count',  'select 1 from public.classes', 'rows=0'),
      ('S07','Suspended: student sees no report cards',      'student1','count','select 1 from public.report_cards', 'rows=0'),
      ('S08','Suspended: admin cannot reactivate',           'admin','exec',   format($q$select public.platform_set_school_status(%L, 'active')$q$, a), 'denied'),
      ('S09','Super admin sets status back to pending',      'super','exec',   format($q$select public.platform_set_school_status(%L, 'pending')$q$, a), 'denied'),
      ('S10','Super admin changes an unknown school',        'super','exec',   format($q$select public.platform_set_school_status(%L, 'active')$q$, gen_random_uuid()), 'denied'),
      ('S11','Super admin reactivates (control)',            'super','exec',   format($q$select public.platform_set_school_status(%L, 'active')$q$, a), 'affected=1'),
      ('S12','Reactivated: admin sees the class again',      'admin','count',  'select 1 from public.classes', 'rows=1'),
      ('S13','School B still unaffected',                    'postgres','count', format($q$select 1 from public.schools where id = %L and status = 'active'$q$, b), 'rows=1'),

      -- add an administrator to an existing school
      ('M01','Super admin adds an admin to school B',        'super','exec',   format($q$select public.create_member(%L, %L, 'New', '', 'Admin', 'school_admin', 'newadmin', '', '')$q$, b, newu), 'affected=1'),
      ('M02','…the profile is an active admin of school B',  'postgres','count', format($q$select 1 from public.profiles where user_id = %L and school_id = %L and role = 'school_admin' and status = 'active'$q$, newu, b), 'rows=1'),
      ('M03','Super admin archives school B',                'super','exec',   format($q$select public.platform_set_school_status(%L, 'archived')$q$, b), 'affected=1'),
      ('M04','Archived: no new members can be added',        'super','exec',   format($q$select public.create_member(%L, %L, 'Late', '', 'Admin', 'school_admin', 'lateadmin', '', '')$q$, b, newu2), 'denied'),
      ('M05','Archived: its admin can''t see colleagues',     'admin_b','count', format('select 1 from public.profiles where user_id = %L', newu), 'rows=0')
    ) as c(id, descr, actor, kind, sql, expected)
    loop
      v_actor := case t.actor when 'super' then sup when 'admin' then adm when 'teacher' then tch
        when 'student1' then stu1 when 'admin_b' then adm_b end;
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

select * from pg_temp.educore_platform_tests();
