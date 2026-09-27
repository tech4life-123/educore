-- =============================================================================
-- EduCore — Migration 016: Announcements
--
--   announcements       a message to an audience: everyone | staff | students |
--                       parents | one class (its students, their parents and
--                       the class's teachers)
--   announcement_reads  who has read what (for unread badges)
--
-- Who may do what (database-enforced):
--   * Admins post to any audience; teachers post only to a class they teach.
--   * Authors edit/delete their own posts; admins any post.
--   * Readers see an announcement only if they are in its audience, it has
--     reached its publish time and it hasn't expired.
--   * Everyone records only their own reads.
-- =============================================================================

create type public.announcement_audience as enum ('everyone', 'staff', 'students', 'parents', 'class');

create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete restrict,
  title       text not null check (char_length(btrim(title)) between 3 and 120),
  body        text not null check (char_length(btrim(body)) between 1 and 5000),
  audience    public.announcement_audience not null default 'everyone',
  class_id    uuid,
  pinned      boolean not null default false,
  publish_at  timestamptz not null default now(),
  expires_on  date,
  author_id   uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint announcements_id_school_key unique (id, school_id),
  constraint announcements_class_scope check ((audience = 'class') = (class_id is not null)),
  constraint announcements_class_fkey foreign key (class_id, school_id)
    references public.classes (id, school_id) on delete restrict,
  constraint announcements_author_fkey foreign key (author_id, school_id)
    references public.profiles (id, school_id) on delete restrict
);
create index announcements_school_publish_idx on public.announcements (school_id, publish_at desc);
create index announcements_class_school_idx on public.announcements (class_id, school_id);
create index announcements_author_idx on public.announcements (author_id, school_id);

create table public.announcement_reads (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools (id) on delete restrict,
  announcement_id  uuid not null,
  profile_id       uuid not null,
  read_at          timestamptz not null default now(),
  constraint announcement_reads_key unique (announcement_id, profile_id),
  constraint announcement_reads_announcement_fkey foreign key (announcement_id, school_id)
    references public.announcements (id, school_id) on delete cascade,
  constraint announcement_reads_profile_fkey foreign key (profile_id, school_id)
    references public.profiles (id, school_id) on delete restrict
);
create index announcement_reads_profile_idx on public.announcement_reads (profile_id, school_id);
create index announcement_reads_school_idx on public.announcement_reads (school_id);
create index announcement_reads_announcement_school_idx on public.announcement_reads (announcement_id, school_id);

-- -----------------------------------------------------------------------------
-- Audience check
-- -----------------------------------------------------------------------------
create or replace function private.in_announcement_audience(p_audience public.announcement_audience, p_class_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case p_audience
    when 'everyone' then true
    when 'staff' then private.current_app_role() in ('school_admin', 'teacher')
    when 'students' then private.current_app_role() = 'student'
    when 'parents' then private.current_app_role() = 'parent'
    when 'class' then
      private.teaches_class(p_class_id)
      or exists (
        select 1 from public.enrollments e
        where e.class_id = p_class_id and private.is_self_or_child(e.student_id)
      )
  end
$$;
revoke all on function private.in_announcement_audience(public.announcement_audience, uuid) from public;
grant execute on function private.in_announcement_audience(public.announcement_audience, uuid) to authenticated;

-- Caller may post to this audience: admins anywhere; teachers only to a class they teach.
create or replace function private.can_post_announcement(p_audience public.announcement_audience, p_class_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_school_admin()
      or (p_audience = 'class' and private.current_app_role() = 'teacher' and private.teaches_class(p_class_id))
$$;
revoke all on function private.can_post_announcement(public.announcement_audience, uuid) from public;
grant execute on function private.can_post_announcement(public.announcement_audience, uuid) to authenticated;

create or replace function private.check_announcement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := private.current_profile_id();
  else
    new.author_id := old.author_id;
  end if;
  if new.expires_on is not null and new.expires_on < (new.publish_at at time zone 'UTC')::date then
    raise exception 'The expiry date must be on or after the publish date' using errcode = '22023';
  end if;
  return new;
end; $$;

create or replace function private.check_announcement_read()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.profile_id := private.current_profile_id();
  new.read_at := now();
  return new;
end; $$;

create trigger announcements_check before insert or update on public.announcements
  for each row execute function private.check_announcement();
create trigger announcement_reads_check before insert on public.announcement_reads
  for each row execute function private.check_announcement_read();
create trigger announcements_set_updated_at before update on public.announcements
  for each row execute function private.set_updated_at();
create trigger announcements_audit after insert or update or delete on public.announcements
  for each row execute function private.audit_row_change();
-- Reads are high-volume, low-value events: not audited.

revoke all on public.announcements, public.announcement_reads from anon, authenticated;
grant select, insert, update, delete on public.announcements to authenticated;
grant select, insert on public.announcement_reads to authenticated;
alter table public.announcements enable row level security;
alter table public.announcements force row level security;
alter table public.announcement_reads enable row level security;
alter table public.announcement_reads force row level security;

create policy "Read announcements" on public.announcements for select to authenticated
  using (
    school_id = (select private.current_school_id())
    and (
      (select private.is_school_admin())
      or author_id = (select private.current_profile_id())
      or (
        publish_at <= now()
        and (expires_on is null or expires_on >= current_date)
        and private.in_announcement_audience(audience, class_id)
      )
    )
  );
create policy "Post announcements" on public.announcements for insert to authenticated
  with check (school_id = (select private.current_school_id()) and private.can_post_announcement(audience, class_id));
create policy "Edit own or any (admin) announcements" on public.announcements for update to authenticated
  using (
    school_id = (select private.current_school_id())
    and ((select private.is_school_admin()) or author_id = (select private.current_profile_id()))
  )
  with check (school_id = (select private.current_school_id()) and private.can_post_announcement(audience, class_id));
create policy "Delete own or any (admin) announcements" on public.announcements for delete to authenticated
  using (
    school_id = (select private.current_school_id())
    and ((select private.is_school_admin()) or author_id = (select private.current_profile_id()))
  );

create policy "Read own reads" on public.announcement_reads for select to authenticated
  using (school_id = (select private.current_school_id()) and profile_id = (select private.current_profile_id()));
create policy "Record own reads" on public.announcement_reads for insert to authenticated
  with check (
    school_id = (select private.current_school_id())
    and profile_id = (select private.current_profile_id())
    and exists (select 1 from public.announcements a where a.id = announcement_id)
  );
