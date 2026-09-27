-- =============================================================================
-- EduCore — Migration 015: Student and staff profiles
--
--   student_profiles  school record details for a student (admission number,
--                     date of birth, gender, address, emergency contact …)
--   staff_profiles    employment details for a teacher / administrator
--
-- Personal data is visible only to those who need it (database-enforced):
--   * student details: school admins; teachers who teach the student's class;
--     the student; the student's linked parents
--   * staff details: school admins; the staff member themself
--   * only school admins write either table
-- =============================================================================

-- Caller teaches a class the student is (or was) enrolled in.
create or replace function private.teaches_student(p_student_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.enrollments e
    where e.student_id = p_student_id and private.teaches_class(e.class_id)
  )
$$;
revoke all on function private.teaches_student(uuid) from public;
grant execute on function private.teaches_student(uuid) to authenticated;

create table public.student_profiles (
  id                       uuid primary key default gen_random_uuid(),
  school_id                uuid not null references public.schools (id) on delete restrict,
  profile_id               uuid not null,
  admission_number         text check (admission_number ~ '^[A-Za-z0-9][A-Za-z0-9/-]{0,29}$'),
  date_of_birth            date check (date_of_birth is null or date_of_birth between date '1950-01-01' and date '2100-01-01'),
  gender                   text check (gender in ('female', 'male')),
  place_of_birth           text check (char_length(place_of_birth) <= 100),
  nationality              text check (char_length(nationality) <= 60),
  home_address             text check (char_length(home_address) <= 300),
  admission_date           date,
  previous_school          text check (char_length(previous_school) <= 150),
  emergency_contact_name   text check (char_length(emergency_contact_name) <= 120),
  emergency_contact_phone  text check (char_length(emergency_contact_phone) <= 30),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint student_profiles_profile_key unique (profile_id),
  constraint student_profiles_profile_fkey foreign key (profile_id, school_id)
    references public.profiles (id, school_id) on delete restrict
);
create unique index student_profiles_admission_key on public.student_profiles (school_id, upper(admission_number))
  where admission_number is not null;
create index student_profiles_school_idx on public.student_profiles (school_id);
create index student_profiles_profile_school_idx on public.student_profiles (profile_id, school_id);

create table public.staff_profiles (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools (id) on delete restrict,
  profile_id         uuid not null,
  employee_number    text check (employee_number ~ '^[A-Za-z0-9][A-Za-z0-9/-]{0,29}$'),
  gender             text check (gender in ('female', 'male')),
  job_title          text check (char_length(job_title) <= 80),
  qualification      text check (char_length(qualification) <= 150),
  specialization     text check (char_length(specialization) <= 150),
  employment_type    text check (employment_type in ('full_time', 'part_time', 'volunteer', 'contract')),
  hire_date          date,
  home_address       text check (char_length(home_address) <= 300),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint staff_profiles_profile_key unique (profile_id),
  constraint staff_profiles_profile_fkey foreign key (profile_id, school_id)
    references public.profiles (id, school_id) on delete restrict
);
create unique index staff_profiles_employee_key on public.staff_profiles (school_id, upper(employee_number))
  where employee_number is not null;
create index staff_profiles_school_idx on public.staff_profiles (school_id);
create index staff_profiles_profile_school_idx on public.staff_profiles (profile_id, school_id);

create or replace function private.check_student_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_profile_role(new.profile_id, array['student']::public.app_role[], 'The person');
  if tg_op = 'UPDATE' and new.profile_id <> old.profile_id then
    raise exception 'A student record can’t be moved to another person' using errcode = '22023';
  end if;
  return new;
end; $$;

create or replace function private.check_staff_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_profile_role(new.profile_id, array['teacher', 'school_admin']::public.app_role[], 'The person');
  if tg_op = 'UPDATE' and new.profile_id <> old.profile_id then
    raise exception 'A staff record can’t be moved to another person' using errcode = '22023';
  end if;
  return new;
end; $$;

create trigger student_profiles_check before insert or update on public.student_profiles
  for each row execute function private.check_student_profile();
create trigger staff_profiles_check before insert or update on public.staff_profiles
  for each row execute function private.check_staff_profile();

do $$
declare t text;
begin
  foreach t in array array['student_profiles', 'staff_profiles'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()', t || '_set_updated_at', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row_change()', t || '_audit', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format($p$create policy "School admins insert %1$s" on public.%1$I for insert to authenticated
      with check (school_id = (select private.current_school_id()) and (select private.is_school_admin()))$p$, t);
    execute format($p$create policy "School admins update %1$s" on public.%1$I for update to authenticated
      using (school_id = (select private.current_school_id()) and (select private.is_school_admin()))
      with check (school_id = (select private.current_school_id()) and (select private.is_school_admin()))$p$, t);
    execute format($p$create policy "School admins delete %1$s" on public.%1$I for delete to authenticated
      using (school_id = (select private.current_school_id()) and (select private.is_school_admin()))$p$, t);
  end loop;
end $$;

create policy "Read student profiles" on public.student_profiles for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and (
      (select private.is_school_admin())
      or private.teaches_student(profile_id)
      or private.is_self_or_child(profile_id)
    )
  );

create policy "Read staff profiles" on public.staff_profiles for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and ((select private.is_school_admin()) or profile_id = (select private.current_profile_id()))
  );
