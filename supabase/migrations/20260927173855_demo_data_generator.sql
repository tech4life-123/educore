-- =============================================================================
-- EduCore — Demonstration data generator (milestone 11)
--
-- Builds complete FICTIONAL schools for demonstrations: staff, students,
-- parents, classes, a full 2025/2026 school year of assessments, scores,
-- attendance registers and issued report cards, plus announcements.
--
-- Safety
--   * Lives in the `demo` schema, which is not exposed through the API and
--     is callable only by the database owner (no grants to anon/authenticated).
--   * Every school it creates has schools.is_demo = true (banner in the app,
--     "DEMONSTRATION" on report cards, labelled on platform statistics).
--   * Generated people can't sign in: their Auth accounts have no password.
--     A school admin can give one a temporary password from User accounts.
--   * demo.remove_school / demo.remove_all delete ONLY schools with is_demo.
--
-- Bulk rows are written with session_replication_role = replica (triggers
-- off) so hundreds of thousands of fictional rows don't flood the audit log.
-- Integrity is guaranteed by construction here and checked afterwards
-- (supabase/demo/verify.sql). The school row itself is inserted normally so
-- its seeding triggers (settings, categories, grade levels) run.
--
-- Report cards use exactly the app's rules (lib/grades/report-card.ts):
-- category-weighted period grades, points-based exam grade, Liberian
-- semester average with the school's exam weight, yearly average, standard
-- competition ranking, promotion by yearly average ≥ passing score.
-- =============================================================================

create schema if not exists demo;
revoke all on schema demo from public, anon, authenticated;

-- Deterministic pseudo-random numbers from a text seed ------------------------
create or replace function demo.u(seed text) returns double precision
language sql immutable set search_path = '' as $$
  select (('x' || substr(md5(seed), 1, 8))::bit(32)::bigint)::double precision / 4294967296.0
$$;

-- Standard normal (Box–Muller).
create or replace function demo.n(seed text) returns double precision
language sql immutable set search_path = '' as $$
  select sqrt(-2 * ln(greatest(demo.u(seed || ':a'), 1e-12))) * cos(2 * pi() * demo.u(seed || ':b'))
$$;

create or replace function demo.pick(arr text[], seed text) returns text
language sql immutable set search_path = '' as $$
  select arr[1 + floor(demo.u(seed) * array_length(arr, 1))::int]
$$;

-- School calendar 2025/2026 (Liberia): weekdays minus holidays and breaks.
create or replace function demo.is_school_day(d date) returns boolean
language sql immutable set search_path = '' as $$
  select extract(isodow from d) < 6
     and d between date '2025-09-01' and date '2026-07-17'
     and d not between date '2025-12-19' and date '2026-01-05'   -- Christmas break
     and d not between date '2026-02-02' and date '2026-02-06'   -- semester break
     and d not between date '2026-04-03' and date '2026-04-10'   -- Easter break, Fast & Prayer Day
     and d not in (date '2025-11-06',   -- Thanksgiving Day
                   date '2026-01-07',   -- Pioneers' Day
                   date '2026-02-11',   -- Armed Forces Day
                   date '2026-03-11',   -- Decoration Day
                   date '2026-03-16',   -- J. J. Roberts' Birthday (observed)
                   date '2026-05-14')   -- National Unification Day
$$;

-- One fictional person: Auth account (no password) + profile ----------------
create or replace function demo.add_person(
  p_school uuid, p_code text, p_role public.app_role,
  p_first text, p_middle text, p_last text, p_username text
) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_user uuid := gen_random_uuid();
  v_email text := p_username || '@' || lower(p_code) || '.educore.invalid';
  v_at timestamptz := timestamptz '2025-08-20 09:00:00+00';
  v_profile uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change,
                          email_change_token_current, reauthentication_token, phone_change, phone_change_token)
  values ('00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated', v_email, '', v_at,
          jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'),
                             'educore_school_id', p_school, 'educore_demo', true),
          '{}'::jsonb, v_at, v_at, '', '', '', '', '', '', '', '');
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  values (v_user::text, v_user,
          jsonb_build_object('sub', v_user::text, 'email', v_email, 'email_verified', false, 'phone_verified', false),
          'email', v_at, v_at);
  insert into public.profiles (user_id, school_id, first_name, middle_name, last_name, role, status,
                               username, must_change_password, created_at, updated_at)
  values (v_user, p_school, p_first, p_middle, p_last, p_role, 'active', p_username, true, v_at, v_at)
  returning id into v_profile;
  return v_profile;
end;
$$;

-- -----------------------------------------------------------------------------
-- demo.create_school — one complete fictional school and its 2025/2026 year.
--   p_strength   points added to every student's ability (school quality)
--   p_attendance typical probability a student is in school on a given day
--   p_sections   classes per grade for Grades 9, 10, 11, 12
-- -----------------------------------------------------------------------------
create or replace function demo.create_school(
  p_code text, p_name text, p_city text, p_county text, p_motto text, p_color text,
  p_strength numeric, p_attendance numeric, p_sections int[], p_min_size int, p_max_size int
) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_school uuid; v_year uuid; v_admin uuid; v_t1 uuid; v_t2 uuid;
  v_first_f text[] := array['Aminata','Musu','Fatu','Comfort','Blessing','Esther','Mary','Grace','Hawa','Kebeh','Oretha',
    'Precious','Sarah','Victoria','Yamah','Zoe','Martha','Rebecca','Deborah','Patience','Josephine','Miatta','Siata',
    'Korto','Jartu','Ruth','Beatrice','Florence','Annie','Mercy','Princess','Gbessie','Satta','Mamie','Tenneh','Hannah'];
  v_first_m text[] := array['Emmanuel','Joseph','Moses','Prince','Samuel','Abraham','Mohammed','Varney','Jallah','Sekou',
    'Tamba','Daniel','David','Isaac','Peter','Paul','Richard','Francis','Augustine','Benedict','Kelvin','Lamine','Momo',
    'Alieu','Fayia','Nathaniel','Solomon','Patrick','George','James','John','Anthony','Ezekiel','Boimah','Arthur','Otis'];
  v_last text[] := array['Kollie','Flomo','Kamara','Johnson','Toe','Wesseh','Gbarbea','Mulbah','Kromah','Dukuly','Sackor',
    'Zinnah','Kpadeh','Saah','Tarr','Nyumah','Gono','Kesselly','Cooper','Freeman','Harris','Morris','Nimely','Pewee',
    'Quiah','Togba','Wleh','Zayzay','Sumo','Konneh','Sheriff','Massaquoi','Barnes','Davies','Paye','Jackson','Williams',
    'Kiazolu','Fallah','Karnga','Kerkula','Gbessay','Yarkpah','Lomax','Seekie','Dahn','Wolo','Kpehe'];
  v_streets text[] := array['Market Street','Church Street','Hospital Road','Broad Street','Airfield Road','Zone 3',
    'Stadium Road','School Road','Mission Road','Old Road','New Road','Waterside'];
  v_quals text[] := array['B.Sc. Education','B.A. Education','C-Certificate','B-Certificate','M.Ed.','B.Sc. Education'];
  r record; v_k int := 0; v_n int := 0; v_size int; v_id uuid; v_parent uuid; v_gender text; v_first text; v_surname text;
  v_rel text; v_seed text; v_tps int; v_classes int; v_teacher_n int := 0;
begin
  if exists (select 1 from public.schools where code = p_code) then
    raise exception 'A school with code % already exists', p_code;
  end if;

  -- The school row goes in with triggers ON (settings, categories, grade levels).
  insert into public.schools (name, code, slug, school_type, motto, city, county, country, primary_color, status, is_demo)
  values (p_name, p_code, lower(p_code), 'high_school', p_motto, p_city, p_county, 'Liberia', p_color, 'active', true)
  returning id into v_school;

  execute 'set local session_replication_role = replica';

  drop table if exists pg_temp.t_teacher, pg_temp.t_class, pg_temp.t_student;
  create temp table t_teacher (id uuid, subj text, k int) on commit drop;
  create temp table t_class (id uuid, name text, grade int, k int, homeroom uuid) on commit drop;
  create temp table t_student (id uuid, class_id uuid, n int, gender text, ability numeric, attp numeric) on commit drop;

  -- Year, semesters, grading periods ----------------------------------------
  insert into public.academic_years (school_id, name, starts_on, ends_on, is_current, created_at, updated_at)
  values (v_school, '2025/2026', '2025-09-01', '2026-07-31', true, '2025-08-15', '2025-08-15') returning id into v_year;
  insert into public.academic_terms (school_id, academic_year_id, name, sequence, starts_on, ends_on, created_at, updated_at)
  values (v_school, v_year, 'First Semester', 1, '2025-09-01', '2026-01-30', '2025-08-15', '2025-08-15') returning id into v_t1;
  insert into public.academic_terms (school_id, academic_year_id, name, sequence, starts_on, ends_on, created_at, updated_at)
  values (v_school, v_year, 'Second Semester', 2, '2026-02-09', '2026-07-17', '2025-08-15', '2025-08-15') returning id into v_t2;
  insert into public.grading_periods (school_id, term_id, name, sequence, kind, starts_on, ends_on, created_at, updated_at)
  values (v_school, v_t1, '1st Period', 1, 'marking_period', '2025-09-01', '2025-10-10', '2025-08-15', '2025-08-15'),
         (v_school, v_t1, '2nd Period', 2, 'marking_period', '2025-10-13', '2025-11-21', '2025-08-15', '2025-08-15'),
         (v_school, v_t1, '3rd Period', 3, 'marking_period', '2025-11-24', '2026-01-16', '2025-08-15', '2025-08-15'),
         (v_school, v_t1, 'First Semester Exam', 4, 'exam', '2026-01-19', '2026-01-30', '2025-08-15', '2025-08-15'),
         (v_school, v_t2, '4th Period', 1, 'marking_period', '2026-02-09', '2026-03-20', '2025-08-15', '2025-08-15'),
         (v_school, v_t2, '5th Period', 2, 'marking_period', '2026-03-23', '2026-05-01', '2025-08-15', '2025-08-15'),
         (v_school, v_t2, '6th Period', 3, 'marking_period', '2026-05-04', '2026-06-26', '2025-08-15', '2025-08-15'),
         (v_school, v_t2, 'Second Semester Exam', 4, 'exam', '2026-06-29', '2026-07-17', '2025-08-15', '2025-08-15');

  -- Subjects -----------------------------------------------------------------
  insert into public.subjects (school_id, name, code, is_active, created_at, updated_at)
  select v_school, s.name, s.code, true, '2025-08-15', '2025-08-15'
  from (values ('English','ENG'), ('Mathematics','MATH'), ('Biology','BIO'), ('Chemistry','CHEM'), ('Physics','PHY'),
               ('Geography','GEO'), ('History','HIST'), ('Economics','ECON'), ('French','FRE')) s(name, code);

  -- Principal (a school administrator profile) --------------------------------
  v_admin := demo.add_person(v_school, p_code, 'school_admin',
    demo.pick(v_first_f || v_first_m, p_code || ':pr:f'), null, demo.pick(v_last, p_code || ':pr:l'), 'principal');
  insert into public.staff_profiles (school_id, profile_id, employee_number, gender, job_title, qualification,
                                     specialization, employment_type, hire_date, created_at, updated_at)
  values (v_school, v_admin, 'EMP-001', case when demo.u(p_code || ':pr:g') < 0.4 then 'female' else 'male' end,
          'Principal', 'M.Ed.', 'School administration', 'full_time', '2014-09-01', '2025-08-20', '2025-08-20');

  -- Teachers: enough per subject that nobody teaches more than 4 classes -----
  v_classes := coalesce((select sum(x) from unnest(p_sections) x), 0);
  v_tps := greatest(1, ceil(v_classes / 4.0)::int);
  for r in select s.code, s.name, k from public.subjects s cross join generate_series(1, v_tps) k
           where s.school_id = v_school order by s.code, k loop
    v_teacher_n := v_teacher_n + 1;
    v_seed := p_code || ':t:' || v_teacher_n;
    v_gender := case when demo.u(v_seed || ':g') < 0.4 then 'female' else 'male' end;
    v_id := demo.add_person(v_school, p_code, 'teacher',
      demo.pick(case v_gender when 'female' then v_first_f else v_first_m end, v_seed || ':f'), null,
      demo.pick(v_last, v_seed || ':l'), 'tch' || lpad(v_teacher_n::text, 3, '0'));
    insert into public.staff_profiles (school_id, profile_id, employee_number, gender, job_title, qualification,
                                       specialization, employment_type, hire_date, created_at, updated_at)
    values (v_school, v_id, 'EMP-' || lpad((v_teacher_n + 1)::text, 3, '0'), v_gender, 'Teacher',
            demo.pick(v_quals, v_seed || ':q'), r.name,
            case when demo.u(v_seed || ':e') < 0.85 then 'full_time' else 'part_time' end,
            make_date(2012 + floor(demo.u(v_seed || ':h') * 13)::int, 9, 1), '2025-08-20', '2025-08-20');
    insert into t_teacher values (v_id, r.code, r.k);
  end loop;

  -- Classes (homeroom = one teacher each, in order) ---------------------------
  for r in select g, s from generate_series(9, 12) g cross join generate_series(1, 4) s
           where s <= coalesce(p_sections[g - 8], 0) order by g, s loop
    v_k := v_k + 1;
    insert into public.classes (school_id, academic_year_id, grade_level_id, name, homeroom_teacher_id, capacity, created_at, updated_at)
    select v_school, v_year, gl.id, r.g || chr(64 + r.s),
           (select t.id from t_teacher t order by t.subj, t.k offset ((v_k - 1) * 2) % v_teacher_n limit 1), 45, '2025-08-15', '2025-08-15'
    from public.grade_levels gl where gl.school_id = v_school and gl.name = 'Grade ' || r.g
    returning id into v_id;
    insert into t_class select v_id, r.g || chr(64 + r.s), r.g, v_k, c.homeroom_teacher_id from public.classes c where c.id = v_id;
  end loop;

  -- Each class takes every subject; the subject's teachers share the classes.
  insert into public.class_subjects (school_id, class_id, subject_id, teacher_id, created_at, updated_at)
  select v_school, c.id, s.id, t.id, '2025-08-20', '2025-08-20'
  from t_class c cross join public.subjects s
  join t_teacher t on t.subj = s.code and t.k = 1 + ((c.k - 1) % v_tps)
  where s.school_id = v_school;

  -- Students and their parents -----------------------------------------------
  for r in select * from t_class order by k loop
    v_size := p_min_size + floor(demo.u(p_code || ':size:' || r.name) * (p_max_size - p_min_size + 1))::int;
    for i in 1 .. v_size loop
      v_n := v_n + 1;
      v_seed := p_code || ':s:' || v_n;
      -- Girls' share falls slightly in the upper grades.
      v_gender := case when demo.u(v_seed || ':g') < 0.52 - (r.grade - 9) * 0.025 then 'female' else 'male' end;
      v_first := demo.pick(case v_gender when 'female' then v_first_f else v_first_m end, v_seed || ':f');
      v_surname := demo.pick(v_last, v_seed || ':l');
      v_id := demo.add_person(v_school, p_code, 'student', v_first,
        case when demo.u(v_seed || ':hm') < 0.3 then demo.pick(case v_gender when 'female' then v_first_f else v_first_m end, v_seed || ':m') end,
        v_surname, 'stu' || lpad(v_n::text, 4, '0'));

      v_rel := case when demo.u(v_seed || ':r') < 0.45 then 'mother' when demo.u(v_seed || ':r') < 0.75 then 'father'
                    when demo.u(v_seed || ':r') < 0.85 then 'grandparent' when demo.u(v_seed || ':r') < 0.95 then 'guardian' else 'sibling' end;
      v_parent := demo.add_person(v_school, p_code, 'parent',
        demo.pick(case v_rel when 'mother' then v_first_f when 'father' then v_first_m else v_first_f || v_first_m end, v_seed || ':pf'),
        null, case when v_rel = 'guardian' then demo.pick(v_last, v_seed || ':pl') else v_surname end,
        'par' || lpad(v_n::text, 4, '0'));

      insert into public.student_profiles (school_id, profile_id, admission_number, date_of_birth, gender, place_of_birth,
        nationality, home_address, admission_date, emergency_contact_name, created_at, updated_at)
      select v_school, v_id, (2025 - (r.grade - 9)) || '-' || lpad(v_n::text, 4, '0'),
             make_date(2025 - (r.grade + 6) - floor(demo.u(v_seed || ':by') * 3)::int, 1 + floor(demo.u(v_seed || ':bm') * 12)::int,
                       1 + floor(demo.u(v_seed || ':bd') * 28)::int),
             v_gender, p_city, 'Liberian', demo.pick(v_streets, v_seed || ':a') || ', ' || p_city,
             make_date(2025 - (r.grade - 9), 9, 1), p.first_name || ' ' || p.last_name, '2025-08-20', '2025-08-20'
      from public.profiles p where p.id = v_parent;

      insert into public.guardian_links (school_id, parent_id, student_id, relationship, is_primary, created_at, updated_at)
      values (v_school, v_parent, v_id, v_rel, true, '2025-08-20', '2025-08-20');
      insert into public.enrollments (school_id, academic_year_id, class_id, student_id, status, enrolled_on, created_at, updated_at)
      values (v_school, v_year, r.id, v_id, 'active', '2025-09-01', '2025-08-25', '2025-08-25');

      -- Traits: about 6% are often absent, which also hurts their results.
      insert into t_student values (v_id, r.id, v_n, v_gender,
        74 + p_strength + 8.5 * demo.n(v_seed || ':ab') - case when demo.u(v_seed || ':ch') < 0.06 then 8 else 0 end,
        least(0.995, greatest(0.40, p_attendance + 0.03 * demo.n(v_seed || ':at')
          - case when demo.u(v_seed || ':ch') < 0.06 then 0.2 else 0 end)));
    end loop;
  end loop;

  -- Assessments: per marking period a test, a quiz and an assignment; one exam
  -- per semester. ------------------------------------------------------------
  insert into public.assessments (school_id, class_subject_id, grading_period_id, category_id, title, max_score,
                                  assessed_on, created_by, created_at, updated_at)
  select v_school, cs.id, gp.id, cat.id, gp.name || ' ' || k.title, k.max_score, k.on_date, cs.teacher_id,
         k.on_date::timestamptz, k.on_date::timestamptz
  from public.class_subjects cs
  join public.grading_periods gp on gp.school_id = v_school and gp.kind = 'marking_period'
  cross join lateral (values ('Quiz', 'Quizzes', 20, gp.starts_on + 9),
                             ('Assignment', 'Assignments', 20, gp.starts_on + 16),
                             ('Test', 'Tests', 50, gp.ends_on - 4)) k(title, cat, max_score, on_date)
  join public.assessment_categories cat on cat.school_id = v_school and cat.name = k.cat
  where cs.school_id = v_school;

  insert into public.assessments (school_id, class_subject_id, grading_period_id, category_id, title, max_score,
                                  assessed_on, created_by, created_at, updated_at)
  select v_school, cs.id, gp.id, null, gp.name, 100, gp.starts_on + 2, cs.teacher_id,
         (gp.starts_on + 2)::timestamptz, (gp.starts_on + 2)::timestamptz
  from public.class_subjects cs
  join public.grading_periods gp on gp.school_id = v_school and gp.kind = 'exam'
  where cs.school_id = v_school;

  -- Scores: ability + subject strength + a little improvement in semester 2
  -- + noise. About 1.5% of quizzes/assignments excused; tests and exams never.
  insert into public.assessment_scores (school_id, assessment_id, student_id, score, is_excused, created_at, updated_at)
  select v_school, a.id, st.id,
         case when x.excused then null
              else round(a.max_score * least(100, greatest(10,
                     st.ability
                     + 6 * demo.n(st.id::text || ':' || sub.code)
                     + case sub.code when 'MATH' then -3 when 'PHY' then -3 when 'CHEM' then -2 when 'ENG' then 1 when 'HIST' then 1 else 0 end
                     + case when t.sequence = 2 then 1.5 else 0 end
                     + case when gp.kind = 'exam' then -3 when a.title like '%Assignment' then 5 when a.title like '%Quiz' then 2 else 0 end
                     + case when gp.kind = 'exam' then 7 when a.title like '%Quiz' then 10 else 8 end * demo.n(a.id::text || st.id::text)
                   )) / 100) end,
         x.excused, (a.assessed_on + 3)::timestamptz, (a.assessed_on + 3)::timestamptz
  from public.assessments a
  join public.class_subjects cs on cs.id = a.class_subject_id
  join public.subjects sub on sub.id = cs.subject_id
  join public.grading_periods gp on gp.id = a.grading_period_id
  join public.academic_terms t on t.id = gp.term_id
  join t_student st on st.class_id = cs.class_id
  cross join lateral (select (gp.kind = 'marking_period' and a.title not like '%Test'
                              and demo.u(a.id::text || st.id::text || ':ex') < 0.015) as excused) x
  where a.school_id = v_school;

  -- Every subject's grades submitted and every period published.
  insert into public.grade_submissions (school_id, class_subject_id, grading_period_id, submitted_by, submitted_at, created_at, updated_at)
  select v_school, cs.id, gp.id, cs.teacher_id, (gp.ends_on + 2)::timestamptz, (gp.ends_on + 2)::timestamptz, (gp.ends_on + 2)::timestamptz
  from public.class_subjects cs join public.grading_periods gp on gp.school_id = v_school
  where cs.school_id = v_school;
  update public.grading_periods set published_at = (ends_on + 5)::timestamptz + interval '10 hours', published_by = v_admin
  where school_id = v_school;

  -- Attendance: a register for every class on every school day ------------------
  insert into public.attendance_registers (school_id, class_id, date, taken_by, taken_at, created_at, updated_at)
  select v_school, c.id, d::date, c.homeroom,
         (d::date + time '08:05' + floor(demo.u(c.id::text || d::text) * 35) * interval '1 minute') at time zone 'Africa/Monrovia',
         (d::date + time '08:05') at time zone 'Africa/Monrovia', (d::date + time '08:05') at time zone 'Africa/Monrovia'
  from t_class c cross join generate_series(date '2025-09-01', date '2026-07-17', interval '1 day') d
  where demo.is_school_day(d::date);

  insert into public.attendance_records (school_id, register_id, class_id, date, student_id, status, recorded_by, created_at, updated_at)
  select v_school, rg.id, rg.class_id, rg.date, st.id,
         (case when x.u < x.p * 0.93 then 'present' when x.u < x.p then 'late'
               when x.u < x.p + (1 - x.p) * 0.8 then 'absent' else 'excused' end)::public.attendance_status,
         rg.taken_by, rg.taken_at, rg.taken_at
  from public.attendance_registers rg
  join t_student st on st.class_id = rg.class_id
  cross join lateral (select demo.u(st.id::text || rg.date::text) as u,
                             st.attp - case when extract(month from rg.date) in (6, 7) then 0.03 else 0 end as p) x
  where rg.school_id = v_school;

  execute 'set local session_replication_role = origin';
  perform demo.issue_cards(v_school);
  perform demo.add_announcements(v_school);
  return v_school;
end;
$$;

-- -----------------------------------------------------------------------------
-- demo.issue_cards — report cards for both semesters, computed with the app's
-- rules, plus a homeroom remark for every student. Replaces existing cards.
-- -----------------------------------------------------------------------------
create or replace function demo.issue_cards(p_school uuid) returns integer
language plpgsql set search_path = '' as $$
declare
  v_year uuid; v_year_name text; v_code text; v_admin uuid; v_ew numeric; v_w numeric; v_pass numeric; v_threshold numeric;
  v_n integer;
begin
  if not exists (select 1 from public.schools where id = p_school and is_demo) then
    raise exception 'Not a demonstration school';
  end if;
  select code into v_code from public.schools where id = p_school;
  select id, name into v_year, v_year_name from public.academic_years where school_id = p_school and is_current;
  select exam_weight, passing_score, attendance_threshold into v_ew, v_pass, v_threshold
  from public.school_settings where school_id = p_school;
  v_w := v_ew / 100;
  select id into v_admin from public.profiles where school_id = p_school and role = 'school_admin' order by created_at limit 1;

  execute 'set local session_replication_role = replica';
  delete from public.report_cards where school_id = p_school and academic_year_id = v_year;
  delete from public.report_card_remarks where school_id = p_school;

  drop table if exists pg_temp.c_pg, pg_temp.c_per, pg_temp.c_sub, pg_temp.c_all;

  -- Raw period grade per student, class subject and period.
  create temp table c_pg on commit drop as
  with cat as (
    select sc.student_id, a.class_subject_id cs, a.grading_period_id gp, a.category_id cid,
           sum(sc.score) e, sum(a.max_score) p
    from public.assessment_scores sc join public.assessments a on a.id = sc.assessment_id
    where a.school_id = p_school and not sc.is_excused and sc.score is not null and a.max_score > 0
    group by 1, 2, 3, 4)
  select c.student_id, c.cs, c.gp,
         case when g.kind = 'exam' then sum(c.e) / sum(c.p) * 100
              else sum(k.weight * c.e / c.p * 100) filter (where k.weight > 0)
                   / nullif(sum(k.weight) filter (where k.weight > 0), 0) end as grade
  from cat c join public.grading_periods g on g.id = c.gp
  left join public.assessment_categories k on k.id = c.cid
  group by c.student_id, c.cs, c.gp, g.kind;

  create temp table c_per on commit drop as
  select t.id term_id, t.name term_name, t.sequence tseq, t.starts_on, t.ends_on,
         g.id gp, g.name gname, g.kind, g.sequence gseq
  from public.academic_terms t join public.grading_periods g on g.term_id = t.id
  where t.academic_year_id = v_year;

  -- One row per student × subject × semester.
  create temp table c_sub on commit drop as
  select e.student_id, e.class_id, cs.id cs, s.name sname, s.code scode,
         nullif(concat_ws(' ', tp.first_name, tp.middle_name, tp.last_name), '') teacher,
         p.term_id, p.tseq,
         array_agg(round(pg.grade, 2) order by p.gseq) g2,
         array_agg(round(round(pg.grade, 2)) order by p.gseq) g2r,
         avg(round(pg.grade)) filter (where p.kind = 'marking_period') mp_avg,
         (array_agg(round(pg.grade) order by p.gseq) filter (where p.kind = 'exam'))[count(*) filter (where p.kind = 'exam')] ex
  from public.enrollments e
  join public.class_subjects cs on cs.class_id = e.class_id
  join public.subjects s on s.id = cs.subject_id
  left join public.profiles tp on tp.id = cs.teacher_id
  cross join c_per p
  left join c_pg pg on pg.student_id = e.student_id and pg.cs = cs.id and pg.gp = p.gp
  where e.school_id = p_school and e.academic_year_id = v_year and e.status = 'active'
  group by e.student_id, e.class_id, cs.id, s.name, s.code, tp.first_name, tp.middle_name, tp.last_name, p.term_id, p.tseq;

  alter table c_sub add column sem numeric, add column prev numeric, add column yearly numeric;
  update c_sub set sem = mp_avg * (1 - v_w) + ex * v_w;
  update c_sub c set prev = p.sem from c_sub p
   where c.tseq = 2 and p.tseq = 1 and p.student_id = c.student_id and p.cs = c.cs;
  update c_sub set yearly = (round(prev) + round(sem)) / 2.0 where tseq = 2 and prev is not null and sem is not null;

  -- One row per student × semester with the overall figures and ranks.
  create temp table c_all on commit drop as
  with per as (
    select student_id, term_id, i, round(avg(x), 2) v
    from c_sub, unnest(g2r) with ordinality u(x, i)
    group by student_id, term_id, i),
  per_arr as (
    select student_id, term_id, array_agg(v order by i) periods from per group by 1, 2),
  tot as (
    select student_id, class_id, term_id, tseq,
           case when bool_and(sem is not null) then round(avg(round(round(sem, 2))), 2) end semester,
           case when bool_and(prev is not null) then round(avg(round(round(prev, 2))), 2) end prev_semester,
           case when bool_and(yearly is not null) then round(avg(round(round(yearly, 2))), 2) end yearly,
           jsonb_agg(jsonb_build_object('name', sname, 'code', scode, 'teacher', teacher,
                                        'grades', to_jsonb(g2), 'semesterAverage', round(sem, 2))
                     || case when tseq = 2 then jsonb_build_object('previousSemesterAverage', round(prev, 2),
                                                                   'yearlyAverage', round(yearly, 2))
                             else '{}'::jsonb end
                     order by sname) subjects
    from c_sub group by student_id, class_id, term_id, tseq)
  select t.*, pa.periods,
         case when t.semester is not null then rank() over (partition by t.class_id, t.term_id, (t.semester is null) order by t.semester desc) end pos,
         count(t.semester) over (partition by t.class_id, t.term_id) ranked,
         case when t.yearly is not null then rank() over (partition by t.class_id, t.term_id, (t.yearly is null) order by t.yearly desc) end ypos,
         count(t.yearly) over (partition by t.class_id, t.term_id) yranked
  from tot t join per_arr pa using (student_id, term_id);

  insert into public.report_cards (school_id, student_id, class_id, academic_year_id, term_id, data, average, rank,
                                   class_size, issued_at, issued_by, created_at, updated_at)
  select p_school, a.student_id, a.class_id, v_year, a.term_id,
         jsonb_build_object(
           'version', 1,
           'student', jsonb_build_object('name', concat_ws(' ', sp.first_name, sp.middle_name, sp.last_name),
                                         'login', sp.username || '@' || upper(v_code)),
           'className', cl.name, 'gradeName', gl.name, 'yearName', v_year_name,
           'term', jsonb_build_object('id', a.term_id, 'name', tm.name, 'sequence', tm.sequence, 'isFinal', tm.sequence = 2),
           'periods', (select jsonb_agg(jsonb_build_object('id', p.gp, 'name', p.gname, 'kind', p.kind, 'published', true) order by p.gseq)
                       from c_per p where p.term_id = a.term_id),
           'subjects', a.subjects,
           'overall', jsonb_build_object('periods', to_jsonb(a.periods), 'semester', a.semester)
                      || case when tm.sequence = 2 then jsonb_build_object('previousSemester', a.prev_semester, 'yearly', a.yearly) else '{}'::jsonb end,
           'rank', jsonb_build_object('basis', tm.name || ' average', 'position', a.pos, 'of', a.ranked),
           'passingScore', v_pass, 'examWeight', v_ew)
         || case when tm.sequence = 2 then jsonb_build_object(
              'previousTermName', 'First Semester',
              'yearlyRank', jsonb_build_object('position', a.ypos, 'of', a.yranked),
              'promotion', case when a.yearly is null then null
                                when round(a.yearly) >= v_pass then 'promoted' else 'not_promoted' end)
            else '{}'::jsonb end
         || coalesce((select jsonb_build_object(
              'attendance', jsonb_build_object(
                'present', count(*) filter (where r.status = 'present'),
                'absent', count(*) filter (where r.status = 'absent'),
                'late', count(*) filter (where r.status = 'late'),
                'excused', count(*) filter (where r.status = 'excused'),
                'days', count(*),
                'rate', round(100.0 * count(*) filter (where r.status in ('present', 'late'))
                              / nullif(count(*) filter (where r.status in ('present', 'late', 'absent')), 0), 2)),
              'attendanceThreshold', v_threshold)
            from public.attendance_records r
            where r.school_id = p_school and r.student_id = a.student_id and r.date between tm.starts_on and tm.ends_on
            having count(*) > 0), '{}'::jsonb),
         coalesce(a.semester, a.periods[array_length(a.periods, 1)]), a.pos, a.ranked,
         (tm.ends_on + 7)::timestamptz + interval '9 hours', v_admin,
         (tm.ends_on + 7)::timestamptz + interval '9 hours', (tm.ends_on + 7)::timestamptz + interval '9 hours'
  from c_all a
  join public.profiles sp on sp.id = a.student_id
  join public.classes cl on cl.id = a.class_id
  join public.grade_levels gl on gl.id = cl.grade_level_id
  join public.academic_terms tm on tm.id = a.term_id;
  get diagnostics v_n = row_count;

  -- Homeroom remarks, worded by result and attendance.
  insert into public.report_card_remarks (school_id, student_id, class_id, term_id, remark, author_id, created_at, updated_at)
  select p_school, rc.student_id, rc.class_id, rc.term_id,
         case when rc.average >= 85 then demo.pick(array['Excellent work this semester. Keep it up!',
                                                          'An outstanding semester. Well done.',
                                                          'Consistently excellent. A model student.'], rc.id::text)
              when rc.average >= 77 then demo.pick(array['Very good progress. Keep working steadily.',
                                                          'Good, consistent work this semester.',
                                                          'Strong results. Aim even higher next semester.'], rc.id::text)
              when round(rc.average) >= v_pass then demo.pick(array['Satisfactory. More effort in weaker subjects will help.',
                                                          'A fair semester. Regular study will raise these grades.',
                                                          'Passing, but capable of more. Keep pushing.'], rc.id::text)
              else demo.pick(array['Below the passing mark. Needs extra study and close follow-up at home.',
                                   'Must work much harder. Please see the homeroom teacher with a parent.',
                                   'Struggling this semester. Extra classes are strongly advised.'], rc.id::text)
         end
         || case when (rc.data -> 'attendance' ->> 'rate')::numeric < v_threshold
                 then ' Attendance is too low and is affecting results.' else '' end,
         cl.homeroom_teacher_id, rc.issued_at - interval '2 days', rc.issued_at - interval '2 days'
  from public.report_cards rc join public.classes cl on cl.id = rc.class_id
  where rc.school_id = p_school and rc.academic_year_id = v_year and rc.average is not null;

  execute 'set local session_replication_role = origin';
  return v_n;
end;
$$;

-- -----------------------------------------------------------------------------
-- demo.add_announcements — a year of typical school notices.
-- -----------------------------------------------------------------------------
create or replace function demo.add_announcements(p_school uuid) returns void
language plpgsql set search_path = '' as $$
declare v_admin uuid; v_class uuid; v_teacher uuid; v_name text;
begin
  if not exists (select 1 from public.schools where id = p_school and is_demo) then
    raise exception 'Not a demonstration school';
  end if;
  select id into v_admin from public.profiles where school_id = p_school and role = 'school_admin' order by created_at limit 1;
  select c.id, cs.teacher_id into v_class, v_teacher
  from public.classes c join public.class_subjects cs on cs.class_id = c.id
  join public.subjects s on s.id = cs.subject_id and s.code = 'CHEM'
  where c.school_id = p_school order by c.name desc limit 1;
  select name into v_name from public.schools where id = p_school;

  execute 'set local session_replication_role = replica';
  delete from public.announcements where school_id = p_school;
  insert into public.announcements (school_id, title, body, audience, class_id, pinned, publish_at, expires_on, author_id, created_at, updated_at)
  select p_school, a.title, a.body, a.audience::public.announcement_audience, case when a.audience = 'class' then v_class end,
         a.pinned, a.pub_at, a.expires, case when a.audience = 'class' then v_teacher else v_admin end, a.pub_at, a.pub_at
  from (values
    ('Welcome to the 2025/2026 school year',
     'Classes begin on Monday, 1 September at 8:00 a.m. Students should arrive in full uniform with their exercise books. We look forward to a great year at ' || v_name || '.',
     'everyone', false, timestamptz '2025-08-25 09:00+00', null::date),
    ('PTA meeting — Saturday, 11 October',
     'All parents and guardians are invited to the first PTA meeting of the year at 10:00 a.m. in the school hall. We will discuss the school calendar and fees.',
     'parents', false, timestamptz '2025-10-02 12:00+00', date '2025-10-11'),
    ('First semester examination timetable',
     'First semester examinations run from 19 to 30 January. The full timetable is posted on the notice board. Students must clear all fees before sitting the exams.',
     'students', false, timestamptz '2025-12-10 10:00+00', date '2026-01-30'),
    ('First semester report cards are ready',
     'Report cards for the first semester are now available in EduCore. Parents can view them on their phones or collect a printed copy from the homeroom teacher.',
     'everyone', false, timestamptz '2026-02-06 09:30+00', null::date),
    ('Staff meeting on the marking scheme',
     'All teachers: short meeting on Thursday at 3:00 p.m. in the staff room to review the second semester marking scheme and grade submission dates.',
     'staff', false, timestamptz '2026-03-05 08:00+00', date '2026-03-12'),
    ('Chemistry practical — bring lab coats',
     'Our class will do the titration practical next Tuesday. Bring your lab coat and a pen. Absent students will not be able to make it up.',
     'class', false, timestamptz '2026-04-20 16:00+00', date '2026-04-28'),
    ('Inter-school sports day',
     'Our school hosts the inter-school sports day on Friday, 29 May. Classes end at 11:00 a.m. Parents are welcome to come and cheer.',
     'everyone', false, timestamptz '2026-05-20 10:00+00', date '2026-05-29'),
    ('Closing programme and promotion results',
     'The closing programme is on Friday, 24 July at 10:00 a.m. Final report cards and promotion results are available in EduCore from that day. Have a safe vacation!',
     'everyone', true, timestamptz '2026-07-20 09:00+00', null::date)
  ) a(title, body, audience, pinned, pub_at, expires);
  execute 'set local session_replication_role = origin';
end;
$$;

-- -----------------------------------------------------------------------------
-- Removal — demonstration schools only.
-- -----------------------------------------------------------------------------
create or replace function demo.remove_school(p_school uuid) returns void
language plpgsql set search_path = '' as $$
declare r record; v_users uuid[];
begin
  if not exists (select 1 from public.schools where id = p_school and is_demo) then
    raise exception 'Refusing to remove a school that is not a demonstration school';
  end if;
  select array_agg(user_id) into v_users from public.profiles where school_id = p_school;

  execute 'set local session_replication_role = replica';
  for r in select c.table_name from information_schema.columns c
           join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
           where c.table_schema = 'public' and c.column_name = 'school_id' and t.table_type = 'BASE TABLE'
             and c.table_name not in ('schools') loop
    execute format('delete from public.%I where school_id = $1', r.table_name) using p_school;
  end loop;
  delete from public.schools where id = p_school;
  execute 'set local session_replication_role = origin';

  -- Auth accounts with normal cascades (identities, sessions, tokens).
  delete from auth.users where id = any(coalesce(v_users, '{}'));
end;
$$;

create or replace function demo.remove_all() returns integer
language plpgsql set search_path = '' as $$
declare r record; v_n integer := 0;
begin
  for r in select id from public.schools where is_demo loop
    perform demo.remove_school(r.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Owner only.
revoke all on all functions in schema demo from public, anon, authenticated;
