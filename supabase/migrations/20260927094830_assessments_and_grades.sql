-- =============================================================================
-- EduCore — Migration 010: Assessments & grades
--
--   assessment_categories  per-school weighted categories (Tests 40, Quizzes 20, …)
--   assessments            a quiz/test/… for one class subject in one grading period
--   assessment_scores      one student's score on one assessment
--   grade_submissions      a teacher hands a class subject's period in for review
--   grading_periods        + published_at / published_by (admin publishes a period)
--   school_settings        + exam_weight (Liberian standard: 50%)
--
-- Who may do what (enforced here, not in app code):
--   * Grades are entered by the teacher assigned to that subject in that class,
--     or by a school admin (private.can_grade).
--   * Students see their own scores, parents their linked children's scores —
--     only for PUBLISHED grading periods.
--   * Once a period is published it is locked for everyone; once a teacher has
--     submitted, it is locked for the teacher until an admin returns it.
--   * Every change is audited.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Settings and publishing columns
-- -----------------------------------------------------------------------------
alter table public.school_settings
  add column exam_weight numeric(5, 2) not null default 50 check (exam_weight between 0 and 100);
grant update (exam_weight) on public.school_settings to authenticated;

alter table public.grading_periods
  add column published_at timestamptz,
  add column published_by uuid,
  add constraint grading_periods_published_by_fkey foreign key (published_by, school_id)
    references public.profiles (id, school_id) on delete restrict;
create index grading_periods_published_by_idx on public.grading_periods (published_by, school_id);

-- Target for composite foreign keys to class subjects.
alter table public.class_subjects add constraint class_subjects_id_school_key unique (id, school_id);

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.assessment_categories (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete restrict,
  name        text not null check (char_length(btrim(name)) between 2 and 40),
  weight      numeric(5, 2) not null check (weight between 0 and 100),
  sequence    smallint not null default 1 check (sequence between 1 and 99),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint assessment_categories_id_school_key unique (id, school_id)
);
create unique index assessment_categories_school_name_key on public.assessment_categories (school_id, lower(name));

create table public.assessments (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools (id) on delete restrict,
  class_subject_id   uuid not null,
  grading_period_id  uuid not null,
  category_id        uuid,
  title              text not null check (char_length(btrim(title)) between 2 and 80),
  max_score          numeric(6, 2) not null check (max_score > 0 and max_score <= 1000),
  assessed_on        date,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint assessments_id_school_key unique (id, school_id),
  constraint assessments_class_subject_fkey foreign key (class_subject_id, school_id)
    references public.class_subjects (id, school_id) on delete restrict,
  constraint assessments_period_fkey foreign key (grading_period_id, school_id)
    references public.grading_periods (id, school_id) on delete restrict,
  constraint assessments_category_fkey foreign key (category_id, school_id)
    references public.assessment_categories (id, school_id) on delete restrict,
  constraint assessments_created_by_fkey foreign key (created_by, school_id)
    references public.profiles (id, school_id) on delete restrict
);
create index assessments_class_subject_period_idx on public.assessments (class_subject_id, grading_period_id);
create index assessments_period_idx on public.assessments (grading_period_id, school_id);
create index assessments_category_idx on public.assessments (category_id, school_id);
create index assessments_created_by_idx on public.assessments (created_by, school_id);

create table public.assessment_scores (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools (id) on delete restrict,
  assessment_id  uuid not null,
  student_id     uuid not null,
  score          numeric(6, 2) check (score is null or score >= 0),
  is_excused     boolean not null default false,
  comment        text check (char_length(comment) <= 200),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint assessment_scores_assessment_student_key unique (assessment_id, student_id),
  constraint assessment_scores_value check (is_excused or score is not null),
  constraint assessment_scores_assessment_fkey foreign key (assessment_id, school_id)
    references public.assessments (id, school_id) on delete cascade,
  constraint assessment_scores_student_fkey foreign key (student_id, school_id)
    references public.profiles (id, school_id) on delete restrict
);
create index assessment_scores_student_idx on public.assessment_scores (student_id, school_id);
create index assessment_scores_assessment_school_idx on public.assessment_scores (assessment_id, school_id);

create table public.grade_submissions (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools (id) on delete restrict,
  class_subject_id   uuid not null,
  grading_period_id  uuid not null,
  submitted_by       uuid,
  submitted_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint grade_submissions_key unique (class_subject_id, grading_period_id),
  constraint grade_submissions_class_subject_fkey foreign key (class_subject_id, school_id)
    references public.class_subjects (id, school_id) on delete cascade,
  constraint grade_submissions_period_fkey foreign key (grading_period_id, school_id)
    references public.grading_periods (id, school_id) on delete cascade,
  constraint grade_submissions_by_fkey foreign key (submitted_by, school_id)
    references public.profiles (id, school_id) on delete restrict
);
create index grade_submissions_period_idx on public.grade_submissions (grading_period_id, school_id);
create index grade_submissions_class_subject_school_idx on public.grade_submissions (class_subject_id, school_id);
create index grade_submissions_by_idx on public.grade_submissions (submitted_by, school_id);

-- -----------------------------------------------------------------------------
-- Authorization helpers (private schema, SECURITY DEFINER, facts about the caller only)
-- -----------------------------------------------------------------------------

-- Caller is an admin of the class subject's school, or its assigned teacher.
create or replace function private.can_grade(p_class_subject_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.class_subjects cs
    where cs.id = p_class_subject_id
      and cs.school_id = private.current_school_id()
      and (private.is_school_admin() or cs.teacher_id = private.current_profile_id())
  )
$$;

create or replace function private.can_grade_assessment(p_assessment_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private.can_grade(a.class_subject_id) from public.assessments a where a.id = p_assessment_id), false)
$$;

create or replace function private.period_published(p_period_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.grading_periods where id = p_period_id and published_at is not null)
$$;

create or replace function private.assessment_published(p_assessment_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assessments a join public.grading_periods gp on gp.id = a.grading_period_id
    where a.id = p_assessment_id and gp.published_at is not null
  )
$$;

-- The student is the caller, or a child linked to the caller.
create or replace function private.is_self_or_child(p_student_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_student_id = private.current_profile_id()
      or exists (
        select 1 from public.guardian_links g
        where g.parent_id = private.current_profile_id() and g.student_id = p_student_id
      )
$$;

-- The caller (or one of their children) is enrolled in the class of this class subject.
create or replace function private.can_see_class_subject(p_class_subject_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.class_subjects cs
    join public.enrollments e on e.class_id = cs.class_id
    where cs.id = p_class_subject_id and private.is_self_or_child(e.student_id)
  )
$$;

do $$
declare f text;
begin
  foreach f in array array['can_grade(uuid)', 'can_grade_assessment(uuid)', 'period_published(uuid)',
                           'assessment_published(uuid)', 'is_self_or_child(uuid)', 'can_see_class_subject(uuid)'] loop
    execute format('revoke all on function private.%s from public', f);
    execute format('grant execute on function private.%s to authenticated', f);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Integrity & locking triggers
-- -----------------------------------------------------------------------------

-- Raise if grades for this class subject + period may not be changed by the caller.
create or replace function private.assert_grades_unlocked(p_class_subject_id uuid, p_period_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from public.grading_periods where id = p_period_id and published_at is not null) then
    raise exception 'This grading period has been published, so its grades are locked. An administrator must unpublish it first.'
      using errcode = 'P0001';
  end if;
  if not private.is_school_admin() and exists (
    select 1 from public.grade_submissions where class_subject_id = p_class_subject_id and grading_period_id = p_period_id
  ) then
    raise exception 'These grades were submitted for review. Ask an administrator to return them before making changes.'
      using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.check_assessment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_class_year uuid;
  v_period_year uuid;
  v_kind public.term_period_kind;
  v_max numeric;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.assert_grades_unlocked(old.class_subject_id, old.grading_period_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  perform private.assert_grades_unlocked(new.class_subject_id, new.grading_period_id);

  select c.academic_year_id into v_class_year
  from public.class_subjects cs join public.classes c on c.id = cs.class_id
  where cs.id = new.class_subject_id;
  select t.academic_year_id, gp.kind into v_period_year, v_kind
  from public.grading_periods gp join public.academic_terms t on t.id = gp.term_id
  where gp.id = new.grading_period_id;
  if v_class_year is distinct from v_period_year then
    raise exception 'The grading period must belong to the same academic year as the class' using errcode = '22023';
  end if;

  if v_kind = 'exam' then
    new.category_id := null;
  elsif new.category_id is null then
    raise exception 'Choose a category for this assessment' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := private.current_profile_id();
  else
    new.created_by := old.created_by;
    select max(score) into v_max from public.assessment_scores where assessment_id = new.id;
    if v_max is not null and new.max_score < v_max then
      raise exception 'Some students already scored % — the maximum can''t be lower than that', v_max using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.check_assessment_score()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_row public.assessment_scores := coalesce(new, old);
  v_cs uuid;
  v_period uuid;
  v_max numeric;
begin
  select a.class_subject_id, a.grading_period_id, a.max_score into v_cs, v_period, v_max
  from public.assessments a where a.id = v_row.assessment_id;

  -- Deleting an assessment cascades to its scores; the assessment trigger already checked the lock.
  if v_cs is null then
    return coalesce(new, old);
  end if;
  perform private.assert_grades_unlocked(v_cs, v_period);
  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'UPDATE' and (new.assessment_id <> old.assessment_id or new.student_id <> old.student_id) then
    raise exception 'A score can''t be moved to another assessment or student' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.class_subjects cs join public.enrollments e on e.class_id = cs.class_id
    where cs.id = v_cs and e.student_id = new.student_id
  ) then
    raise exception 'That student is not enrolled in this class' using errcode = '22023';
  end if;
  if new.is_excused then
    new.score := null;
  elsif new.score > v_max then
    raise exception 'A score can''t be more than the maximum of %', v_max using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function private.check_grade_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.grading_periods where id = (coalesce(new, old)).grading_period_id and published_at is not null) then
    raise exception 'This grading period has already been published' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    new.submitted_by := private.current_profile_id();
    new.submitted_at := now();
    return new;
  end if;
  return old;
end;
$$;

-- A student with grades in a class can't simply be removed from it.
create or replace function private.check_enrollment_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.assessment_scores s
    join public.assessments a on a.id = s.assessment_id
    join public.class_subjects cs on cs.id = a.class_subject_id
    where cs.class_id = old.class_id and s.student_id = old.student_id
  ) then
    raise exception 'This student already has grades in this class' using errcode = '23503';
  end if;
  return old;
end;
$$;

create trigger assessments_check before insert or update or delete on public.assessments
  for each row execute function private.check_assessment();
create trigger assessment_scores_check before insert or update or delete on public.assessment_scores
  for each row execute function private.check_assessment_score();
create trigger grade_submissions_check before insert or delete on public.grade_submissions
  for each row execute function private.check_grade_submission();
create trigger enrollments_check_delete before delete on public.enrollments
  for each row execute function private.check_enrollment_delete();

do $$
declare t text;
begin
  foreach t in array array['assessment_categories', 'assessments', 'assessment_scores', 'grade_submissions'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()', t || '_set_updated_at', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row_change()', t || '_audit', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Privileges + RLS
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.assessment_categories to authenticated;
grant select, insert, update, delete on public.assessments to authenticated;
grant select, insert, update, delete on public.assessment_scores to authenticated;
grant select, insert, delete on public.grade_submissions to authenticated;

-- Categories: every member reads; admins write.
create policy "Members read assessment categories" on public.assessment_categories for select to authenticated
  using (school_id = (select private.current_school_id()));
create policy "School admins insert assessment categories" on public.assessment_categories for insert to authenticated
  with check (school_id = (select private.current_school_id()) and (select private.is_school_admin()));
create policy "School admins update assessment categories" on public.assessment_categories for update to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_school_admin()))
  with check (school_id = (select private.current_school_id()) and (select private.is_school_admin()));
create policy "School admins delete assessment categories" on public.assessment_categories for delete to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_school_admin()));

-- Assessments: graders see and edit; students/parents see published ones for their classes.
create policy "Read assessments" on public.assessments for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and (
      private.can_grade(class_subject_id)
      or (private.period_published(grading_period_id) and private.can_see_class_subject(class_subject_id))
    )
  );
create policy "Graders insert assessments" on public.assessments for insert to authenticated
  with check (school_id = (select private.current_school_id()) and private.can_grade(class_subject_id));
create policy "Graders update assessments" on public.assessments for update to authenticated
  using (school_id = (select private.current_school_id()) and private.can_grade(class_subject_id))
  with check (school_id = (select private.current_school_id()) and private.can_grade(class_subject_id));
create policy "Graders delete assessments" on public.assessments for delete to authenticated
  using (school_id = (select private.current_school_id()) and private.can_grade(class_subject_id));

-- Scores: graders see and edit; a student sees their own, a parent their children's, once published.
create policy "Read assessment scores" on public.assessment_scores for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and (
      private.can_grade_assessment(assessment_id)
      or (private.assessment_published(assessment_id) and private.is_self_or_child(student_id))
    )
  );
create policy "Graders insert assessment scores" on public.assessment_scores for insert to authenticated
  with check (school_id = (select private.current_school_id()) and private.can_grade_assessment(assessment_id));
create policy "Graders update assessment scores" on public.assessment_scores for update to authenticated
  using (school_id = (select private.current_school_id()) and private.can_grade_assessment(assessment_id))
  with check (school_id = (select private.current_school_id()) and private.can_grade_assessment(assessment_id));
create policy "Graders delete assessment scores" on public.assessment_scores for delete to authenticated
  using (school_id = (select private.current_school_id()) and private.can_grade_assessment(assessment_id));

-- Submissions: staff read; the grader submits; the grader or an admin withdraws/returns.
create policy "Staff read grade submissions" on public.grade_submissions for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and (select private.current_app_role()) in ('school_admin', 'teacher')
  );
create policy "Graders submit grades" on public.grade_submissions for insert to authenticated
  with check (school_id = (select private.current_school_id()) and private.can_grade(class_subject_id));
create policy "Graders or admins withdraw submissions" on public.grade_submissions for delete to authenticated
  using (school_id = (select private.current_school_id()) and private.can_grade(class_subject_id));

-- -----------------------------------------------------------------------------
-- Default categories (editable per school)
-- -----------------------------------------------------------------------------
create or replace function private.seed_assessment_categories(p_school_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.assessment_categories (school_id, name, weight, sequence)
  select p_school_id, v.name, v.weight, v.seq
  from (values ('Tests', 40, 1), ('Quizzes', 20, 2), ('Assignments', 20, 3), ('Projects', 10, 4), ('Class participation', 10, 5))
    as v(name, weight, seq)
  where not exists (
    select 1 from public.assessment_categories c where c.school_id = p_school_id and lower(c.name) = lower(v.name)
  );
end; $$;
revoke all on function private.seed_assessment_categories(uuid) from public;

create or replace function private.seed_new_school_assessment_categories()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.seed_assessment_categories(new.id);
  return new;
end; $$;

create trigger schools_seed_assessment_categories after insert on public.schools
  for each row execute function private.seed_new_school_assessment_categories();

select private.seed_assessment_categories(id) from public.schools;

-- -----------------------------------------------------------------------------
-- Publishing (admins). SECURITY INVOKER: RLS on grading_periods still applies.
-- -----------------------------------------------------------------------------
create or replace function public.set_grading_period_published(p_period_id uuid, p_published boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare v_school uuid := private.current_school_id();
begin
  if v_school is null or not private.is_school_admin() then
    raise exception 'Only school administrators can publish grades' using errcode = '42501';
  end if;
  update public.grading_periods
     set published_at = case when p_published then now() end,
         published_by = case when p_published then private.current_profile_id() end
   where id = p_period_id and school_id = v_school;
  if not found then
    raise exception 'Grading period not found' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.set_grading_period_published(uuid, boolean) from public, anon;
grant execute on function public.set_grading_period_published(uuid, boolean) to authenticated;
