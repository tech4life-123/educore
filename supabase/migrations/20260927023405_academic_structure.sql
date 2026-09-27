-- =============================================================================
-- EduCore — Migration 006: Academic structure, parent links, school logos
--
--   academic_years → academic_terms → grading_periods   (Liberian default:
--                                                        2 semesters × 3 periods + exam)
--   grade_levels (Nursery … Grade 12), subjects
--   classes → class_subjects (subject + teacher), enrollments (student ↔ class)
--   guardian_links (parent ↔ student)
--
-- Integrity rules:
--   * Every table carries school_id. Every cross-table link uses a COMPOSITE
--     foreign key (id, school_id), so a row can only ever point at rows of the
--     SAME school — enforced by PostgreSQL itself, not by app code.
--   * Role-typed links are checked by trigger (a homeroom teacher must be a
--     teacher/admin, an enrolled person must be a student, a guardian must be
--     a parent).
--   * Structural rows are readable by every active member of the school and
--     writable only by that school's administrators (RLS).
--   * Enrollments / guardian links are visible to staff, to the student
--     themself, and to that student's linked parents only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function private.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.profiles p
  where p.user_id = (select auth.uid()) and p.status = 'active'
$$;

create or replace function private.is_school_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_school_id() is not null
     and private.current_app_role() = 'school_admin'
$$;

grant execute on function private.current_profile_id() to authenticated;
grant execute on function private.is_school_admin() to authenticated;

-- Target for composite (same-school) foreign keys to people.
alter table public.profiles add constraint profiles_id_school_key unique (id, school_id);

-- Raise unless the profile has one of the allowed roles.
create or replace function private.assert_profile_role(p_profile_id uuid, p_roles public.app_role[], p_label text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_profile_id is null then return; end if;
  if not exists (select 1 from public.profiles where id = p_profile_id and role = any (p_roles)) then
    raise exception '% must be a %', p_label, array_to_string(p_roles, ' or ') using errcode = '22023';
  end if;
end;
$$;

create type public.term_period_kind as enum ('marking_period', 'exam');
create type public.school_stage as enum ('early_childhood', 'primary', 'junior_high', 'senior_high', 'other');
create type public.enrollment_status as enum ('active', 'withdrawn', 'transferred', 'completed');

-- -----------------------------------------------------------------------------
-- Academic calendar
-- -----------------------------------------------------------------------------
create table public.academic_years (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete restrict,
  name        text not null check (char_length(btrim(name)) between 4 and 40),
  starts_on   date not null,
  ends_on     date not null,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint academic_years_dates check (ends_on > starts_on),
  constraint academic_years_school_name_key unique (school_id, name),
  constraint academic_years_id_school_key unique (id, school_id)
);
create unique index academic_years_one_current on public.academic_years (school_id) where is_current;

create table public.academic_terms (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete restrict,
  academic_year_id  uuid not null,
  name              text not null check (char_length(btrim(name)) between 2 and 40),
  sequence          smallint not null check (sequence between 1 and 6),
  starts_on         date,
  ends_on           date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint academic_terms_dates check (starts_on is null or ends_on is null or ends_on >= starts_on),
  constraint academic_terms_year_seq_key unique (academic_year_id, sequence),
  constraint academic_terms_id_school_key unique (id, school_id),
  constraint academic_terms_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete cascade
);

create table public.grading_periods (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete restrict,
  term_id     uuid not null,
  name        text not null check (char_length(btrim(name)) between 2 and 40),
  sequence    smallint not null check (sequence between 1 and 10),
  kind        public.term_period_kind not null default 'marking_period',
  starts_on   date,
  ends_on     date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint grading_periods_dates check (starts_on is null or ends_on is null or ends_on >= starts_on),
  constraint grading_periods_term_seq_key unique (term_id, sequence),
  constraint grading_periods_id_school_key unique (id, school_id),
  constraint grading_periods_term_fkey foreign key (term_id, school_id)
    references public.academic_terms (id, school_id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- Grade levels & subjects
-- -----------------------------------------------------------------------------
create table public.grade_levels (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete restrict,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  sequence    smallint not null check (sequence between 1 and 99),
  stage       public.school_stage not null default 'other',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint grade_levels_school_seq_key unique (school_id, sequence),
  constraint grade_levels_id_school_key unique (id, school_id)
);
create unique index grade_levels_school_name_key on public.grade_levels (school_id, lower(name));

create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete restrict,
  name        text not null check (char_length(btrim(name)) between 2 and 80),
  code        text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{1,11}$'),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint subjects_school_code_key unique (school_id, code),
  constraint subjects_id_school_key unique (id, school_id)
);
create unique index subjects_school_name_key on public.subjects (school_id, lower(name));

-- -----------------------------------------------------------------------------
-- Classes, subject offerings, enrollments
-- -----------------------------------------------------------------------------
create table public.classes (
  id                   uuid primary key default gen_random_uuid(),
  school_id            uuid not null references public.schools (id) on delete restrict,
  academic_year_id     uuid not null,
  grade_level_id       uuid not null,
  name                 text not null check (char_length(btrim(name)) between 1 and 40),
  homeroom_teacher_id  uuid,
  capacity             smallint check (capacity is null or capacity between 1 and 500),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint classes_id_school_key unique (id, school_id),
  constraint classes_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete restrict,
  constraint classes_grade_fkey foreign key (grade_level_id, school_id)
    references public.grade_levels (id, school_id) on delete restrict,
  constraint classes_homeroom_fkey foreign key (homeroom_teacher_id, school_id)
    references public.profiles (id, school_id) on delete restrict
);
create unique index classes_year_name_key on public.classes (academic_year_id, lower(name));
create index classes_school_year_idx on public.classes (school_id, academic_year_id);

create table public.class_subjects (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete restrict,
  class_id    uuid not null,
  subject_id  uuid not null,
  teacher_id  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint class_subjects_class_subject_key unique (class_id, subject_id),
  constraint class_subjects_class_fkey foreign key (class_id, school_id)
    references public.classes (id, school_id) on delete cascade,
  constraint class_subjects_subject_fkey foreign key (subject_id, school_id)
    references public.subjects (id, school_id) on delete restrict,
  constraint class_subjects_teacher_fkey foreign key (teacher_id, school_id)
    references public.profiles (id, school_id) on delete restrict
);
create index class_subjects_teacher_idx on public.class_subjects (teacher_id);

create table public.enrollments (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete restrict,
  academic_year_id  uuid not null,
  class_id          uuid not null,
  student_id        uuid not null,
  status            public.enrollment_status not null default 'active',
  enrolled_on       date not null default current_date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- One class per student per academic year.
  constraint enrollments_student_year_key unique (student_id, academic_year_id),
  constraint enrollments_class_fkey foreign key (class_id, school_id)
    references public.classes (id, school_id) on delete restrict,
  constraint enrollments_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete restrict,
  constraint enrollments_student_fkey foreign key (student_id, school_id)
    references public.profiles (id, school_id) on delete restrict
);
create index enrollments_class_idx on public.enrollments (class_id);

-- -----------------------------------------------------------------------------
-- Parent / guardian ↔ student
-- -----------------------------------------------------------------------------
create table public.guardian_links (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id) on delete restrict,
  parent_id     uuid not null,
  student_id    uuid not null,
  relationship  text not null default 'guardian'
    check (relationship in ('mother', 'father', 'guardian', 'grandparent', 'sibling', 'other')),
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint guardian_links_pair_key unique (parent_id, student_id),
  constraint guardian_links_not_self check (parent_id <> student_id),
  constraint guardian_links_parent_fkey foreign key (parent_id, school_id)
    references public.profiles (id, school_id) on delete restrict,
  constraint guardian_links_student_fkey foreign key (student_id, school_id)
    references public.profiles (id, school_id) on delete restrict
);
create index guardian_links_student_idx on public.guardian_links (student_id);

-- -----------------------------------------------------------------------------
-- Integrity triggers
-- -----------------------------------------------------------------------------
create or replace function private.check_class_links()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_profile_role(new.homeroom_teacher_id, array['teacher','school_admin']::public.app_role[], 'Homeroom teacher');
  return new;
end; $$;

create or replace function private.check_class_subject_links()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_profile_role(new.teacher_id, array['teacher','school_admin']::public.app_role[], 'Subject teacher');
  return new;
end; $$;

-- Enrollment: the person must be a student; the year always follows the class.
create or replace function private.check_enrollment_links()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_profile_role(new.student_id, array['student']::public.app_role[], 'Enrolled person');
  select c.academic_year_id into new.academic_year_id from public.classes c where c.id = new.class_id;
  return new;
end; $$;

create or replace function private.check_guardian_links()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_profile_role(new.parent_id, array['parent']::public.app_role[], 'Guardian');
  perform private.assert_profile_role(new.student_id, array['student']::public.app_role[], 'Linked child');
  return new;
end; $$;

create trigger classes_check_links before insert or update on public.classes
  for each row execute function private.check_class_links();
create trigger class_subjects_check_links before insert or update on public.class_subjects
  for each row execute function private.check_class_subject_links();
create trigger enrollments_check_links before insert or update on public.enrollments
  for each row execute function private.check_enrollment_links();
create trigger guardian_links_check_links before insert or update on public.guardian_links
  for each row execute function private.check_guardian_links();

-- updated_at + audit on every new table
do $$
declare t text;
begin
  foreach t in array array['academic_years','academic_terms','grading_periods','grade_levels','subjects',
                           'classes','class_subjects','enrollments','guardian_links'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()', t || '_set_updated_at', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row_change()', t || '_audit', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Privileges + RLS
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['academic_years','academic_terms','grading_periods','grade_levels','subjects',
                           'classes','class_subjects','enrollments','guardian_links'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    -- Writes: administrators of the owning school only (one policy per command,
    -- so each table keeps a single SELECT policy).
    execute format($p$create policy "School admins insert %1$s" on public.%1$I for insert to authenticated
      with check (school_id = (select private.current_school_id()) and (select private.is_school_admin()))$p$, t);
    execute format($p$create policy "School admins update %1$s" on public.%1$I for update to authenticated
      using (school_id = (select private.current_school_id()) and (select private.is_school_admin()))
      with check (school_id = (select private.current_school_id()) and (select private.is_school_admin()))$p$, t);
    execute format($p$create policy "School admins delete %1$s" on public.%1$I for delete to authenticated
      using (school_id = (select private.current_school_id()) and (select private.is_school_admin()))$p$, t);
  end loop;

  -- Structural data: readable by every active member of the school.
  foreach t in array array['academic_years','academic_terms','grading_periods','grade_levels','subjects',
                           'classes','class_subjects'] loop
    execute format($p$create policy "Members read %1$s" on public.%1$I for select to authenticated
      using (school_id = (select private.current_school_id()))$p$, t);
  end loop;
end $$;

-- Enrollments: staff, the student, and the student's linked parents.
create policy "Members read relevant enrollments" on public.enrollments for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and (
      (select private.current_app_role()) in ('school_admin', 'teacher')
      or student_id = (select private.current_profile_id())
      or student_id in (select g.student_id from public.guardian_links g where g.parent_id = (select private.current_profile_id()))
    )
  );

-- Guardian links: staff, and the parent or student on the link.
create policy "Members read relevant guardian links" on public.guardian_links for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and (
      (select private.current_app_role()) in ('school_admin', 'teacher')
      or parent_id = (select private.current_profile_id())
      or student_id = (select private.current_profile_id())
    )
  );

-- -----------------------------------------------------------------------------
-- Default grade levels (Nursery … Grade 12) for existing and new schools
-- -----------------------------------------------------------------------------
create or replace function private.seed_grade_levels(p_school_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.grade_levels (school_id, name, sequence, stage)
  select p_school_id, v.name, v.seq, v.stage::public.school_stage
  from (values
    ('Nursery', 1, 'early_childhood'), ('K-I', 2, 'early_childhood'), ('K-II', 3, 'early_childhood'),
    ('Grade 1', 4, 'primary'), ('Grade 2', 5, 'primary'), ('Grade 3', 6, 'primary'),
    ('Grade 4', 7, 'primary'), ('Grade 5', 8, 'primary'), ('Grade 6', 9, 'primary'),
    ('Grade 7', 10, 'junior_high'), ('Grade 8', 11, 'junior_high'), ('Grade 9', 12, 'junior_high'),
    ('Grade 10', 13, 'senior_high'), ('Grade 11', 14, 'senior_high'), ('Grade 12', 15, 'senior_high')
  ) as v(name, seq, stage)
  on conflict do nothing;
end; $$;
revoke all on function private.seed_grade_levels(uuid) from public;

create or replace function private.seed_new_school_grade_levels()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.seed_grade_levels(new.id);
  return new;
end; $$;

create trigger schools_seed_grade_levels after insert on public.schools
  for each row execute function private.seed_new_school_grade_levels();

select private.seed_grade_levels(id) from public.schools;

-- -----------------------------------------------------------------------------
-- RPCs for school admins (SECURITY INVOKER: they run with the caller's rights,
-- so RLS still decides; they exist to make multi-row setup atomic).
-- -----------------------------------------------------------------------------

-- Create an academic year; template 'liberia' adds 2 semesters × (3 periods + exam)
-- with evenly spread, editable dates.
create or replace function public.create_academic_year(
  p_name text, p_starts_on date, p_ends_on date, p_template text, p_make_current boolean
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_school uuid := private.current_school_id();
  v_year uuid;
  v_term uuid;
  v_days integer;
  v_sem_start date;
  v_sem_end date;
  v_seg integer;
  s integer;
  p integer;
begin
  if v_school is null or not private.is_school_admin() then
    raise exception 'Only school administrators can create academic years' using errcode = '42501';
  end if;
  if p_ends_on <= p_starts_on then
    raise exception 'The year must end after it starts' using errcode = '22023';
  end if;

  if p_make_current then
    update public.academic_years set is_current = false where school_id = v_school and is_current;
  end if;

  insert into public.academic_years (school_id, name, starts_on, ends_on, is_current)
  values (v_school, btrim(p_name), p_starts_on, p_ends_on, coalesce(p_make_current, false))
  returning id into v_year;

  if p_template = 'liberia' then
    v_days := p_ends_on - p_starts_on;
    for s in 1..2 loop
      v_sem_start := p_starts_on + ((v_days * (s - 1)) / 2);
      v_sem_end := case when s = 2 then p_ends_on else p_starts_on + (v_days / 2) - 1 end;
      insert into public.academic_terms (school_id, academic_year_id, name, sequence, starts_on, ends_on)
      values (v_school, v_year, case s when 1 then 'First Semester' else 'Second Semester' end, s, v_sem_start, v_sem_end)
      returning id into v_term;

      v_seg := greatest((v_sem_end - v_sem_start) / 4, 1);
      for p in 1..4 loop
        insert into public.grading_periods (school_id, term_id, name, sequence, kind, starts_on, ends_on)
        values (
          v_school, v_term,
          case when p = 4 then case s when 1 then 'First Semester Exam' else 'Second Semester Exam' end
               else (array['1st','2nd','3rd','4th','5th','6th'])[(s - 1) * 3 + p] || ' Period' end,
          p,
          case when p = 4 then 'exam' else 'marking_period' end::public.term_period_kind,
          v_sem_start + v_seg * (p - 1),
          case when p = 4 then v_sem_end else v_sem_start + v_seg * p - 1 end
        );
      end loop;
    end loop;
  end if;

  return v_year;
end;
$$;

create or replace function public.set_current_academic_year(p_year_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare v_school uuid := private.current_school_id();
begin
  if v_school is null or not private.is_school_admin() then
    raise exception 'Only school administrators can change the current year' using errcode = '42501';
  end if;
  if not exists (select 1 from public.academic_years where id = p_year_id and school_id = v_school) then
    raise exception 'Academic year not found' using errcode = '22023';
  end if;
  update public.academic_years set is_current = false where school_id = v_school and is_current and id <> p_year_id;
  update public.academic_years set is_current = true where id = p_year_id;
end;
$$;

-- Standard Liberian secondary-school subjects (skips any that already exist).
create or replace function public.add_standard_subjects()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare v_school uuid := private.current_school_id(); v_count integer;
begin
  if v_school is null or not private.is_school_admin() then
    raise exception 'Only school administrators can add subjects' using errcode = '42501';
  end if;
  insert into public.subjects (school_id, name, code)
  select v_school, v.name, v.code from (values
    ('English', 'ENG'), ('Mathematics', 'MATH'), ('General Science', 'GSCI'), ('Biology', 'BIO'),
    ('Chemistry', 'CHEM'), ('Physics', 'PHY'), ('Social Studies', 'SOC'), ('Geography', 'GEO'),
    ('History', 'HIST'), ('Civics', 'CIV'), ('Economics', 'ECON'), ('Literature', 'LIT'),
    ('French', 'FRE'), ('Agriculture', 'AGRI'), ('Computer Science', 'COMP'),
    ('Religious and Moral Education', 'RME'), ('Physical Education', 'PE')
  ) as v(name, code)
  where not exists (
    select 1 from public.subjects s
    where s.school_id = v_school and (s.code = v.code or lower(s.name) = lower(v.name))
  );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.create_academic_year(text, date, date, text, boolean) from public, anon;
revoke all on function public.set_current_academic_year(uuid) from public, anon;
revoke all on function public.add_standard_subjects() from public, anon;
grant execute on function public.create_academic_year(text, date, date, text, boolean) to authenticated;
grant execute on function public.set_current_academic_year(uuid) to authenticated;
grant execute on function public.add_standard_subjects() to authenticated;

-- -----------------------------------------------------------------------------
-- School logos (Supabase Storage)
--   Public-read bucket; a school admin may write only inside the folder named
--   after their own school id:  school-logos/<school_id>/logo-<timestamp>.png
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-logos', 'school-logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "School admins upload their school logo" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'school-logos'
    and (storage.foldername(name))[1] = (select private.current_school_id())::text
    and (select private.is_school_admin())
  );

create policy "School admins read their logo folder" on storage.objects for select to authenticated
  using (
    bucket_id = 'school-logos'
    and (storage.foldername(name))[1] = (select private.current_school_id())::text
    and (select private.is_school_admin())
  );

create policy "School admins delete their school logo" on storage.objects for delete to authenticated
  using (
    bucket_id = 'school-logos'
    and (storage.foldername(name))[1] = (select private.current_school_id())::text
    and (select private.is_school_admin())
  );
