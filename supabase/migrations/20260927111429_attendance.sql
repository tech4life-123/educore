-- =============================================================================
-- EduCore — Migration 014: Attendance
--
--   attendance_registers  one register per class per school day ("taken")
--   attendance_records    one mark per student on a register:
--                         present | absent | late | excused
--
-- Who may do what (database-enforced):
--   * The class's homeroom teacher or a school admin takes / edits a register.
--   * Staff who teach the class (homeroom or a subject) and admins read it.
--   * A student reads their own marks; a parent their linked children's.
--   * Registers can't be dated in the future or outside the class's
--     academic year; only students enrolled in the class can be marked.
-- =============================================================================

create type public.attendance_status as enum ('present', 'absent', 'late', 'excused');

-- Caller teaches this class: homeroom teacher, or teacher of one of its subjects.
create or replace function private.teaches_class(p_class_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.classes c
    where c.id = p_class_id and c.homeroom_teacher_id = private.current_profile_id()
  ) or exists (
    select 1 from public.class_subjects cs
    where cs.class_id = p_class_id and cs.teacher_id = private.current_profile_id()
  )
$$;

-- Caller may take this class's register: an admin of the school, or its homeroom teacher.
create or replace function private.can_take_register(p_class_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.classes c
    where c.id = p_class_id
      and c.school_id = private.current_school_id()
      and (private.is_school_admin() or c.homeroom_teacher_id = private.current_profile_id())
  )
$$;

create table public.attendance_registers (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete restrict,
  class_id    uuid not null,
  date        date not null,
  taken_by    uuid,
  taken_at    timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint attendance_registers_class_date_key unique (class_id, date),
  constraint attendance_registers_id_school_key unique (id, school_id),
  constraint attendance_registers_class_fkey foreign key (class_id, school_id)
    references public.classes (id, school_id) on delete restrict,
  constraint attendance_registers_taken_by_fkey foreign key (taken_by, school_id)
    references public.profiles (id, school_id) on delete restrict
);
create index attendance_registers_school_date_idx on public.attendance_registers (school_id, date);
create index attendance_registers_class_school_idx on public.attendance_registers (class_id, school_id);
create index attendance_registers_taken_by_idx on public.attendance_registers (taken_by, school_id);

create table public.attendance_records (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools (id) on delete restrict,
  register_id  uuid not null,
  class_id     uuid not null,
  date         date not null,
  student_id   uuid not null,
  status       public.attendance_status not null default 'present',
  note         text check (char_length(note) <= 200),
  recorded_by  uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint attendance_records_register_student_key unique (register_id, student_id),
  constraint attendance_records_register_fkey foreign key (register_id, school_id)
    references public.attendance_registers (id, school_id) on delete cascade,
  constraint attendance_records_student_fkey foreign key (student_id, school_id)
    references public.profiles (id, school_id) on delete restrict,
  constraint attendance_records_class_fkey foreign key (class_id, school_id)
    references public.classes (id, school_id) on delete restrict,
  constraint attendance_records_recorded_by_fkey foreign key (recorded_by, school_id)
    references public.profiles (id, school_id) on delete restrict
);
create index attendance_records_student_date_idx on public.attendance_records (student_id, date);
create index attendance_records_student_school_idx on public.attendance_records (student_id, school_id);
create index attendance_records_class_date_idx on public.attendance_records (class_id, date);
create index attendance_records_class_school_idx on public.attendance_records (class_id, school_id);
create index attendance_records_register_school_idx on public.attendance_records (register_id, school_id);
create index attendance_records_school_idx on public.attendance_records (school_id);
create index attendance_records_recorded_by_idx on public.attendance_records (recorded_by, school_id);

-- -----------------------------------------------------------------------------
-- Integrity triggers
-- -----------------------------------------------------------------------------
create or replace function private.check_attendance_register()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_start date;
  v_end date;
  v_today date;
begin
  select y.starts_on, y.ends_on, (now() at time zone s.timezone)::date
    into v_start, v_end, v_today
  from public.classes c
  join public.academic_years y on y.id = c.academic_year_id
  join public.schools s on s.id = c.school_id
  where c.id = new.class_id;

  if new.date > v_today then
    raise exception 'Attendance can’t be taken for a future date' using errcode = '22023';
  end if;
  if new.date < v_start or new.date > v_end then
    raise exception 'That date is outside the class’s academic year' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and (new.class_id <> old.class_id or new.date <> old.date) then
    raise exception 'A register can’t be moved to another class or date' using errcode = '22023';
  end if;
  new.taken_by := private.current_profile_id();
  new.taken_at := now();
  return new;
end;
$$;

create or replace function private.check_attendance_record()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Class and date always come from the register.
  select r.class_id, r.date into new.class_id, new.date
  from public.attendance_registers r where r.id = new.register_id;
  if tg_op = 'UPDATE' and (new.register_id <> old.register_id or new.student_id <> old.student_id) then
    raise exception 'An attendance mark can’t be moved to another register or student' using errcode = '22023';
  end if;
  if not exists (select 1 from public.enrollments e where e.class_id = new.class_id and e.student_id = new.student_id) then
    raise exception 'That student is not enrolled in this class' using errcode = '22023';
  end if;
  new.recorded_by := private.current_profile_id();
  return new;
end;
$$;

create trigger attendance_registers_check before insert or update on public.attendance_registers
  for each row execute function private.check_attendance_register();
create trigger attendance_records_check before insert or update on public.attendance_records
  for each row execute function private.check_attendance_record();

do $$
declare t text;
begin
  foreach t in array array['attendance_registers', 'attendance_records'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()', t || '_set_updated_at', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row_change()', t || '_audit', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

do $$
declare f text;
begin
  foreach f in array array['teaches_class(uuid)', 'can_take_register(uuid)'] loop
    execute format('revoke all on function private.%s from public', f);
    execute format('grant execute on function private.%s to authenticated', f);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
create policy "Staff read registers" on public.attendance_registers for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and ((select private.is_school_admin()) or private.teaches_class(class_id))
  );
create policy "Register takers insert registers" on public.attendance_registers for insert to authenticated
  with check (school_id = (select private.current_school_id()) and private.can_take_register(class_id));
create policy "Register takers update registers" on public.attendance_registers for update to authenticated
  using (school_id = (select private.current_school_id()) and private.can_take_register(class_id))
  with check (school_id = (select private.current_school_id()) and private.can_take_register(class_id));
create policy "Register takers delete registers" on public.attendance_registers for delete to authenticated
  using (school_id = (select private.current_school_id()) and private.can_take_register(class_id));

create policy "Read attendance records" on public.attendance_records for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and (
      (select private.is_school_admin())
      or private.teaches_class(class_id)
      or private.is_self_or_child(student_id)
    )
  );
create policy "Register takers insert records" on public.attendance_records for insert to authenticated
  with check (school_id = (select private.current_school_id()) and private.can_take_register(class_id));
create policy "Register takers update records" on public.attendance_records for update to authenticated
  using (school_id = (select private.current_school_id()) and private.can_take_register(class_id))
  with check (school_id = (select private.current_school_id()) and private.can_take_register(class_id));
create policy "Register takers delete records" on public.attendance_records for delete to authenticated
  using (school_id = (select private.current_school_id()) and private.can_take_register(class_id));
