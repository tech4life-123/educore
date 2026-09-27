-- =============================================================================
-- EduCore — Announcement authorization tests (migration 016)
--
-- Same approach as tenant_isolation.sql: throwaway fixtures, every case runs
-- as the real `authenticated` role with a forged JWT sub, and all data is
-- rolled back. Run as the postgres role:
--   psql "$DATABASE_URL" -f supabase/tests/announcements.sql
-- =============================================================================

create or replace function pg_temp.educore_announcement_tests()
returns table (test_id text, description text, expected text, actual text, result text)
language plpgsql
as $fn$
declare
  v_results jsonb := '[]'::jsonb;
  v_session text := session_user;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  adm uuid := gen_random_uuid(); tch_c uuid := gen_random_uuid(); tch_o uuid := gen_random_uuid();
  stu1 uuid := gen_random_uuid(); stu2 uuid := gen_random_uuid(); par uuid := gen_random_uuid(); par2 uuid := gen_random_uuid();
  adm_b uuid := gen_random_uuid();
  p_adm uuid; p_tch_c uuid; p_stu1 uuid; p_par uuid;
  yr uuid := gen_random_uuid(); cls uuid := gen_random_uuid(); subj uuid := gen_random_uuid();
  a1 uuid := gen_random_uuid(); a2 uuid := gen_random_uuid(); a3 uuid := gen_random_uuid();
  a4 uuid := gen_random_uuid(); a5 uuid := gen_random_uuid(); a6 uuid := gen_random_uuid();
  v_actor uuid; v_n bigint; v_actual text; t record;
begin
  begin
    insert into public.schools (id, name, code, slug, status) values
      (a, 'AN Test A', 'ANTEST-A', 'an-test-a', 'active'), (b, 'AN Test B', 'ANTEST-B', 'an-test-b', 'active');
    insert into auth.users (id, instance_id, aud, role, email)
    select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.id || '@an.test'
    from unnest(array[adm, tch_c, tch_o, stu1, stu2, par, par2, adm_b]) as x(id);
    insert into public.profiles (user_id, school_id, first_name, last_name, role, status) values
      (adm, a, 'T', 'Adm', 'school_admin', 'active'), (tch_c, a, 'T', 'ClassT', 'teacher', 'active'),
      (tch_o, a, 'T', 'OtherT', 'teacher', 'active'), (stu1, a, 'T', 'Stu1', 'student', 'active'),
      (stu2, a, 'T', 'Stu2', 'student', 'active'), (par, a, 'T', 'Par', 'parent', 'active'),
      (par2, a, 'T', 'Par2', 'parent', 'active'), (adm_b, b, 'T', 'AdmB', 'school_admin', 'active');
    select id into p_adm from public.profiles where user_id = adm;
    select id into p_tch_c from public.profiles where user_id = tch_c;
    select id into p_stu1 from public.profiles where user_id = stu1;
    select id into p_par from public.profiles where user_id = par;

    insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current) values (yr, a, 'AN Year', '2026-09-01', '2027-07-31', true);
    insert into public.classes (id, school_id, academic_year_id, grade_level_id, name)
      select cls, a, yr, g.id, '12A' from public.grade_levels g where g.school_id = a and g.name = 'Grade 12';
    insert into public.subjects (id, school_id, name, code) values (subj, a, 'Chemistry', 'CHEM');
    insert into public.class_subjects (school_id, class_id, subject_id, teacher_id) values (a, cls, subj, p_tch_c);
    insert into public.enrollments (school_id, class_id, academic_year_id, student_id) values (a, cls, yr, p_stu1);
    insert into public.guardian_links (school_id, parent_id, student_id) values (a, p_par, p_stu1);

    for t in select * from (values
      ('N01','Admin posts to everyone (control)',            'admin','exec',   format($q$insert into public.announcements (id, school_id, title, body, audience) values (%L, %L, 'Welcome back', 'Classes resume Monday.', 'everyone')$q$, a1, a), 'affected=1'),
      ('N02','Author is set by the database',                'postgres','count', format('select 1 from public.announcements where id = %L and author_id = %L', a1, p_adm), 'rows=1'),
      ('N03','Teacher posts to a class they teach (control)','teacher_c','exec', format($q$insert into public.announcements (id, school_id, title, body, audience, class_id) values (%L, %L, 'Lab on Friday', 'Bring lab coats.', 'class', %L)$q$, a2, a, cls), 'affected=1'),
      ('N04','Teacher posts to the whole school',            'teacher_c','exec', format($q$insert into public.announcements (school_id, title, body, audience) values (%L, 'School closed', 'x', 'everyone')$q$, a), 'denied'),
      ('N05','Teacher posts to a class they don''t teach',   'teacher_o','exec', format($q$insert into public.announcements (school_id, title, body, audience, class_id) values (%L, 'Hello 12A', 'x', 'class', %L)$q$, a, cls), 'denied'),
      ('N06','Student posts an announcement',                'student1','exec',  format($q$insert into public.announcements (school_id, title, body, audience) values (%L, 'No school', 'x', 'everyone')$q$, a), 'denied'),
      ('N07','Admin posts to parents (control)',             'admin','exec',   format($q$insert into public.announcements (id, school_id, title, body, audience) values (%L, %L, 'PTA meeting', 'Saturday 10am.', 'parents')$q$, a3, a), 'affected=1'),
      ('N08','Admin posts to staff (control)',               'admin','exec',   format($q$insert into public.announcements (id, school_id, title, body, audience) values (%L, %L, 'Staff meeting', 'Thursday 3pm.', 'staff')$q$, a4, a), 'affected=1'),
      ('N09','Admin schedules a post for tomorrow',          'admin','exec',   format($q$insert into public.announcements (id, school_id, title, body, audience, publish_at) values (%L, %L, 'Exams schedule', 'Soon.', 'everyone', now() + interval '1 day')$q$, a5, a), 'affected=1'),
      ('N10','Admin posts something already expired',        'admin','exec',   format($q$insert into public.announcements (id, school_id, title, body, audience, publish_at, expires_on) values (%L, %L, 'Old news', 'Gone.', 'everyone', now() - interval '10 days', current_date - 1)$q$, a6, a), 'affected=1'),
      ('N11','Class audience without a class',               'admin','exec',   format($q$insert into public.announcements (school_id, title, body, audience) values (%L, 'Broken', 'x', 'class')$q$, a), 'denied'),
      ('V01','Student in the class: everyone + class posts', 'student1','count', 'select 1 from public.announcements', 'rows=2'),
      ('V02','Other student: everyone post only',            'student2','count', 'select 1 from public.announcements', 'rows=1'),
      ('V03','Linked parent: everyone + class + parents',    'parent','count',   'select 1 from public.announcements', 'rows=3'),
      ('V04','Unlinked parent: everyone + parents',          'parent2','count',  'select 1 from public.announcements', 'rows=2'),
      ('V05','Class teacher: everyone + class + staff',      'teacher_c','count','select 1 from public.announcements', 'rows=3'),
      ('V06','Other teacher: everyone + staff',              'teacher_o','count','select 1 from public.announcements', 'rows=2'),
      ('V07','Admin sees everything incl. scheduled/expired','admin','count',    'select 1 from public.announcements', 'rows=6'),
      ('V08','School B admin sees nothing',                  'admin_b','count',  'select 1 from public.announcements', 'rows=0'),
      ('E01','Teacher edits their own post (control)',       'teacher_c','exec', format($q$update public.announcements set body = 'Bring lab coats and goggles.' where id = %L$q$, a2), 'affected=1'),
      ('E02','Other teacher edits it',                       'teacher_o','exec', format($q$update public.announcements set body = 'x' where id = %L$q$, a2), 'affected=0'),
      ('E03','Teacher widens own post to everyone',          'teacher_c','exec', format($q$update public.announcements set audience = 'everyone', class_id = null where id = %L$q$, a2), 'denied'),
      ('E04','Teacher deletes the admin''s post',            'teacher_c','exec', format('delete from public.announcements where id = %L', a1), 'affected=0'),
      ('R01','Student records reading a post (control)',     'student1','exec',  format('insert into public.announcement_reads (school_id, announcement_id, profile_id) values (%L, %L, %L)', a, a1, p_par), 'affected=1'),
      ('R02','…the read is filed under the student',         'postgres','count', format('select 1 from public.announcement_reads where announcement_id = %L and profile_id = %L', a1, p_stu1), 'rows=1'),
      ('R03','Student records reading a parents-only post',  'student1','exec',  format('insert into public.announcement_reads (school_id, announcement_id, profile_id) values (%L, %L, %L)', a, a3, p_stu1), 'denied'),
      ('R04','Another student sees that read',               'student2','count', 'select 1 from public.announcement_reads', 'rows=0')
    ) as c(id, descr, actor, kind, sql, expected)
    loop
      v_actor := case t.actor when 'admin' then adm when 'teacher_c' then tch_c when 'teacher_o' then tch_o
        when 'student1' then stu1 when 'student2' then stu2 when 'parent' then par when 'parent2' then par2 when 'admin_b' then adm_b end;
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

select * from pg_temp.educore_announcement_tests();
