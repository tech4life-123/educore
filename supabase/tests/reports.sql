-- =============================================================================
-- EduCore — Reports aggregate tests (migration 018)
--
-- The report functions are SECURITY INVOKER: they must count only what the
-- caller could already read. Same harness as tenant_isolation.sql; all data
-- is rolled back. Run as the postgres role:
--   psql "$DATABASE_URL" -f supabase/tests/reports.sql
-- =============================================================================

create or replace function pg_temp.educore_report_tests()
returns table (test_id text, description text, expected text, actual text, result text)
language plpgsql
as $fn$
declare
  v_results jsonb := '[]'::jsonb;
  v_session text := session_user;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  adm uuid := gen_random_uuid(); tch uuid := gen_random_uuid(); stu1 uuid := gen_random_uuid(); stu2 uuid := gen_random_uuid();
  adm_b uuid := gen_random_uuid();
  p_stu1 uuid; p_stu2 uuid;
  yr uuid := gen_random_uuid(); cls uuid := gen_random_uuid(); reg1 uuid := gen_random_uuid(); reg2 uuid := gen_random_uuid();
  v_actor uuid; v_n bigint; v_actual text; t record;
begin
  begin
    insert into public.schools (id, name, code, slug, status) values
      (a, 'RP Test A', 'RPTEST-A', 'rp-test-a', 'active'), (b, 'RP Test B', 'RPTEST-B', 'rp-test-b', 'active');
    insert into auth.users (id, instance_id, aud, role, email)
    select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.id || '@rp.test'
    from unnest(array[adm, tch, stu1, stu2, adm_b]) as x(id);
    insert into public.profiles (user_id, school_id, first_name, last_name, role, status) values
      (adm, a, 'T', 'Adm', 'school_admin', 'active'), (tch, a, 'T', 'Other', 'teacher', 'active'),
      (stu1, a, 'T', 'Stu1', 'student', 'active'), (stu2, a, 'T', 'Stu2', 'student', 'active'),
      (adm_b, b, 'T', 'AdmB', 'school_admin', 'active');
    select id into p_stu1 from public.profiles where user_id = stu1;
    select id into p_stu2 from public.profiles where user_id = stu2;
    insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current)
      values (yr, a, 'RP Year', current_date - 60, current_date + 300, true);
    insert into public.classes (id, school_id, academic_year_id, grade_level_id, name)
      select cls, a, yr, g.id, '11A' from public.grade_levels g where g.school_id = a and g.name = 'Grade 11';
    insert into public.enrollments (school_id, class_id, academic_year_id, student_id) values (a, cls, yr, p_stu1), (a, cls, yr, p_stu2);

    for t in select * from (values
      ('F01','Admin takes two registers',                  'admin','exec', format('insert into public.attendance_registers (id, school_id, class_id, date) values (%L, %L, %L, current_date - 40), (%L, %L, %L, current_date - 2)', reg1, a, cls, reg2, a, cls), 'affected=2'),
      ('F02','…and marks both students twice',             'admin','exec', format($q$insert into public.attendance_records (school_id, register_id, class_id, date, student_id, status) values (%L,%L,%L,current_date,%L,'present'), (%L,%L,%L,current_date,%L,'absent'), (%L,%L,%L,current_date,%L,'late'), (%L,%L,%L,current_date,%L,'excused')$q$, a, reg1, cls, p_stu1, a, reg1, cls, p_stu2, a, reg2, cls, p_stu1, a, reg2, cls, p_stu2), 'affected=4'),
      ('R01','Admin: per-student totals',                  'admin','count', format('select 1 from public.report_attendance_by_student(%L)', yr), 'rows=2'),
      ('R02','Admin: student 1 has 1 present, 1 late',     'admin','count', format('select 1 from public.report_attendance_by_student(%L) where student_id = %L and present = 1 and late = 1 and absent = 0', yr, p_stu1), 'rows=1'),
      ('R03','Admin: all four marks counted by month',     'admin','count', format('select 1 from public.report_attendance_by_month(%L) having sum(present + late + absent + excused) = 4', yr), 'rows=1'),
      ('R04','School B admin sees none of school A',       'admin_b','count', format('select 1 from public.report_attendance_by_student(%L)', yr), 'rows=0'),
      ('R05','School B admin: no months either',           'admin_b','count', format('select 1 from public.report_attendance_by_month(%L)', yr), 'rows=0'),
      ('R06','Student counts only their own marks',        'student1','count', format('select 1 from public.report_attendance_by_student(%L)', yr), 'rows=1'),
      ('R07','Teacher not linked to the class sees none',  'teacher','count', format('select 1 from public.report_attendance_by_student(%L)', yr), 'rows=0'),
      ('R08','Anonymous caller cannot run it',             'anon','count', format('select 1 from public.report_attendance_by_student(%L)', yr), 'denied'),
      ('R09','Unknown year returns nothing',               'admin','count', format('select 1 from public.report_attendance_by_student(%L)', gen_random_uuid()), 'rows=0')
    ) as c(id, descr, actor, kind, sql, expected)
    loop
      v_actor := case t.actor when 'admin' then adm when 'teacher' then tch when 'student1' then stu1 when 'admin_b' then adm_b end;
      begin
        if t.actor = 'anon' then
          perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
          perform set_config('role', 'anon', true);
        elsif t.actor <> 'postgres' then
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

select * from pg_temp.educore_report_tests();
