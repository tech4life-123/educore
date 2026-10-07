-- =============================================================================
-- EduCore — School domains authorization tests (migration: school_domains)
--
-- Same approach as tenant_isolation.sql: throwaway fixtures, every case runs
-- as the real `authenticated` role with a forged JWT sub, and all data is
-- rolled back. Run as the postgres role:
--   psql "$DATABASE_URL" -f supabase/tests/school_domains.sql
-- =============================================================================

create or replace function pg_temp.educore_school_domains_tests()
returns table (test_id text, description text, expected text, actual text, result text)
language plpgsql
as $fn$
declare
  v_results jsonb := '[]'::jsonb;
  v_session text := session_user;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  adm_a uuid := gen_random_uuid(); tch_a uuid := gen_random_uuid(); adm_b uuid := gen_random_uuid(); sup uuid := gen_random_uuid();
  sub_a uuid := gen_random_uuid(); sub_b uuid := gen_random_uuid();
  v_actor uuid; v_n bigint; v_actual text; t record;
begin
  begin
    insert into public.schools (id, name, code, slug, status) values
      (a, 'SD Test A', 'SDTEST-A', 'sd-test-a', 'active'), (b, 'SD Test B', 'SDTEST-B', 'sd-test-b', 'active');
    insert into auth.users (id, instance_id, aud, role, email)
    select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.id || '@sd.test'
    from unnest(array[adm_a, tch_a, adm_b, sup]) as x(id);
    insert into public.profiles (user_id, school_id, first_name, last_name, role, status) values
      (adm_a, a, 'T', 'AdmA', 'school_admin', 'active'), (tch_a, a, 'T', 'TchA', 'teacher', 'active'),
      (adm_b, b, 'T', 'AdmB', 'school_admin', 'active'), (sup, null, 'T', 'Sup', 'super_admin', 'active');

    -- Subdomain rows are system-provisioned: insert as postgres (stands in
    -- for the future server-side/service-role provisioning flow).
    insert into public.school_domains (id, school_id, domain, domain_type, is_primary, verification_status, ssl_status)
    values (sub_a, a, 'sd-test-a.educore.com', 'subdomain', true, 'verified', 'issued'),
           (sub_b, b, 'sd-test-b.educore.com', 'subdomain', true, 'verified', 'issued');

    for t in select * from (values
      -- `id` is deliberately NOT in authenticated's insert grant (same
      -- reasoning as every other identity column), so the row is found by
      -- its domain afterwards rather than by a client-supplied id.
      ('D01','School admin requests a custom domain (control)', 'adm_a','exec', format($q$insert into public.school_domains (school_id, domain, domain_type) values (%L, 'www.sdtest-a.edu.lr', 'custom')$q$, a), 'affected=1'),
      ('D02','…it starts out unverified, not auto-trusted',      'postgres','count', $q$select 1 from public.school_domains where domain = 'www.sdtest-a.edu.lr' and verification_status = 'pending' and ssl_status = 'pending'$q$, 'rows=1'),
      ('D03','School admin inserts a SUBDOMAIN row directly',    'adm_a','exec', format($q$insert into public.school_domains (school_id, domain, domain_type) values (%L, 'sneaky.educore.com', 'subdomain')$q$, a), 'denied'),
      ('D04','Teacher requests a custom domain',                 'tch_a','exec', format($q$insert into public.school_domains (school_id, domain, domain_type) values (%L, 'teacher-wont.edu.lr', 'custom')$q$, a), 'denied'),
      ('D05','School admin claims School B''s existing domain',  'adm_a','exec', format($q$insert into public.school_domains (school_id, domain, domain_type) values (%L, 'sd-test-b.educore.com', 'custom')$q$, a), 'denied'),
      -- self-verification must be impossible even for the school's own admin
      ('D06','Admin marks their own pending domain verified',    'adm_a','exec', $q$update public.school_domains set verification_status = 'verified' where domain = 'www.sdtest-a.edu.lr'$q$, 'denied'),
      ('D07','Admin marks their own domain''s SSL issued',       'adm_a','exec', $q$update public.school_domains set ssl_status = 'issued' where domain = 'www.sdtest-a.edu.lr'$q$, 'denied'),
      ('D08','Admin changes domain_type after the fact',         'adm_a','exec', $q$update public.school_domains set domain_type = 'subdomain' where domain = 'www.sdtest-a.edu.lr'$q$, 'denied'),
      ('D09','Admin re-points the domain text itself',           'adm_a','exec', $q$update public.school_domains set domain = 'new-name.edu.lr' where domain = 'www.sdtest-a.edu.lr'$q$, 'denied'),
      ('D10','Admin moves a domain row to another school',       'adm_a','exec', format($q$update public.school_domains set school_id = %L where domain = 'www.sdtest-a.edu.lr'$q$, b), 'denied'),
      -- cross-tenant isolation
      ('D11','School A admin reads School B''s domain row',      'adm_a','count', format('select 1 from public.school_domains where id = %L', sub_b), 'rows=0'),
      ('D12','School A admin lists domains (sees only A)',       'adm_a','count', 'select 1 from public.school_domains', 'rows=2'),
      ('D13','School A admin deletes School B''s domain',        'adm_a','exec', format('delete from public.school_domains where id = %L', sub_b), 'affected=0'),
      -- super admin: no RLS privileges, same as every other tenant table
      ('D14','Super admin lists domains via RLS',                'sup','count', 'select 1 from public.school_domains', 'rows=0'),
      ('D15','Anonymous reads domains',                          'anon','count', 'select 1 from public.school_domains', 'denied'),
      -- a withdrawn custom-domain request can be removed by its own school
      ('D16','School admin withdraws their own custom request',  'adm_a','exec', $q$delete from public.school_domains where domain = 'www.sdtest-a.edu.lr'$q$, 'affected=1'),
      ('D17','School admin deletes their own SUBDOMAIN row',     'adm_a','exec', format('delete from public.school_domains where id = %L', sub_a), 'affected=0'),
      -- exactly one primary per school, enforced by the unique index
      ('D18','(setup) Second subdomain-style row for School A',  'postgres','exec', format($q$insert into public.school_domains (school_id, domain, domain_type, is_primary) values (%L, 'second.sd-test-a.educore.com', 'subdomain', false)$q$, a), 'affected=1'),
      ('D19','Admin makes a second domain primary too',          'adm_a','exec', format($q$update public.school_domains set is_primary = true where school_id = %L and domain = 'second.sd-test-a.educore.com'$q$, a), 'denied')
    ) as c(id, descr, actor, kind, sql, expected)
    loop
      v_actor := case t.actor when 'adm_a' then adm_a when 'tch_a' then tch_a when 'adm_b' then adm_b when 'sup' then sup end;
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

select * from pg_temp.educore_school_domains_tests();
