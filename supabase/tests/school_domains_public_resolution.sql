-- =============================================================================
-- EduCore — Public hostname resolution tests (migration: school_domains_public_resolution)
--
-- Same approach as the other per-feature suites: throwaway fixtures, every
-- case runs as the real `anon` role, and all data is rolled back. Run as the
-- postgres role:
--   psql "$DATABASE_URL" -f supabase/tests/school_domains_public_resolution.sql
-- =============================================================================

create or replace function pg_temp.educore_public_resolution_tests()
returns table (test_id text, description text, expected text, actual text, result text)
language plpgsql
as $fn$
declare
  v_results jsonb := '[]'::jsonb;
  v_session text := session_user;
  active_school uuid := gen_random_uuid();
  suspended_school uuid := gen_random_uuid();
  v_n bigint; v_actual text; t record;
begin
  begin
    insert into public.schools (id, name, code, slug, status) values
      (active_school, 'PR Active', 'PRTEST-A', 'pr-active', 'active'),
      (suspended_school, 'PR Suspended', 'PRTEST-S', 'pr-suspended', 'suspended');

    insert into public.school_domains (school_id, domain, domain_type, verification_status, ssl_status) values
      (active_school,    'verified.educore.com',   'subdomain', 'verified', 'issued'),
      (active_school,     'pending.edu.lr',          'custom',    'pending',  'pending'),
      (suspended_school, 'suspended.educore.com',  'subdomain', 'verified', 'issued');

    for t in select * from (values
      ('R01','Anon resolves a verified domain of an active school', 'count', $q$select 1 from public.school_domains where domain = 'verified.educore.com'$q$, 'rows=1'),
      ('R02','…and gets the right school_id back',                  'count', format($q$select 1 from public.school_domains where domain = 'verified.educore.com' and school_id = %L$q$, active_school), 'rows=1'),
      ('R03','Anon cannot resolve a PENDING domain',                'count', $q$select 1 from public.school_domains where domain = 'pending.edu.lr'$q$, 'rows=0'),
      ('R04','Anon cannot resolve a verified domain of a SUSPENDED school', 'count', $q$select 1 from public.school_domains where domain = 'suspended.educore.com'$q$, 'rows=0'),
      ('R05','Anon cannot read a column outside the grant',         'exec', $q$select verification_status from public.school_domains where domain = 'verified.educore.com'$q$, 'denied'),
      ('R06','Anon cannot read ssl_status either',                  'exec', $q$select ssl_status from public.school_domains where domain = 'verified.educore.com'$q$, 'denied'),
      ('R07','Anon cannot insert a domain row',                     'exec', format($q$insert into public.school_domains (school_id, domain, domain_type) values (%L, 'sneaky.educore.com', 'custom')$q$, active_school), 'denied'),
      ('R08','Anon cannot update a domain row',                     'exec', $q$update public.school_domains set is_primary = true where domain = 'verified.educore.com'$q$, 'denied'),
      ('R09','Anon cannot delete a domain row',                     'exec', $q$delete from public.school_domains where domain = 'verified.educore.com'$q$, 'denied')
    ) as c(id, descr, kind, sql, expected)
    loop
      begin
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        perform set_config('role', 'anon', true);
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

select * from pg_temp.educore_public_resolution_tests();
