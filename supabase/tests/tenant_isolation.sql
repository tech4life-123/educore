-- =============================================================================
-- EduCore — Tenant isolation & role restriction tests
--
-- Run against any EduCore database (local or hosted) as the `postgres` role,
-- e.g. in the Supabase SQL editor or with psql:
--
--   psql "$DATABASE_URL" -f supabase/tests/tenant_isolation.sql
--
-- How it works:
--   * Creates two throwaway schools and five throwaway auth users.
--   * For each case, switches to the real `authenticated` database role with a
--     forged JWT `sub` claim — exactly what PostgREST does for a browser
--     request — and runs the statement under RLS.
--   * ALL fixture data is rolled back at the end (sub-transaction), so the
--     script leaves nothing behind. Output: one row per test with PASS/FAIL.
-- =============================================================================

create or replace function pg_temp.educore_rls_tests()
returns table (test_id text, description text, expected text, actual text, result text)
language plpgsql
as $fn$
declare
  v_results   jsonb := '[]'::jsonb;
  v_school_a  uuid := gen_random_uuid();
  v_school_b  uuid := gen_random_uuid();
  v_admin_a   uuid := gen_random_uuid();
  v_teacher_a uuid := gen_random_uuid();
  v_student_a uuid := gen_random_uuid();
  v_admin_b   uuid := gen_random_uuid();
  v_super     uuid := gen_random_uuid();
  v_session   text := session_user;
  v_actor     uuid;
  v_n         bigint;
  v_actual    text;
  t           record;
begin
  begin
    -- ---------------------------------------------------------------- fixtures
    insert into public.schools (id, name, code, slug, status)
    values (v_school_a, 'RLS Test School A', 'RLSTEST-A', 'rls-test-school-a', 'active'),
           (v_school_b, 'RLS Test School B', 'RLSTEST-B', 'rls-test-school-b', 'active');

    insert into auth.users (id, instance_id, aud, role, email)
    values (v_admin_a,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-admin-a@educore.test'),
           (v_teacher_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-teacher-a@educore.test'),
           (v_student_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-student-a@educore.test'),
           (v_admin_b,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-admin-b@educore.test'),
           (v_super,     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-super@educore.test');

    insert into public.profiles (user_id, school_id, first_name, last_name, role, status)
    values (v_admin_a,   v_school_a, 'Test', 'AdminA',   'school_admin', 'active'),
           (v_teacher_a, v_school_a, 'Test', 'TeacherA', 'teacher',      'active'),
           (v_student_a, v_school_a, 'Test', 'StudentA', 'student',      'active'),
           (v_admin_b,   v_school_b, 'Test', 'AdminB',   'school_admin', 'active'),
           (v_super,     null,       'Test', 'Super',    'super_admin',  'active');

    -- ------------------------------------------------------------------ cases
    -- actor: admin_a | teacher_a | student_a | admin_b | super | anon | postgres
    -- kind : count (row query; result rows=N) | exec (result affected=N)
    for t in
      select * from (values
        -- Test A — cross-tenant READ
        ('A1', 'School A admin reads School B row',              'admin_a',   'count', format('select 1 from public.schools where id = %L', v_school_b),          'rows=0'),
        ('A2', 'School A admin lists all schools (sees only A)', 'admin_a',   'count', 'select 1 from public.schools',                                          'rows=1'),
        ('A3', 'School A admin reads School B profiles',         'admin_a',   'count', format('select 1 from public.profiles where school_id = %L', v_school_b), 'rows=0'),
        ('A4', 'School A admin reads School B settings',         'admin_a',   'count', format('select 1 from public.school_settings where school_id = %L', v_school_b), 'rows=0'),
        ('A5', 'School A admin reads School B audit log',        'admin_a',   'count', format('select 1 from public.audit_logs where school_id = %L', v_school_b), 'rows=0'),
        ('A6', 'School B admin reads School A row',              'admin_b',   'count', format('select 1 from public.schools where id = %L', v_school_a),          'rows=0'),
        -- Test B — cross-tenant WRITE
        ('B1', 'School A admin updates School B name',           'admin_a',   'exec',  format('update public.schools set name = %L where id = %L', 'Hacked', v_school_b), 'affected=0'),
        ('B2', 'School A admin updates School B settings',       'admin_a',   'exec',  format('update public.school_settings set passing_score = 1 where school_id = %L', v_school_b), 'affected=0'),
        ('B3', 'School A admin renames a School B user',         'admin_a',   'exec',  format('update public.profiles set first_name = %L where school_id = %L', 'Hacked', v_school_b), 'affected=0'),
        ('B4', 'School A admin inserts a school',                'admin_a',   'exec',  $q$insert into public.schools (name, code, slug) values ('Rogue', 'ROGUE', 'rogue')$q$, 'denied'),
        ('B5', 'School A admin deletes School B',                'admin_a',   'exec',  format('delete from public.schools where id = %L', v_school_b),            'denied'),
        ('B6', 'School A admin moves own school code/slug',      'admin_a',   'exec',  format('update public.schools set slug = %L where id = %L', 'taken', v_school_a), 'denied'),
        -- Test D — student vs administrative functionality
        ('D1', 'Student updates own school details',             'student_a', 'exec',  format('update public.schools set name = %L where id = %L', 'Hacked', v_school_a), 'affected=0'),
        ('D2', 'Student updates school settings',                'student_a', 'exec',  format('update public.school_settings set passing_score = 1 where school_id = %L', v_school_a), 'affected=0'),
        ('D3', 'Student reads school audit log',                 'student_a', 'count', 'select 1 from public.audit_logs',                                        'rows=0'),
        ('D4', 'Student lists profiles (sees only self)',        'student_a', 'count', 'select 1 from public.profiles',                                          'rows=1'),
        ('D5', 'Student renames another user in own school',     'student_a', 'exec',  format('update public.profiles set first_name = %L where user_id = %L', 'Hacked', v_admin_a), 'affected=0'),
        ('D6', 'Teacher lists profiles in own school (control)', 'teacher_a', 'count', 'select 1 from public.profiles',                                          'rows=3'),
        ('D7', 'Teacher updates school settings',                'teacher_a', 'exec',  format('update public.school_settings set passing_score = 1 where school_id = %L', v_school_a), 'affected=0'),
        ('D8', 'Admin updates own school name (control)',        'admin_a',   'exec',  format('update public.schools set name = %L where id = %L', 'RLS Test School A (renamed)', v_school_a), 'affected=1'),
        ('D9', 'Admin reads own school audit log (control)',     'admin_a',   'count', 'select 1 from public.audit_logs where action = ''schools.update''',       'rows=1'),
        -- Test E — self-escalation
        ('E1', 'Student sets own role to super_admin',           'student_a', 'exec',  format('update public.profiles set role = %L where user_id = %L', 'super_admin', v_student_a), 'denied'),
        ('E2', 'Admin sets own role to super_admin',             'admin_a',   'exec',  format('update public.profiles set role = %L where user_id = %L', 'super_admin', v_admin_a), 'denied'),
        ('E3', 'Student moves self to School B',                 'student_a', 'exec',  format('update public.profiles set school_id = %L where user_id = %L', v_school_b, v_student_a), 'denied'),
        ('E4', 'Student reactivates / changes own status',       'student_a', 'exec',  format('update public.profiles set status = %L where user_id = %L', 'active', v_student_a), 'denied'),
        ('E5', 'Student inserts a super_admin profile',          'student_a', 'exec',  format('insert into public.profiles (user_id, first_name, last_name, role, status) values (%L, ''X'', ''Y'', ''super_admin'', ''active'')', v_student_a), 'denied'),
        ('E6', 'Student writes to audit log',                    'student_a', 'exec',  $q$insert into public.audit_logs (action, entity_type) values ('fake.event', 'x')$q$, 'denied'),
        ('E7', 'Student edits own name (control)',               'student_a', 'exec',  format('update public.profiles set first_name = %L where user_id = %L', 'Renamed', v_student_a), 'affected=1'),
        -- Super admin — no cross-tenant access through the browser-facing API
        ('S1', 'Super admin lists schools via RLS',              'super',     'count', 'select 1 from public.schools',                                          'rows=0'),
        ('S2', 'Super admin lists other profiles via RLS',       'super',     'count', 'select 1 from public.profiles',                                          'rows=1'),
        -- Anonymous
        ('N1', 'Anonymous reads schools',                        'anon',      'count', 'select 1 from public.schools',                                          'denied'),
        ('N2', 'Anonymous reads profiles',                       'anon',      'count', 'select 1 from public.profiles',                                         'denied'),
        -- Lifecycle — suspended school loses access
        ('L1', '(setup) Platform suspends School B',             'postgres',  'exec',  format('update public.schools set status = %L where id = %L', 'suspended', v_school_b), 'affected=1'),
        ('L2', 'School B admin reads own school after suspension','admin_b',  'count', 'select 1 from public.schools',                                          'rows=0'),
        -- Audit trail content
        ('U1', 'Audit row records who/what/old/new for D8',      'postgres',  'count', format($q$select 1 from public.audit_logs where action = 'schools.update' and user_id = %L and entity_id = %L and old_data->>'name' = 'RLS Test School A' and new_data->>'name' = 'RLS Test School A (renamed)'$q$, v_admin_a, v_school_a), 'rows=1'),
        ('U2', 'Audit log is append-only (even for postgres)',   'postgres',  'exec',  format('delete from public.audit_logs where school_id = %L', v_school_a), 'denied'),
        ('U3', 'Deleting a school with history is blocked',      'postgres',  'exec',  format('delete from public.schools where id = %L', v_school_a),            'denied')
      ) as c(id, descr, actor, kind, sql, expected)
    loop
      v_actor := case t.actor
        when 'admin_a'   then v_admin_a
        when 'teacher_a' then v_teacher_a
        when 'student_a' then v_student_a
        when 'admin_b'   then v_admin_b
        when 'super'     then v_super
      end;

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
        else
          execute t.sql;
          get diagnostics v_n = row_count;
          v_actual := 'affected=' || v_n;
        end if;
      exception when others then
        v_actual := 'denied (' || sqlstate || ')';
      end;

      perform set_config('role', v_session, true);
      perform set_config('request.jwt.claims', '', true);

      v_results := v_results || jsonb_build_object(
        'id', t.id, 'descr', t.descr, 'expected', t.expected, 'actual', v_actual,
        'result', case
          when t.expected = 'denied' and v_actual like 'denied%' then 'PASS'
          when t.expected = v_actual then 'PASS'
          else 'FAIL' end);
    end loop;

    -- Discard every fixture and side effect.
    raise exception using errcode = 'P0001', message = '__educore_rollback__';
  exception when sqlstate 'P0001' then
    if sqlerrm <> '__educore_rollback__' then raise; end if;
  end;

  return query
    select e->>'id', e->>'descr', e->>'expected', e->>'actual', e->>'result'
    from jsonb_array_elements(v_results) e;
end;
$fn$;

select * from pg_temp.educore_rls_tests();
