-- =============================================================================
-- EduCore — Automatic school subdomain tests (migration: provision_school_subdomains)
-- Throwaway fixtures, every case runs under a forged JWT, all rolled back.
--   psql "$DATABASE_URL" -f supabase/tests/subdomains.sql
-- =============================================================================

create or replace function pg_temp.educore_subdomain_tests()
returns table (test_id text, description text, expected text, actual text, result text)
language plpgsql
as $fn$
declare
  v_results jsonb := '[]'::jsonb;
  v_session text := session_user;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); r uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  adm_a uuid := gen_random_uuid(); sup uuid := gen_random_uuid();
  v_actor uuid; v_n bigint; v_actual text; t record;
begin
  begin
    insert into public.schools (id, name, code, slug, status) values
      (a, 'SB A', 'SBTEST-A', 'sb-test-a', 'active'),
      (b, 'SB B', 'SBTEST-B', 'sb-test-b', 'active'),
      (c, 'SB C', 'SBTEST-C', 'sb-test-c', 'active'),
      (r, 'SB Reserved', 'SBTEST-R', 'www', 'active'),
      (s, 'SB Suspended', 'SBTEST-S', 'sb-test-s', 'suspended');
    insert into auth.users (id, instance_id, aud, role, email)
    select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.id || '@sb.test'
    from unnest(array[adm_a, sup]) as x(id);
    insert into public.profiles (user_id, school_id, first_name, last_name, role, status) values
      (adm_a, a, 'T', 'AdmA', 'school_admin', 'active'), (sup, null, 'T', 'Sup', 'super_admin', 'active');
    -- School B already has a primary custom domain; C already has a subdomain.
    insert into public.school_domains (school_id, domain, domain_type, is_primary, verification_status, ssl_status) values
      (b, 'www.sbtest-b.edu.lr', 'custom', true, 'verified', 'issued'),
      (c, 'old-c.example.test', 'subdomain', true, 'verified', 'issued');

    for t in select * from (values
      ('U01','A school admin cannot provision a subdomain',          'adm_a','exec', format($q$select public.platform_provision_subdomain(%L, 'schools.example.test')$q$, a), 'denied'),
      ('U02','A school admin cannot run the batch',                  'adm_a','exec', $q$select public.platform_provision_missing_subdomains('schools.example.test')$q$, 'denied'),
      ('U03','Anonymous cannot provision',                           'anon', 'exec', format($q$select public.platform_provision_subdomain(%L, 'schools.example.test')$q$, a), 'denied'),
      ('U04','Super admin provisions a subdomain (control)',         'sup',  'exec', format($q$select public.platform_provision_subdomain(%L, 'schools.example.test')$q$, a), 'affected=1'),
      ('U05','...it is slug.base, verified, issued and primary',     'postgres','count', format($q$select 1 from public.school_domains where school_id = %L and domain = 'sb-test-a.schools.example.test' and domain_type = 'subdomain' and verification_status = 'verified' and ssl_status = 'issued' and is_primary$q$, a), 'rows=1'),
      ('U06','Asking again returns it and adds nothing',             'sup',  'exec', format($q$select public.platform_provision_subdomain(%L, 'schools.example.test')$q$, a), 'affected=1'),
      ('U07','...still exactly one subdomain row',                   'postgres','count', format($q$select 1 from public.school_domains where school_id = %L and domain_type = 'subdomain'$q$, a), 'rows=1'),
      ('U08','A school with its own primary keeps it',               'sup',  'exec', format($q$select public.platform_provision_subdomain(%L, 'schools.example.test')$q$, b), 'affected=1'),
      ('U09','...the new subdomain is not made primary',             'postgres','count', format($q$select 1 from public.school_domains where school_id = %L and domain_type = 'subdomain' and not is_primary$q$, b), 'rows=1'),
      ('U10','A reserved name is refused',                           'sup',  'exec', format($q$select public.platform_provision_subdomain(%L, 'schools.example.test')$q$, r), 'denied'),
      ('U11','A bad base domain is refused',                         'sup',  'exec', format($q$select public.platform_provision_subdomain(%L, 'not a domain')$q$, c), 'denied'),
      ('U12','A base with a scheme is refused',                      'sup',  'exec', format($q$select public.platform_provision_subdomain(%L, 'https://schools.example.test')$q$, c), 'denied'),
      ('U13','An unknown school is refused',                         'sup',  'exec', format($q$select public.platform_provision_subdomain(%L, 'schools.example.test')$q$, gen_random_uuid()), 'denied'),
      ('U14','The base is lower-cased',                              'sup',  'exec', format($q$select public.platform_provision_subdomain(%L, 'Schools.Example.TEST')$q$, c), 'affected=1'),
      ('U15','...and a school that already had one keeps its old one','postgres','count', format($q$select 1 from public.school_domains where school_id = %L and domain = 'old-c.example.test'$q$, c), 'rows=1'),
      ('U16','Batch skips reserved, suspended and already-done schools','sup','exec', $q$select public.platform_provision_missing_subdomains('schools.example.test')$q$, 'affected=1'),
      ('U17','...no subdomain was made for the suspended school',    'postgres','count', format($q$select 1 from public.school_domains where school_id = %L$q$, s), 'rows=0'),
      ('U18','...or for the reserved name',                          'postgres','count', format($q$select 1 from public.school_domains where school_id = %L$q$, r), 'rows=0'),
      ('U19','The batch is repeatable and finds nothing new',        'sup',  'val',  $q$select public.platform_provision_missing_subdomains('schools.example.test')$q$, '0'),
      ('U20','The public page function now finds the new address',   'anon', 'count', $q$select 1 from public.public_school_site('sb-test-a.schools.example.test')$q$, 'rows=1')
    ) as c(id, descr, actor, kind, sql, expected)
    loop
      v_actor := case t.actor when 'adm_a' then adm_a when 'sup' then sup end;
      begin
        if t.actor = 'anon' then
          perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
          perform set_config('role', 'anon', true);
        elsif t.actor <> 'postgres' then
          perform set_config('request.jwt.claims', json_build_object('sub', v_actor, 'role','authenticated')::text, true);
          perform set_config('role', 'authenticated', true);
        end if;
        if t.kind = 'count' then
          execute 'select count(*) from (' || t.sql || ') s' into v_n;
          v_actual := 'rows=' || v_n;
        elsif t.kind = 'val' then
          execute t.sql into v_actual;
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

select * from pg_temp.educore_subdomain_tests();
