-- =============================================================================
-- EduCore — Public school page function tests (migration: public_school_site)
-- Throwaway fixtures, every case runs as the real `anon` role, all rolled back.
--   psql "$DATABASE_URL" -f supabase/tests/public_school_site.sql
-- =============================================================================

create or replace function pg_temp.educore_public_site_tests()
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
    insert into public.schools (id, name, code, slug, status, motto, phone, email, primary_color) values
      (active_school, 'PS Active', 'PSTEST-A', 'ps-active', 'active', 'Learn well', '+231770000000', 'office@psactive.test', '#112233'),
      (suspended_school, 'PS Suspended', 'PSTEST-S', 'ps-suspended', 'suspended', null, null, null, null);

    insert into public.school_domains (school_id, domain, domain_type, verification_status, ssl_status) values
      (active_school,    'site.psactive.test',    'custom',    'verified', 'issued'),
      (active_school,    'pending.psactive.test', 'custom',    'pending',  'pending'),
      (active_school,    'failed.psactive.test',  'custom',    'failed',   'pending'),
      (suspended_school, 'site.pssusp.test',      'custom',    'verified', 'issued');

    for t in select * from (values
      ('S01','Anon gets the public profile of a verified domain',      'count', $q$select 1 from public.public_school_site('site.psactive.test')$q$, 'rows=1'),
      ('S02','...with the right name',                                 'count', $q$select 1 from public.public_school_site('site.psactive.test') where name = 'PS Active' and motto = 'Learn well'$q$, 'rows=1'),
      ('S03','The hostname is matched case-insensitively and trimmed', 'count', $q$select 1 from public.public_school_site('  SITE.PsActive.test ')$q$, 'rows=1'),
      ('S04','A pending domain returns nothing',                       'count', $q$select 1 from public.public_school_site('pending.psactive.test')$q$, 'rows=0'),
      ('S05','A rejected domain returns nothing',                      'count', $q$select 1 from public.public_school_site('failed.psactive.test')$q$, 'rows=0'),
      ('S06','A suspended school returns nothing',                     'count', $q$select 1 from public.public_school_site('site.pssusp.test')$q$, 'rows=0'),
      ('S07','An unknown hostname returns nothing',                    'count', $q$select 1 from public.public_school_site('nobody.example.test')$q$, 'rows=0'),
      ('S08','A null hostname returns nothing',                        'count', $q$select 1 from public.public_school_site(null)$q$, 'rows=0'),
      ('S09','The result carries no ids or status columns',            'count', $q$select 1 from information_schema.routines r join information_schema.parameters p on p.specific_name = r.specific_name where r.routine_name = 'public_school_site' and p.parameter_mode = 'OUT' and p.parameter_name in ('id','school_id','status','code','slug','currency','timezone')$q$, 'rows=0'),
      ('S10','Anon still cannot read the schools table directly',      'exec',  $q$select name from public.schools$q$, 'denied'),
      ('S11','Anon cannot write through the function',                'exec',  $q$update public.schools set name = 'x'$q$, 'denied')
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

select * from pg_temp.educore_public_site_tests();
