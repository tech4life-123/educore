-- =============================================================================
-- EduCore — User-management authorization tests (migration 005)
--
-- Same approach as tenant_isolation.sql: throwaway fixtures, every case runs
-- as the real `authenticated`/`anon` role with a forged JWT sub, and all data
-- is rolled back. Run as the postgres role:
--   psql "$DATABASE_URL" -f supabase/tests/user_management.sql
-- =============================================================================

create or replace function pg_temp.educore_user_mgmt_tests()
returns table (test_id text, description text, expected text, actual text, result text)
language plpgsql
as $fn$
declare
  v_results jsonb := '[]'::jsonb;
  v_session text := session_user;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();                 -- schools
  adm_a uuid := gen_random_uuid(); tch_a uuid := gen_random_uuid();
  stu_a uuid := gen_random_uuid(); adm_b uuid := gen_random_uuid();
  stu_b uuid := gen_random_uuid(); sup uuid := gen_random_uuid();
  n1 uuid := gen_random_uuid(); n2 uuid := gen_random_uuid(); n3 uuid := gen_random_uuid();
  n4 uuid := gen_random_uuid(); n5 uuid := gen_random_uuid(); n6 uuid := gen_random_uuid();
  p_stu_a uuid; p_stu_b uuid; p_adm_a uuid; p_adm_b uuid; p_sup uuid;
  v_actor uuid; v_n bigint; v_actual text; t record;
begin
  begin
    insert into public.schools (id, name, code, slug, status) values
      (a, 'UM Test A', 'UMTEST-A', 'um-test-a', 'active'),
      (b, 'UM Test B', 'UMTEST-B', 'um-test-b', 'active');

    insert into auth.users (id, instance_id, aud, role, email)
    select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.id || '@um.test'
    from unnest(array[adm_a, tch_a, stu_a, adm_b, stu_b, sup, n1, n2, n3, n4, n5, n6]) as x(id);

    insert into public.profiles (user_id, school_id, first_name, last_name, role, status, username) values
      (adm_a, a, 'T', 'AdminA', 'school_admin', 'active', 'admin.a'),
      (tch_a, a, 'T', 'TeacherA', 'teacher', 'active', 'teacher.a'),
      (stu_a, a, 'T', 'StudentA', 'student', 'active', 'stu001'),
      (adm_b, b, 'T', 'AdminB', 'school_admin', 'active', 'admin.b'),
      (stu_b, b, 'T', 'StudentB', 'student', 'active', 'stu900'),
      (sup, null, 'T', 'Super', 'super_admin', 'active', null);

    select id into p_stu_a from public.profiles where user_id = stu_a;
    select id into p_stu_b from public.profiles where user_id = stu_b;
    select id into p_adm_a from public.profiles where user_id = adm_a;
    select id into p_adm_b from public.profiles where user_id = adm_b;
    select id into p_sup   from public.profiles where user_id = sup;

    for t in select * from (values
      -- create_member
      ('M01','Admin A creates a student in School A',          'admin_a',  'exec', format($q$select public.create_member(%L,%L,'New','','Student','student','stu002',null,null)$q$, a, n1), 'affected=1'),
      ('M02','Admin A creates a user in School B',             'admin_a',  'exec', format($q$select public.create_member(%L,%L,'X','','Y','student','intruder',null,null)$q$, b, n2), 'denied'),
      ('M03','Teacher creates a user',                         'teacher_a','exec', format($q$select public.create_member(%L,%L,'X','','Y','student','byteacher',null,null)$q$, a, n2), 'denied'),
      ('M04','Student creates a user',                         'student_a','exec', format($q$select public.create_member(%L,%L,'X','','Y','student','bystudent',null,null)$q$, a, n2), 'denied'),
      ('M05','Admin A creates a super_admin',                  'admin_a',  'exec', format($q$select public.create_member(%L,%L,'X','','Y','super_admin','boss',null,null)$q$, a, n2), 'denied'),
      ('M06','Admin creates user with no username/email',      'admin_a',  'exec', format($q$select public.create_member(%L,%L,'X','','Y','teacher',null,null,null)$q$, a, n2), 'denied'),
      ('M07','Duplicate username in same school',              'admin_a',  'exec', format($q$select public.create_member(%L,%L,'X','','Y','student','stu001',null,null)$q$, a, n2), 'denied'),
      ('M08','Same username in another school (control)',      'admin_b',  'exec', format($q$select public.create_member(%L,%L,'X','','Y','student','stu001',null,null)$q$, b, n3), 'affected=1'),
      ('M09','(setup) School A turns parent accounts off',     'postgres', 'exec', format($q$update public.school_settings set allow_parent_accounts = false where school_id = %L$q$, a), 'affected=1'),
      ('M10','Admin A creates parent while disabled',          'admin_a',  'exec', format($q$select public.create_member(%L,%L,'X','','Y','parent','parent1',null,null)$q$, a, n4), 'denied'),
      ('M11','Super admin creates user in School B (control)', 'super',    'exec', format($q$select public.create_member(%L,%L,'X','','Y','teacher',null,'teacher@um.test',null)$q$, b, n5), 'affected=1'),
      ('M12','Anonymous calls create_member',                  'anon',     'exec', format($q$select public.create_member(%L,%L,'X','','Y','student','anonuser',null,null)$q$, a, n6), 'denied'),
      -- set_member_status
      ('S01','Admin A suspends own-school student (control)',  'admin_a',  'exec', format($q$select public.set_member_status(%L,'suspended')$q$, p_stu_a), 'affected=1'),
      ('S02','Suspended student can no longer read school',    'student_a','count','select 1 from public.schools', 'rows=0'),
      ('S03','Admin A suspends School B student',              'admin_a',  'exec', format($q$select public.set_member_status(%L,'suspended')$q$, p_stu_b), 'denied'),
      ('S04','Admin A suspends themself',                      'admin_a',  'exec', format($q$select public.set_member_status(%L,'suspended')$q$, p_adm_a), 'denied'),
      ('S05','Admin A suspends the super admin',               'admin_a',  'exec', format($q$select public.set_member_status(%L,'suspended')$q$, p_sup), 'denied'),
      ('S06','Teacher suspends a student',                     'teacher_a','exec', format($q$select public.set_member_status(%L,'suspended')$q$, p_stu_a), 'denied'),
      ('S07','Status change audited with acting admin',        'postgres', 'count', format($q$select 1 from public.audit_logs where action = 'profiles.update' and user_id = %L and entity_id = %L and new_data->>'status' = 'suspended'$q$, adm_a, p_stu_a), 'rows=1'),
      -- require_password_change
      ('R01','Admin A resets School B student password',       'admin_a',  'exec', format($q$select public.require_password_change(%L)$q$, p_stu_b), 'denied'),
      ('R02','Admin A resets own-school student (control)',    'admin_a',  'exec', format($q$select public.require_password_change(%L)$q$, p_stu_a), 'affected=1'),
      ('R03','Student resets another user',                    'student_a','exec', format($q$select public.require_password_change(%L)$q$, p_adm_a), 'denied'),
      -- identity columns
      ('I01','Student clears own must_change_password',        'student_a','exec', format($q$update public.profiles set must_change_password = false where user_id = %L$q$, stu_a), 'denied'),
      ('I02','Student changes own username',                   'student_a','exec', format($q$update public.profiles set username = 'hacker' where user_id = %L$q$, stu_a), 'denied'),
      -- platform_create_school
      ('P01','School admin creates a school',                  'admin_a',  'exec', $q$select public.platform_create_school('Rogue','ROGUE-1','rogue-1','high_school',null,null,null,null,null)$q$, 'denied'),
      ('P02','Student creates a school',                       'student_a','exec', $q$select public.platform_create_school('Rogue','ROGUE-2','rogue-2','high_school',null,null,null,null,null)$q$, 'denied'),
      ('P03','Super admin creates a school (control)',         'super',    'exec', $q$select public.platform_create_school('UM New School','UMTEST-NEW','um-test-new','high_school','Motto','Gbarnga','Bong','Liberia','#047857')$q$, 'affected=1'),
      ('P04','New school got default settings',                'postgres', 'count', $q$select 1 from public.school_settings s join public.schools x on x.id = s.school_id where x.code = 'UMTEST-NEW'$q$, 'rows=1')
    ) as c(id, descr, actor, kind, sql, expected)
    loop
      v_actor := case t.actor when 'admin_a' then adm_a when 'teacher_a' then tch_a when 'student_a' then stu_a
                              when 'admin_b' then adm_b when 'super' then sup end;
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
        v_actual := 'denied (' || sqlstate || ': ' || left(sqlerrm, 60) || ')';
      end;
      perform set_config('role', v_session, true);
      perform set_config('request.jwt.claims', '', true);

      v_results := v_results || jsonb_build_object('id', t.id, 'descr', t.descr, 'expected', t.expected,
        'actual', v_actual, 'result',
        case when t.expected = 'denied' and v_actual like 'denied%' then 'PASS'
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

select * from pg_temp.educore_user_mgmt_tests();
