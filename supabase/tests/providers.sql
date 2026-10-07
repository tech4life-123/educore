-- =============================================================================
-- EduCore — Payment-provider feed tests (migration: payment_providers)
--
-- Same approach as the other suites: throwaway fixtures, every case runs as the
-- real `authenticated` / `anon` / `service_role` role with a forged JWT sub,
-- everything is rolled back. Run as the postgres role:
--   psql "$DATABASE_URL" -f supabase/tests/providers.sql
-- Cases run IN ORDER and build on each other.
-- =============================================================================

create or replace function pg_temp.educore_provider_tests()
returns table (test_id text, description text, expected text, actual text, result text)
language plpgsql
as $fn$
declare
  v_results jsonb := '[]'::jsonb;
  v_session text := session_user;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  adm_a uuid := gen_random_uuid(); fo_a uuid := gen_random_uuid(); tch_a uuid := gen_random_uuid(); stu_a uuid := gen_random_uuid();
  adm_b uuid := gen_random_uuid();
  acc_m uuid; acc_o uuid; acc_b uuid; sec_m text; sec_o text;
  tx_assign uuid;
  v_actor uuid; v_n bigint; v_text text; v_actual text; t record;
  ing text := $q$select public.provider_ingest(%L, %L, %L, %s, %L, current_date, 'Jane Payer', '+231770000000', '{"k":"v"}'::jsonb)$q$;
begin
  begin
    insert into public.schools (id, name, code, slug, status) values
      (a, 'PRV Test A', 'PRVTEST-A', 'prv-test-a', 'active'), (b, 'PRV Test B', 'PRVTEST-B', 'prv-test-b', 'active');
    insert into auth.users (id, instance_id, aud, role, email)
    select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.id || '@prv.test'
    from unnest(array[adm_a, fo_a, tch_a, stu_a, adm_b]) as x(id);
    insert into public.profiles (id, user_id, school_id, first_name, last_name, role, status) values
      (adm_a, adm_a, a, 'T', 'AdmA', 'school_admin', 'active'),
      (fo_a,  fo_a,  a, 'T', 'FinA', 'finance_officer', 'active'),
      (tch_a, tch_a, a, 'T', 'TchA', 'teacher', 'active'),
      (stu_a, stu_a, a, 'T', 'StuA', 'student', 'active'),
      (adm_b, adm_b, b, 'T', 'AdmB', 'school_admin', 'active');
    insert into public.student_profiles (school_id, profile_id, admission_number) values (a, stu_a, 'ADM-001');

    -- ---- setup, through the real functions, as real users -----------------
    perform set_config('request.jwt.claims', json_build_object('sub', adm_a, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    select c.account_id, c.webhook_secret into acc_m, sec_m from public.provider_account_create('mock', 'sandbox', 'Mock gateway') c;
    select c.account_id, c.webhook_secret into acc_o, sec_o from public.provider_account_create('orange_money', 'sandbox', 'Orange Money test') c;
    perform set_config('request.jwt.claims', json_build_object('sub', fo_a, 'role', 'authenticated')::text, true);
    perform public.finance_log_transaction('orange_money', 5, 'USD', 'OM-777', current_date, 'Statement payer', null, null);
    perform set_config('request.jwt.claims', json_build_object('sub', adm_b, 'role', 'authenticated')::text, true);
    select c.account_id into acc_b from public.provider_account_create('mock', 'sandbox', 'B mock') c;
    perform set_config('role', v_session, true);
    perform set_config('request.jwt.claims', '', true);

    for t in select * from (values
      -- ===================== accounts ================================
      ('P01','School admin sees the 2 provider accounts',            'adm_a','count', 'select 1 from public.payment_provider_accounts', 'rows=2'),
      ('P02','Finance officer sees them too',                        'fo_a','count', 'select 1 from public.payment_provider_accounts', 'rows=2'),
      ('P03','Teacher sees none',                                    'tch_a','count', 'select 1 from public.payment_provider_accounts', 'rows=0'),
      ('P04','Student sees none',                                    'stu_a','count', 'select 1 from public.payment_provider_accounts', 'rows=0'),
      ('P05','Anonymous sees none',                                  'anon','exec', 'select 1 from public.payment_provider_accounts', 'denied'),
      ('P06','Other school''s admin sees only their own',            'adm_b','count', 'select 1 from public.payment_provider_accounts', 'rows=1'),
      ('P07','Finance officer cannot create an account',             'fo_a','exec', $q$select * from public.provider_account_create('mtn_momo', 'sandbox', 'MTN')$q$, 'denied'),
      ('P08','Teacher cannot create an account',                     'tch_a','exec', $q$select * from public.provider_account_create('mtn_momo', 'sandbox', 'MTN')$q$, 'denied'),
      ('P09','Anonymous cannot create an account',                   'anon','exec', $q$select * from public.provider_account_create('mtn_momo', 'sandbox', 'MTN')$q$, 'denied'),
      ('P10','A second mock sandbox account is refused',             'adm_a','exec', $q$select * from public.provider_account_create('mock', 'sandbox', 'Again')$q$, 'denied'),
      ('P11','The mock provider cannot go live',                     'adm_a','exec', $q$select * from public.provider_account_create('mock', 'live', 'Live mock')$q$, 'denied'),
      ('P12','Unknown provider is refused',                          'adm_a','exec', $q$select * from public.provider_account_create('stripe', 'sandbox', 'Stripe')$q$, 'denied'),
      ('P13','Empty name is refused',                                'adm_a','exec', $q$select * from public.provider_account_create('mtn_momo', 'sandbox', '   ')$q$, 'denied'),
      ('P14','Bad environment is refused',                           'adm_a','exec', $q$select * from public.provider_account_create('mtn_momo', 'prod', 'MTN')$q$, 'denied'),
      ('P15','Direct insert into accounts is closed',                'adm_a','exec', format($q$insert into public.payment_provider_accounts (school_id, provider, label) values (%L, 'mtn_momo', 'x')$q$, a), 'denied'),
      ('P16','Direct edit of an account is closed',                  'adm_a','exec', format($q$update public.payment_provider_accounts set status = 'disabled' where id = %L$q$, acc_m), 'denied'),

      -- ===================== secrets =================================
      ('P17','School admin cannot read the signing secrets',         'adm_a','exec', 'select webhook_secret from public.payment_provider_secrets', 'denied'),
      ('P18','Finance officer cannot read the signing secrets',      'fo_a','exec', 'select webhook_secret from public.payment_provider_secrets', 'denied'),
      ('P19','Anonymous cannot read the signing secrets',            'anon','exec', 'select webhook_secret from public.payment_provider_secrets', 'denied'),
      ('P20','Stored secrets are at least 32 characters',            'postgres','val', 'select (min(length(webhook_secret)) >= 32)::text from public.payment_provider_secrets', 'val=true'),
      ('P21','The secret handed back at creation is the stored one', 'postgres','val', format($q$select (webhook_secret = %L)::text from public.payment_provider_secrets where account_id = %L$q$, sec_m, acc_m), 'val=true'),
      ('P22','The server (service role) can read a secret',          'service','val', format($q$select (length(webhook_secret) >= 32)::text from public.payment_provider_secrets where account_id = %L$q$, acc_m), 'val=true'),
      ('P23','Rotating: finance officer is refused',                 'fo_a','exec', format('select public.provider_account_rotate_secret(%L)', acc_m), 'denied'),
      ('P24','Rotating: another school''s admin is refused',         'adm_b','exec', format('select public.provider_account_rotate_secret(%L)', acc_m), 'denied'),
      ('P25','Rotating: the admin gets a new, different secret',     'adm_a','val', format('select (public.provider_account_rotate_secret(%L) <> %L)::text', acc_m, sec_m), 'val=true'),
      ('P26','…and the old secret no longer matches',                'postgres','val', format($q$select (webhook_secret <> %L)::text from public.payment_provider_secrets where account_id = %L$q$, sec_m, acc_m), 'val=true'),

      -- ===================== who may ingest ==========================
      ('P27','School admin cannot call provider_ingest',             'adm_a','exec', format(ing, acc_m, 'X-1', 'successful', '10', 'USD'), 'denied'),
      ('P28','Finance officer cannot call provider_ingest',          'fo_a','exec', format(ing, acc_m, 'X-1', 'successful', '10', 'USD'), 'denied'),
      ('P29','Anonymous cannot call provider_ingest',                'anon','exec', format(ing, acc_m, 'X-1', 'successful', '10', 'USD'), 'denied'),
      ('P30','Unknown account is refused',                           'service','exec', format(ing, gen_random_uuid(), 'X-1', 'successful', '10', 'USD'), 'denied'),
      ('P31','Missing provider transaction id is refused',           'service','exec', format(ing, acc_m, '  ', 'successful', '10', 'USD'), 'denied'),

      -- ===================== ingesting ===============================
      ('P32','A successful payment is ingested',                     'service','val', format(ing || '->>''outcome''', acc_m, 'MOCK-1', 'successful', '25.50', 'USD'), 'val=ingested'),
      ('P33','…as an unmatched provider transaction',                'postgres','val', $q$select source || ' ' || status::text || ' ' || method::text || ' ' || amount::text || ' ' || currency from public.incoming_transactions where reference = 'MOCK-1'$q$, 'val=provider unmatched other 25.50 USD'),
      ('P34','…carrying the payer details',                          'postgres','val', $q$select payer_name || ' ' || payer_phone from public.incoming_transactions where reference = 'MOCK-1'$q$, 'val=Jane Payer +231770000000'),
      ('P35','Redelivering the same message is flagged duplicate',   'service','val', format(ing || '->>''duplicate''', acc_m, 'MOCK-1', 'successful', '25.50', 'USD'), 'val=true'),
      ('P36','…and changes nothing: still one transaction',          'postgres','count', $q$select 1 from public.incoming_transactions where reference = 'MOCK-1'$q$, 'rows=1'),
      ('P37','…but the delivery is counted',                         'postgres','val', $q$select delivery_count::text from public.provider_events where external_id = 'MOCK-1'$q$, 'val=2'),
      ('P38','A redelivery with a different amount cannot alter it', 'service','val', format(ing || '->>''outcome''', acc_m, 'MOCK-1', 'successful', '999', 'USD'), 'val=ingested'),
      ('P39','…the amount stays 25.50',                              'postgres','val', $q$select amount::text from public.incoming_transactions where reference = 'MOCK-1'$q$, 'val=25.50'),
      ('P40','A pending payment is logged but ignored (and may be upgraded later)',              'service','val', format(ing || '->>''outcome''', acc_m, 'MOCK-2', 'pending', '10', 'USD'), 'val=ignored'),
      ('P41','…and creates no transaction',                          'postgres','count', $q$select 1 from public.incoming_transactions where reference = 'MOCK-2'$q$, 'rows=0'),
      ('P42','…and when the provider later reports it successful, it is ingested','service','val', format(ing || '->>''outcome''', acc_m, 'MOCK-2', 'successful', '10', 'USD'), 'val=ingested'),
      ('P42a','…creating exactly one transaction',                  'postgres','count', $q$select 1 from public.incoming_transactions where reference = 'MOCK-2'$q$, 'rows=1'),
      ('P42b','…and the event now points at it',                    'postgres','val', $q$select outcome || ' ' || (transaction_id is not null)::text || ' ' || delivery_count::text from public.provider_events where external_id = 'MOCK-2'$q$, 'val=ingested true 2'),
      ('P42c','Once ingested, a repeat success is a plain duplicate','service','val', format(ing || '->>''duplicate''', acc_m, 'MOCK-2', 'successful', '10', 'USD'), 'val=true'),
      ('P42d','…and still just one transaction',                    'postgres','count', $q$select 1 from public.incoming_transactions where reference = 'MOCK-2'$q$, 'rows=1'),
      ('P42e','A "failed" status after a "pending" stays ignored',  'service','val', format(ing || '->>''outcome''', acc_m, 'MOCK-9', 'pending', '10', 'USD') , 'val=ignored'),
      ('P42f','…and a following failure creates nothing',          'service','val', format(ing || '->>''outcome''', acc_m, 'MOCK-9', 'failed', '10', 'USD'), 'val=ignored'),
      ('P42g','…no transaction exists for it',                     'postgres','count', $q$select 1 from public.incoming_transactions where reference = 'MOCK-9'$q$, 'rows=0'),
      ('P43','A zero amount is ignored',                             'service','val', format(ing || '->>''outcome''', acc_m, 'MOCK-3', 'successful', '0', 'USD'), 'val=ignored'),
      ('P44','A 3-decimal amount is ignored',                        'service','val', format(ing || '->>''outcome''', acc_m, 'MOCK-4', 'successful', '10.555', 'USD'), 'val=ignored'),
      ('P45','An unsupported currency is ignored',                   'service','val', format(ing || '->>''outcome''', acc_m, 'MOCK-5', 'successful', '10', 'EUR'), 'val=ignored'),
      ('P46','A huge amount is ignored',                             'service','val', format(ing || '->>''outcome''', acc_m, 'MOCK-6', 'successful', '99999999', 'USD'), 'val=ignored'),
      ('P47','None of the bad ones became transactions',             'postgres','count', $q$select 1 from public.incoming_transactions where reference in ('MOCK-3','MOCK-4','MOCK-5','MOCK-6')$q$, 'rows=0'),
      ('P48','A future date is clamped to today',                    'service','exec', format($q$select public.provider_ingest(%L, 'MOCK-7', 'successful', 3, 'LRD', current_date + 5, null, null, '{}'::jsonb)$q$, acc_m), 'affected=1'),
      ('P49','…stored as today',                                     'postgres','val', $q$select (transaction_date = current_date)::text from public.incoming_transactions where reference = 'MOCK-7'$q$, 'val=true'),
      ('P50','An Orange Money account produces orange_money rows',   'service','val', format(ing || '->>''outcome''', acc_o, 'OM-1', 'successful', '40', 'USD'), 'val=ingested'),
      ('P51','…with that payment method',                            'postgres','val', $q$select method::text from public.incoming_transactions where reference = 'OM-1'$q$, 'val=orange_money'),
      ('P52','A reference already logged from a statement is a conflict','service','val', format(ing || '->>''outcome''', acc_o, 'OM-777', 'successful', '5', 'USD'), 'val=conflict'),
      ('P53','…and no second transaction is created',                'postgres','count', $q$select 1 from public.incoming_transactions where reference = 'OM-777'$q$, 'rows=1'),
      ('P54','Same id on a different account is its own event',      'service','val', format(ing || '->>''outcome''', acc_b, 'MOCK-1', 'successful', '7', 'USD'), 'val=ingested'),
      ('P55','…landing in the other school only',                    'postgres','val', format($q$select school_id::text from public.incoming_transactions where reference = 'MOCK-1' and amount = 7$q$), format('val=%s', b)),

      -- ===================== disabling ===============================
      ('P56','Finance officer cannot disable an account',            'fo_a','exec', format($q$select public.provider_account_set_status(%L, 'disabled')$q$, acc_m), 'denied'),
      ('P57','Another school''s admin cannot disable it',            'adm_b','exec', format($q$select public.provider_account_set_status(%L, 'disabled')$q$, acc_m), 'denied'),
      ('P58','A bad status value is refused',                        'adm_a','exec', format($q$select public.provider_account_set_status(%L, 'paused')$q$, acc_m), 'denied'),
      ('P59','School admin disables the mock account',               'adm_a','exec', format($q$select public.provider_account_set_status(%L, 'disabled')$q$, acc_m), 'affected=1'),
      ('P60','A disabled account refuses messages',                  'service','exec', format(ing, acc_m, 'MOCK-8', 'successful', '10', 'USD'), 'denied'),
      ('P61','School admin re-enables it',                           'adm_a','exec', format($q$select public.provider_account_set_status(%L, 'active')$q$, acc_m), 'affected=1'),
      ('P62','…and messages flow again',                             'service','val', format(ing || '->>''outcome''', acc_m, 'MOCK-8', 'successful', '10', 'USD'), 'val=ingested'),

      -- ===================== the event log ===========================
      ('P63','Finance officer reads the school''s events',           'fo_a','count', 'select 1 from public.provider_events', 'rows>=10'),
      ('P64','School admin reads them',                              'adm_a','count', 'select 1 from public.provider_events', 'rows>=10'),
      ('P65','Teacher reads none',                                   'tch_a','count', 'select 1 from public.provider_events', 'rows=0'),
      ('P66','Student reads none',                                   'stu_a','count', 'select 1 from public.provider_events', 'rows=0'),
      ('P67','Other school sees only its own single event',          'adm_b','count', 'select 1 from public.provider_events', 'rows=1'),
      ('P68','Anonymous reads none',                                 'anon','exec', 'select 1 from public.provider_events', 'denied'),
      ('P69','Finance officer cannot insert an event',               'fo_a','exec', format($q$insert into public.provider_events (school_id, account_id, provider, external_id, outcome, payload) values (%L, %L, 'mock', 'FAKE', 'ingested', '{}')$q$, a, acc_m), 'denied'),
      ('P70','An event''s outcome cannot be rewritten',              'postgres','exec', $q$update public.provider_events set outcome = 'conflict' where external_id = 'MOCK-1'$q$, 'denied'),
      ('P71','An event''s payload cannot be rewritten',              'postgres','exec', $q$update public.provider_events set payload = '{}' where external_id = 'MOCK-1'$q$, 'denied'),
      ('P72','An event cannot be deleted',                           'postgres','exec', $q$delete from public.provider_events where external_id = 'MOCK-1'$q$, 'denied'),
      ('P73','A transaction that has an event cannot be deleted',    'postgres','exec', $q$delete from public.incoming_transactions where reference = 'MOCK-1' and amount = 25.50$q$, 'denied'),

      -- ===================== hand-off to reconciliation ==============
      ('P74','Finance sees the provider transactions to reconcile',  'fo_a','count', $q$select 1 from public.incoming_transactions where source = 'provider' and status = 'unmatched'$q$, 'rows>=4'),
      ('P75','Finance rejects one with a reason (existing flow)',    'fo_a','exec', $q$select public.finance_reject_transaction((select id from public.incoming_transactions where reference = 'MOCK-7'), 'Not ours')$q$, 'affected=1'),
      ('P76','Finance assigns a provider transaction to a student',  'fo_a','exec', format($q$select public.finance_assign_transaction((select id from public.incoming_transactions where reference = 'MOCK-1' and amount = 25.50), %L, null, 'Provider')$q$, stu_a), 'affected=1'),
      ('P77','…which is now a posted payment with a receipt',        'postgres','val', $q$select p.status::text || ' ' || (select count(*) from public.receipts r where r.payment_id = p.id)::text from public.payments p join public.incoming_transactions x on x.payment_id = p.id where x.reference = 'MOCK-1' and x.amount = 25.50$q$, 'val=posted 1'),
      ('P78','The provider message could not post anything by itself','postgres','count', $q$select 1 from public.payments p where p.reference in ('MOCK-3','MOCK-8','OM-1')$q$, 'rows=0'),

      -- ===================== audit ===================================
      ('P79','Account creation, status and rotation were audited',   'postgres','count', $q$select 1 from public.financial_audit_logs where action in ('PROVIDER_ACCOUNT_CREATED','PROVIDER_ACCOUNT_STATUS_CHANGED','PROVIDER_SECRET_ROTATED')$q$, 'rows>=6'),
      ('P80','Provider transactions were audited when logged',       'postgres','count', $q$select 1 from public.financial_audit_logs where action = 'TRANSACTION_LOGGED' and new_data ->> 'source' = 'provider'$q$, 'rows>=4'),
      ('P81','No signing secret ever reaches the audit log',         'postgres','count', $q$select 1 from public.financial_audit_logs where new_data::text like '%webhook_secret%' or old_data::text like '%webhook_secret%'$q$, 'rows=0'),
      ('P82','No audit row contains a real secret value',            'postgres','count', format($q$select 1 from public.financial_audit_logs where new_data::text like '%%' || %L || '%%'$q$, sec_o), 'rows=0'),
      ('P83','Internal helpers are not callable by browser roles',   'postgres','val', $q$select (has_function_privilege('authenticated', 'private.new_provider_secret()', 'execute') or has_function_privilege('anon', 'private.new_provider_secret()', 'execute') or has_function_privilege('anon', 'private.assert_school_admin()', 'execute'))::text$q$, 'val=false'),
      ('P84','provider_ingest is not executable by browser roles',   'postgres','val', $q$select (has_function_privilege('authenticated', 'public.provider_ingest(uuid, text, text, numeric, text, date, text, text, jsonb)', 'execute') or has_function_privilege('anon', 'public.provider_ingest(uuid, text, text, numeric, text, date, text, text, jsonb)', 'execute'))::text$q$, 'val=false')
    ) as c(id, descr, actor, kind, sql, expected)
    loop
      v_actor := case t.actor when 'adm_a' then adm_a when 'fo_a' then fo_a when 'tch_a' then tch_a when 'stu_a' then stu_a when 'adm_b' then adm_b end;
      begin
        if t.actor = 'anon' then
          perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
          perform set_config('role', 'anon', true);
        elsif t.actor = 'service' then
          perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
          perform set_config('role', 'service_role', true);
        elsif t.actor <> 'postgres' then
          perform set_config('request.jwt.claims', json_build_object('sub', v_actor, 'role', 'authenticated')::text, true);
          perform set_config('role', 'authenticated', true);
        end if;

        if t.kind = 'count' then
          execute 'select count(*) from (' || t.sql || ') s' into v_n;
          v_actual := 'rows=' || v_n;
          if t.expected like 'rows>=%' then
            v_actual := case when v_n >= substring(t.expected from 7)::bigint then t.expected else 'rows=' || v_n end;
          end if;
        elsif t.kind = 'val' then
          execute t.sql into v_text;
          v_actual := 'val=' || coalesce(v_text, 'null');
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

select * from pg_temp.educore_provider_tests();
