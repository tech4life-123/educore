-- Integrity checks after generating demo data (run in the Supabase SQL editor).
-- Every column except the last three must be 0.
with d as (select id from public.schools where is_demo)
select
 (select count(*) from public.classes c join public.profiles p on p.id = c.homeroom_teacher_id where c.school_id in (select id from d) and (p.role <> 'teacher' or p.school_id <> c.school_id)) homeroom_not_teacher,
 (select count(*) from public.class_subjects cs join public.profiles p on p.id = cs.teacher_id where cs.school_id in (select id from d) and (p.role <> 'teacher' or p.school_id <> cs.school_id)) subject_teacher_bad,
 (select count(*) from public.enrollments e join public.profiles p on p.id = e.student_id join public.classes c on c.id = e.class_id where e.school_id in (select id from d) and (p.role <> 'student' or c.academic_year_id <> e.academic_year_id)) enrolment_bad,
 (select count(*) from public.guardian_links g join public.profiles pp on pp.id = g.parent_id join public.profiles ps on ps.id = g.student_id where g.school_id in (select id from d) and (pp.role <> 'parent' or ps.role <> 'student')) guardian_bad,
 (select count(*) from public.attendance_records r join public.attendance_registers rg on rg.id = r.register_id where r.school_id in (select id from d) and (r.class_id <> rg.class_id or r.date <> rg.date)) record_register_mismatch,
 (select count(*) from public.attendance_records r where r.school_id in (select id from d) and not exists (select 1 from public.enrollments e where e.student_id = r.student_id and e.class_id = r.class_id)) record_not_enrolled,
 (select count(*) from public.attendance_registers rg where rg.school_id in (select id from d) and (not demo.is_school_day(rg.date) or rg.date > current_date)) register_bad_date,
 (select count(*) from public.assessment_scores s join public.assessments a on a.id = s.assessment_id join public.class_subjects cs on cs.id = a.class_subject_id where s.school_id in (select id from d) and (s.score > a.max_score or not exists (select 1 from public.enrollments e where e.student_id = s.student_id and e.class_id = cs.class_id))) score_bad,
 (select count(*) from public.report_cards rc where rc.school_id in (select id from d) and not exists (select 1 from public.enrollments e where e.student_id = rc.student_id and e.class_id = rc.class_id)) card_not_enrolled,
 (select count(*) from public.assessments a join public.grading_periods g on g.id = a.grading_period_id join public.academic_terms t on t.id = g.term_id join public.class_subjects cs on cs.id = a.class_subject_id join public.classes c on c.id = cs.class_id where a.school_id in (select id from d) and t.academic_year_id <> c.academic_year_id) assessment_wrong_year,
 (select count(*) from public.student_profiles sp join public.profiles p on p.id = sp.profile_id where sp.school_id in (select id from d) and p.role <> 'student') student_profile_bad,
 (select count(*) from public.staff_profiles sp join public.profiles p on p.id = sp.profile_id where sp.school_id in (select id from d) and p.role not in ('teacher', 'school_admin')) staff_profile_bad,
 (select count(*) from public.report_cards where school_id in (select id from d) and (average is null or rank is null)) cards_incomplete,
 (select count(*) from public.profiles where school_id in (select id from d)) demo_profiles,
 (select count(*) from auth.users where raw_app_meta_data ? 'educore_demo') demo_auth_users,
 (select count(*) from public.schools where is_demo) demo_schools;

-- Every foreign key in the public schema (the bulk load runs with triggers off).
do $$
declare r record; n bigint; bad text := ''; checked int := 0;
begin
  for r in
    select c.conname, c.conrelid::regclass child, c.confrelid::regclass parent,
           (select string_agg(format('c.%I', a.attname), ', ' order by k.ord) from unnest(c.conkey) with ordinality k(att, ord) join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.att) ccols,
           (select string_agg(format('p.%I', a.attname), ', ' order by k.ord) from unnest(c.confkey) with ordinality k(att, ord) join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.att) pcols,
           (select string_agg(format('c.%I is not null', a.attname), ' and ') from unnest(c.conkey) k(att) join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.att) nn
    from pg_constraint c where c.contype = 'f' and c.connamespace = 'public'::regnamespace
  loop
    execute format('select count(*) from %s c where %s and not exists (select 1 from %s p where (%s) = (%s))',
                   r.child, r.nn, r.parent, r.pcols, r.ccols) into n;
    checked := checked + 1;
    if n > 0 then bad := bad || format('%s:%s ', r.conname, n); end if;
  end loop;
  raise notice 'Foreign keys checked: %, orphans: [%]', checked, bad;
end $$;
