-- =============================================================================
-- EduCore — Migration 012: Report cards
--
--   report_cards          an ISSUED report card: one row per student per semester,
--                         holding the grades exactly as issued (jsonb), the
--                         overall average and the class rank. Issued by admins.
--   report_card_remarks   the homeroom teacher's remark per student per semester
--   promotion_decisions   an administrator's override of the automatic
--                         promoted / not promoted outcome for a year
--
-- Visibility: admins; the class's homeroom teacher; the student; the
-- student's linked parents (remarks only once a card has been issued).
-- =============================================================================

-- Caller is the homeroom teacher of the class.
create or replace function private.is_homeroom(p_class_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.classes c
    where c.id = p_class_id and c.homeroom_teacher_id = private.current_profile_id()
  )
$$;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.report_cards (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete restrict,
  student_id        uuid not null,
  class_id          uuid not null,
  academic_year_id  uuid not null,
  term_id           uuid not null,
  data              jsonb not null check (jsonb_typeof(data) = 'object'),
  average           numeric(5, 2) check (average is null or average between 0 and 100),
  rank              integer check (rank is null or rank >= 1),
  class_size        integer not null check (class_size >= 0),
  issued_at         timestamptz not null default now(),
  issued_by         uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint report_cards_student_term_key unique (student_id, term_id),
  constraint report_cards_student_fkey foreign key (student_id, school_id)
    references public.profiles (id, school_id) on delete restrict,
  constraint report_cards_class_fkey foreign key (class_id, school_id)
    references public.classes (id, school_id) on delete restrict,
  constraint report_cards_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete restrict,
  constraint report_cards_term_fkey foreign key (term_id, school_id)
    references public.academic_terms (id, school_id) on delete restrict,
  constraint report_cards_issued_by_fkey foreign key (issued_by, school_id)
    references public.profiles (id, school_id) on delete restrict
);
create index report_cards_school_idx on public.report_cards (school_id);
create index report_cards_student_school_idx on public.report_cards (student_id, school_id);
create index report_cards_class_term_idx on public.report_cards (class_id, term_id);
create index report_cards_class_school_idx on public.report_cards (class_id, school_id);
create index report_cards_year_school_idx on public.report_cards (academic_year_id, school_id);
create index report_cards_term_school_idx on public.report_cards (term_id, school_id);
create index report_cards_issued_by_idx on public.report_cards (issued_by, school_id);

create table public.report_card_remarks (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete restrict,
  student_id  uuid not null,
  class_id    uuid not null,
  term_id     uuid not null,
  remark      text not null check (char_length(btrim(remark)) between 1 and 600),
  author_id   uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint report_card_remarks_student_term_key unique (student_id, term_id),
  constraint report_card_remarks_student_fkey foreign key (student_id, school_id)
    references public.profiles (id, school_id) on delete restrict,
  constraint report_card_remarks_class_fkey foreign key (class_id, school_id)
    references public.classes (id, school_id) on delete restrict,
  constraint report_card_remarks_term_fkey foreign key (term_id, school_id)
    references public.academic_terms (id, school_id) on delete restrict,
  constraint report_card_remarks_author_fkey foreign key (author_id, school_id)
    references public.profiles (id, school_id) on delete restrict
);
create index report_card_remarks_school_idx on public.report_card_remarks (school_id);
create index report_card_remarks_student_school_idx on public.report_card_remarks (student_id, school_id);
create index report_card_remarks_class_school_idx on public.report_card_remarks (class_id, school_id);
create index report_card_remarks_term_school_idx on public.report_card_remarks (term_id, school_id);
create index report_card_remarks_author_idx on public.report_card_remarks (author_id, school_id);

create table public.promotion_decisions (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete restrict,
  student_id        uuid not null,
  academic_year_id  uuid not null,
  decision          text not null check (decision in ('promoted', 'not_promoted')),
  note              text check (char_length(note) <= 300),
  decided_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint promotion_decisions_student_year_key unique (student_id, academic_year_id),
  constraint promotion_decisions_student_fkey foreign key (student_id, school_id)
    references public.profiles (id, school_id) on delete restrict,
  constraint promotion_decisions_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete restrict,
  constraint promotion_decisions_by_fkey foreign key (decided_by, school_id)
    references public.profiles (id, school_id) on delete restrict
);
create index promotion_decisions_school_idx on public.promotion_decisions (school_id);
create index promotion_decisions_student_school_idx on public.promotion_decisions (student_id, school_id);
create index promotion_decisions_year_school_idx on public.promotion_decisions (academic_year_id, school_id);
create index promotion_decisions_by_idx on public.promotion_decisions (decided_by, school_id);

-- A card has been issued for this student and semester.
create or replace function private.report_card_issued(p_student_id uuid, p_term_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.report_cards where student_id = p_student_id and term_id = p_term_id)
$$;

-- -----------------------------------------------------------------------------
-- Integrity triggers
-- -----------------------------------------------------------------------------

-- The student must be enrolled in the class, and the semester must belong to the class's year.
create or replace function private.assert_report_scope(p_student_id uuid, p_class_id uuid, p_term_id uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_year uuid;
begin
  select c.academic_year_id into v_year
  from public.classes c join public.academic_terms t on t.academic_year_id = c.academic_year_id
  where c.id = p_class_id and t.id = p_term_id;
  if v_year is null then
    raise exception 'The semester must belong to the class''s academic year' using errcode = '22023';
  end if;
  if not exists (select 1 from public.enrollments where class_id = p_class_id and student_id = p_student_id) then
    raise exception 'That student is not enrolled in this class' using errcode = '22023';
  end if;
  return v_year;
end;
$$;

create or replace function private.check_report_card()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.academic_year_id := private.assert_report_scope(new.student_id, new.class_id, new.term_id);
  new.issued_by := private.current_profile_id();
  new.issued_at := now();
  return new;
end;
$$;

create or replace function private.check_report_card_remark()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_report_scope(new.student_id, new.class_id, new.term_id);
  new.author_id := private.current_profile_id();
  return new;
end;
$$;

create or replace function private.check_promotion_decision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_profile_role(new.student_id, array['student']::public.app_role[], 'Promotion decisions');
  new.decided_by := private.current_profile_id();
  return new;
end;
$$;

create trigger report_cards_check before insert or update on public.report_cards
  for each row execute function private.check_report_card();
create trigger report_card_remarks_check before insert or update on public.report_card_remarks
  for each row execute function private.check_report_card_remark();
create trigger promotion_decisions_check before insert or update on public.promotion_decisions
  for each row execute function private.check_promotion_decision();

do $$
declare t text;
begin
  foreach t in array array['report_cards', 'report_card_remarks', 'promotion_decisions'] loop
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
  foreach f in array array['is_homeroom(uuid)', 'report_card_issued(uuid, uuid)'] loop
    execute format('revoke all on function private.%s from public', f);
    execute format('grant execute on function private.%s to authenticated', f);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

-- Report cards: admins issue; admins, the homeroom teacher, the student and linked parents read.
create policy "Read report cards" on public.report_cards for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and ((select private.is_school_admin()) or private.is_homeroom(class_id) or private.is_self_or_child(student_id))
  );
create policy "School admins insert report cards" on public.report_cards for insert to authenticated
  with check (school_id = (select private.current_school_id()) and (select private.is_school_admin()));
create policy "School admins update report cards" on public.report_cards for update to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_school_admin()))
  with check (school_id = (select private.current_school_id()) and (select private.is_school_admin()));
create policy "School admins delete report cards" on public.report_cards for delete to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_school_admin()));

-- Remarks: written by the homeroom teacher or an admin; students/parents read once the card is issued.
create policy "Read report card remarks" on public.report_card_remarks for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and (
      (select private.is_school_admin())
      or private.is_homeroom(class_id)
      or (private.is_self_or_child(student_id) and private.report_card_issued(student_id, term_id))
    )
  );
create policy "Homeroom or admin insert remarks" on public.report_card_remarks for insert to authenticated
  with check (
    school_id = (select private.current_school_id())
    and ((select private.is_school_admin()) or private.is_homeroom(class_id))
  );
create policy "Homeroom or admin update remarks" on public.report_card_remarks for update to authenticated
  using (school_id = (select private.current_school_id()) and ((select private.is_school_admin()) or private.is_homeroom(class_id)))
  with check (school_id = (select private.current_school_id()) and ((select private.is_school_admin()) or private.is_homeroom(class_id)));
create policy "Homeroom or admin delete remarks" on public.report_card_remarks for delete to authenticated
  using (school_id = (select private.current_school_id()) and ((select private.is_school_admin()) or private.is_homeroom(class_id)));

-- Promotion overrides: admins write; staff, the student and linked parents read.
create policy "Read promotion decisions" on public.promotion_decisions for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and (
      (select private.current_app_role()) in ('school_admin', 'teacher')
      or private.is_self_or_child(student_id)
    )
  );
create policy "School admins insert promotion decisions" on public.promotion_decisions for insert to authenticated
  with check (school_id = (select private.current_school_id()) and (select private.is_school_admin()));
create policy "School admins update promotion decisions" on public.promotion_decisions for update to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_school_admin()))
  with check (school_id = (select private.current_school_id()) and (select private.is_school_admin()));
create policy "School admins delete promotion decisions" on public.promotion_decisions for delete to authenticated
  using (school_id = (select private.current_school_id()) and (select private.is_school_admin()));
