-- =============================================================================
-- EduCore — AI usage log tests (migration …_ai_usage_events)
--
-- Same harness as tenant_isolation.sql: throwaway fixtures, cases run as the
-- real `authenticated`/`anon` roles with a forged JWT sub, everything rolled
-- back. Run as the postgres role.
-- =============================================================================

create or replace function pg_temp.educore_ai_usage_tests()
returns table (test_id text, description text, expected text, actual text, result text)
language plpgsql
as $fn$
declare
  v_results jsonb := '[]'::jsonb;
  v_session text := session_user;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  sup uuid := gen_random_uuid(); adm uuid := gen_random_uuid(); tch uuid := gen_random_uuid();
  stu uuid := gen_random_uuid(); adm_b uuid := gen_random_uuid();
  p_sup uuid; p_adm uuid; p_tch uuid; p_stu uuid; p_adm_b uuid;
  v_actor uuid; v_n bigint; v_actual text; t record;
begin
  begin
    insert into public.schools (id, name, code, slug, status) values
      (a, 'AIU Test A', 'AIUTEST-A', 'aiu-test-a', 'active'), (b, 'AIU Test B', 'AIUTEST-B', 'aiu-test-b', 'active');
    insert into auth.users (id, instance_id, aud, role, email)
    select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.id || '@aiu.test'
    from unnest(array[sup, adm, tch, stu, adm_b]) as x(id);
    insert into public.profiles (user_id, school_id, first_name, last_name, role, status) values
      (sup, null, 'T', 'Super', 'super_admin', 'active'), (adm, a, 'T', 'Adm', 'school_admin', 'active'),
      (tch, a, 'T', 'Tch', 'teacher', 'active'), (stu, a, 'T', 'Stu', 'student', 'active'),
      (adm_b, b, 'T', 'AdmB', 'school_admin', 'active');
    select id into p_sup from public.profiles where user_id = sup;
    select id into p_adm from public.profiles where user_id = adm;
    select id into p_tch from public.profiles where user_id = tch;
    select id into p_stu from public.profiles where user_id = stu;
    select id into p_adm_b from public.profiles where user_id = adm_b;

    -- Written by the server (service role) in the app; here by postgres.
    insert into public.ai_usage_events (profile_id, school_id, role, kind, provider, model, status, input_tokens, output_tokens) values
      (p_stu, a, 'student', 'chat', 'anthropic', 'm', 'ok', 100, 50),
      (p_tch, a, 'teacher', 'chat', 'anthropic', 'm', 'ok', 100, 50),
      (p_adm, a, 'school_admin', 'chat', 'anthropic', 'm', 'error', 0, 0),
      (p_adm_b, b, 'school_admin', 'chat', 'anthropic', 'm', 'ok', 10, 5),
      (p_sup, null, 'super_admin', 'check', 'anthropic', 'm', 'ok', 10, 1);

    for t in select * from (values
      ('U01','Student reads only their own usage',            'student','count', 'select 1 from public.ai_usage_events', 'rows=1'),
      ('U02','Teacher reads only their own usage',            'teacher','count', 'select 1 from public.ai_usage_events', 'rows=1'),
      ('U03','School admin reads their whole school',         'admin','count',   'select 1 from public.ai_usage_events', 'rows=3'),
      ('U04','Other school''s admin sees none of school A',   'admin_b','count', format('select 1 from public.ai_usage_events where school_id = %L', a), 'rows=0'),
      ('U05','Super admin has no RLS powers (own row only)',  'super','count',   'select 1 from public.ai_usage_events', 'rows=1'),
      ('U06','Student writes a usage row',                    'student','exec',  format($q$insert into public.ai_usage_events (profile_id, school_id, role, kind, provider, model, status) values (%L, %L, 'student', 'chat', 'x', 'x', 'ok')$q$, p_stu, a), 'denied'),
      ('U07','Student zeroes their own token count',          'student','exec',  'update public.ai_usage_events set input_tokens = 0', 'denied'),
      ('U08','Student erases their own usage',                'student','exec',  'delete from public.ai_usage_events', 'denied'),
      ('U09','School admin erases school usage',              'admin','exec',    'delete from public.ai_usage_events', 'denied'),
      ('U10','Anonymous visitor reads usage',                 'anon','count',    'select 1 from public.ai_usage_events', 'denied'),
      ('U11','Row for a school user without a school',        'postgres','exec', format($q$insert into public.ai_usage_events (profile_id, school_id, role, kind, provider, model, status) values (%L, null, 'teacher', 'chat', 'x', 'x', 'ok')$q$, p_tch), 'denied'),
      ('U12','Unknown status value',                          'postgres','exec', format($q$insert into public.ai_usage_events (profile_id, school_id, role, kind, provider, model, status) values (%L, %L, 'teacher', 'chat', 'x', 'x', 'maybe')$q$, p_tch, a), 'denied'),
      ('U13','No column can hold conversation text',          'postgres','count', $q$select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ai_usage_events' and column_name in ('prompt','question','answer','content','message','messages','response')$q$, 'rows=0')
    ) as c(id, descr, actor, kind, sql, expected)
    loop
      v_actor := case t.actor when 'super' then sup when 'admin' then adm when 'teacher' then tch when 'student' then stu when 'admin_b' then adm_b end;
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

select * from pg_temp.educore_ai_usage_tests();
