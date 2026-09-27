-- =============================================================================
-- EduCore — Academic structure, parent links & logo storage tests (migration 006)
-- Same harness as tenant_isolation.sql: runs each case as the real role with a
-- forged JWT sub; everything is rolled back. Run as postgres:
--   psql "$DATABASE_URL" -f supabase/tests/academics.sql
-- =============================================================================

create or replace function pg_temp.educore_academics_tests()
returns table (test_id text, description text, expected text, actual text, result text)
language plpgsql
as $fn$
declare
  v_results jsonb := '[]'::jsonb;
  v_session text := session_user;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  adm_a uuid := gen_random_uuid(); tch_a uuid := gen_random_uuid(); stu_a1 uuid := gen_random_uuid();
  stu_a2 uuid := gen_random_uuid(); par_a uuid := gen_random_uuid();
  adm_b uuid := gen_random_uuid(); tch_b uuid := gen_random_uuid(); stu_b uuid := gen_random_uuid();
  p_tch_a uuid; p_stu_a1 uuid; p_stu_a2 uuid; p_par_a uuid; p_tch_b uuid; p_stu_b uuid;
  g_b uuid; class_a uuid := gen_random_uuid(); class_a2 uuid := gen_random_uuid();
  v_actor uuid; v_n bigint; v_actual text; t record;
begin
  begin
    insert into public.schools (id, name, code, slug, status) values
      (a, 'AC Test A', 'ACTEST-A', 'ac-test-a', 'active'), (b, 'AC Test B', 'ACTEST-B', 'ac-test-b', 'active');
    insert into auth.users (id, instance_id, aud, role, email)
    select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.id || '@ac.test'
    from unnest(array[adm_a, tch_a, stu_a1, stu_a2, par_a, adm_b, tch_b, stu_b]) as x(id);
    insert into public.profiles (user_id, school_id, first_name, last_name, role, status) values
      (adm_a, a, 'T', 'AdmA', 'school_admin', 'active'), (tch_a, a, 'T', 'TchA', 'teacher', 'active'),
      (stu_a1, a, 'T', 'StuA1', 'student', 'active'), (stu_a2, a, 'T', 'StuA2', 'student', 'active'),
      (par_a, a, 'T', 'ParA', 'parent', 'active'), (adm_b, b, 'T', 'AdmB', 'school_admin', 'active'),
      (tch_b, b, 'T', 'TchB', 'teacher', 'active'), (stu_b, b, 'T', 'StuB', 'student', 'active');
    select id into p_tch_a from public.profiles where user_id = tch_a;
    select id into p_stu_a1 from public.profiles where user_id = stu_a1;
    select id into p_stu_a2 from public.profiles where user_id = stu_a2;
    select id into p_par_a from public.profiles where user_id = par_a;
    select id into p_tch_b from public.profiles where user_id = tch_b;
    select id into p_stu_b from public.profiles where user_id = stu_b;
    select id into g_b from public.grade_levels where school_id = b and name = 'Grade 10';

    for t in select * from (values
      ('L01','New schools get 15 default grade levels',        'postgres','count', format('select 1 from public.grade_levels where school_id = %L', a), 'rows=15'),
      ('Y01','Admin A creates a Liberian-template year',        'admin_a', 'exec',  $q$select public.create_academic_year('2026/2027', date '2026-09-01', date '2027-07-31', 'liberia', true)$q$, 'affected=1'),
      ('Y02','Template made 2 semesters',                       'postgres','count', format('select 1 from public.academic_terms where school_id = %L', a), 'rows=2'),
      ('Y03','…and 8 periods (6 marking periods + 2 exams)',    'postgres','count', format('select 1 from public.grading_periods where school_id = %L', a), 'rows=8'),
      ('Y04','Teacher creates an academic year',                'teacher_a','exec', $q$select public.create_academic_year('2027/2028', date '2027-09-01', date '2028-07-31', 'liberia', false)$q$, 'denied'),
      ('Y05','School B admin sees School A years',              'admin_b', 'count', format('select 1 from public.academic_years where school_id = %L', a), 'rows=0'),
      ('Y06','Admin A inserts a year into School B',            'admin_a', 'exec',  format($q$insert into public.academic_years (school_id, name, starts_on, ends_on) values (%L, 'Rogue year', date '2026-01-01', date '2026-12-31')$q$, b), 'denied'),
      ('S01','Admin A adds standard subjects',                  'admin_a', 'count', 'select public.add_standard_subjects() as n', 'rows=1'),
      ('S02','17 subjects created',                             'postgres','count', format('select 1 from public.subjects where school_id = %L', a), 'rows=17'),
      ('S03','Running it again adds none',                      'admin_a', 'count', 'select 1 where public.add_standard_subjects() = 0', 'rows=1'),
      ('S04','Student adds subjects',                           'student_a1','exec','select public.add_standard_subjects()', 'denied'),
      ('C01','Admin A creates class 10A (control)',             'admin_a', 'exec',  format($q$insert into public.classes (id, school_id, academic_year_id, grade_level_id, name, homeroom_teacher_id) select %L, %L, y.id, g.id, '10A', %L from public.academic_years y, public.grade_levels g where y.school_id = %L and g.school_id = %L and g.name = 'Grade 10'$q$, class_a, a, p_tch_a, a, a), 'affected=1'),
      ('C02','Admin A creates class 10B (control)',             'admin_a', 'exec',  format($q$insert into public.classes (id, school_id, academic_year_id, grade_level_id, name) select %L, %L, y.id, g.id, '10B' from public.academic_years y, public.grade_levels g where y.school_id = %L and g.school_id = %L and g.name = 'Grade 10'$q$, class_a2, a, a, a), 'affected=1'),
      ('C03','Class using School B''s grade level',             'admin_a', 'exec',  format($q$insert into public.classes (school_id, academic_year_id, grade_level_id, name) select %L, y.id, %L, 'X1' from public.academic_years y where y.school_id = %L$q$, a, g_b, a), 'denied'),
      ('C04','Student as homeroom teacher',                     'admin_a', 'exec',  format($q$update public.classes set homeroom_teacher_id = %L where id = %L$q$, p_stu_a1, class_a2), 'denied'),
      ('C05','School B teacher as homeroom teacher',            'admin_a', 'exec',  format($q$update public.classes set homeroom_teacher_id = %L where id = %L$q$, p_tch_b, class_a2), 'denied'),
      ('C06','Teacher creates a class',                         'teacher_a','exec', format($q$insert into public.classes (school_id, academic_year_id, grade_level_id, name) select %L, y.id, g.id, 'T1' from public.academic_years y, public.grade_levels g where y.school_id = %L and g.school_id = %L and g.name = 'Grade 9'$q$, a, a, a), 'denied'),
      ('C07','Duplicate class name in same year',               'admin_a', 'exec',  format($q$insert into public.classes (school_id, academic_year_id, grade_level_id, name) select %L, y.id, g.id, '10a' from public.academic_years y, public.grade_levels g where y.school_id = %L and g.school_id = %L and g.name = 'Grade 10'$q$, a, a, a), 'denied'),
      ('T01','Assign subject + teacher to class (control)',     'admin_a', 'exec',  format($q$insert into public.class_subjects (school_id, class_id, subject_id, teacher_id) select %L, %L, s.id, %L from public.subjects s where s.school_id = %L and s.code = 'MATH'$q$, a, class_a, p_tch_a, a), 'affected=1'),
      ('T02','Parent as subject teacher',                       'admin_a', 'exec',  format($q$insert into public.class_subjects (school_id, class_id, subject_id, teacher_id) select %L, %L, s.id, %L from public.subjects s where s.school_id = %L and s.code = 'ENG'$q$, a, class_a, p_par_a, a), 'denied'),
      ('E01','Enroll student A1 in 10A (control)',              'admin_a', 'exec',  format($q$insert into public.enrollments (school_id, class_id, student_id, academic_year_id) select %L, %L, %L, academic_year_id from public.classes where id = %L$q$, a, class_a, p_stu_a1, class_a), 'affected=1'),
      ('E02','Enrollment year auto-set from class',             'postgres','count', format($q$select 1 from public.enrollments e join public.classes c on c.id = e.class_id where e.student_id = %L and e.academic_year_id = c.academic_year_id$q$, p_stu_a1), 'rows=1'),
      ('E03','Same student in a 2nd class, same year',          'admin_a', 'exec',  format($q$insert into public.enrollments (school_id, class_id, student_id, academic_year_id) select %L, %L, %L, academic_year_id from public.classes where id = %L$q$, a, class_a2, p_stu_a1, class_a2), 'denied'),
      ('E04','Enroll a parent',                                 'admin_a', 'exec',  format($q$insert into public.enrollments (school_id, class_id, student_id, academic_year_id) select %L, %L, %L, academic_year_id from public.classes where id = %L$q$, a, class_a, p_par_a, class_a), 'denied'),
      ('E05','Enroll a School B student',                       'admin_a', 'exec',  format($q$insert into public.enrollments (school_id, class_id, student_id, academic_year_id) select %L, %L, %L, academic_year_id from public.classes where id = %L$q$, a, class_a, p_stu_b, class_a), 'denied'),
      ('E06','Teacher enrolls a student',                       'teacher_a','exec', format($q$insert into public.enrollments (school_id, class_id, student_id, academic_year_id) select %L, %L, %L, academic_year_id from public.classes where id = %L$q$, a, class_a, p_stu_a2, class_a), 'denied'),
      ('G01','Link parent A to student A1 (control)',           'admin_a', 'exec',  format($q$insert into public.guardian_links (school_id, parent_id, student_id, relationship, is_primary) values (%L, %L, %L, 'mother', true)$q$, a, p_par_a, p_stu_a1), 'affected=1'),
      ('G02','Link parent A to a School B student',             'admin_a', 'exec',  format($q$insert into public.guardian_links (school_id, parent_id, student_id) values (%L, %L, %L)$q$, a, p_par_a, p_stu_b), 'denied'),
      ('G03','Link a student as someone''s parent',             'admin_a', 'exec',  format($q$insert into public.guardian_links (school_id, parent_id, student_id) values (%L, %L, %L)$q$, a, p_stu_a2, p_stu_a1), 'denied'),
      ('V01','Student A1 sees own enrollment',                  'student_a1','count','select 1 from public.enrollments', 'rows=1'),
      ('V02','Student A2 sees no one''s enrollment',            'student_a2','count','select 1 from public.enrollments', 'rows=0'),
      ('V03','Parent sees their child''s enrollment',           'parent_a','count', 'select 1 from public.enrollments', 'rows=1'),
      ('V04','Parent sees own guardian link',                   'parent_a','count', 'select 1 from public.guardian_links', 'rows=1'),
      ('V05','Unlinked student sees no guardian links',         'student_a2','count','select 1 from public.guardian_links', 'rows=0'),
      ('V06','Teacher sees enrollments (staff)',                'teacher_a','count','select 1 from public.enrollments', 'rows=1'),
      ('V07','School B admin sees none of A''s enrollments',    'admin_b', 'count', 'select 1 from public.enrollments', 'rows=0'),
      ('V08','Student sees the school''s classes',              'student_a1','count','select 1 from public.classes', 'rows=2'),
      ('D01','Delete a class that has students',                'admin_a', 'exec',  format('delete from public.classes where id = %L', class_a), 'denied'),
      ('D02','Delete an empty class (control)',                 'admin_a', 'exec',  format('delete from public.classes where id = %L', class_a2), 'affected=1'),
      ('D03','Audit trail records the enrollment',              'postgres','count', format($q$select 1 from public.audit_logs where action = 'enrollments.insert' and user_id = %L$q$, adm_a), 'rows=1'),
      ('F01','Admin A uploads into own logo folder',            'admin_a', 'exec',  format($q$insert into storage.objects (bucket_id, name) values ('school-logos', %L)$q$, a || '/logo-test.png'), 'affected=1'),
      ('F02','Admin A uploads into School B''s folder',         'admin_a', 'exec',  format($q$insert into storage.objects (bucket_id, name) values ('school-logos', %L)$q$, b || '/logo-evil.png'), 'denied'),
      ('F03','Teacher uploads a logo',                          'teacher_a','exec', format($q$insert into storage.objects (bucket_id, name) values ('school-logos', %L)$q$, a || '/logo-t.png'), 'denied')
    ) as c(id, descr, actor, kind, sql, expected)
    loop
      v_actor := case t.actor when 'admin_a' then adm_a when 'teacher_a' then tch_a when 'student_a1' then stu_a1
        when 'student_a2' then stu_a2 when 'parent_a' then par_a when 'admin_b' then adm_b end;
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

select * from pg_temp.educore_academics_tests();
