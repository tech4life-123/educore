-- =============================================================================
-- EduCore — Migration 002: Tenant isolation (RLS) and privilege model
--
-- Rule: authenticated user -> active profile -> profile.school_id -> rows with
-- that school_id. Nothing else is visible to the browser-facing roles.
--
-- Defence in depth:
--   1. Table privileges: anon gets nothing; authenticated gets SELECT and only
--      column-scoped UPDATE. No INSERT/DELETE for browser roles at all.
--   2. RLS policies: row-level tenant scoping on every table.
--   3. Guard trigger: identity columns (role, school_id, user_id) cannot be
--      changed through a browser-role session even if a grant is added later.
--
-- super_admin gets NO cross-tenant access through RLS. Platform-wide
-- operations run server-side only (see ARCHITECTURE.md, "Super Admin").
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they can read profiles without
-- recursing into profiles' own RLS policies). They live in the unexposed
-- `private` schema and only return data about the calling user.
-- -----------------------------------------------------------------------------
create or replace function private.current_school_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.school_id
  from public.profiles p
  join public.schools s on s.id = p.school_id
  where p.user_id = (select auth.uid())
    and p.status = 'active'
    and s.status = 'active'
$$;

comment on function private.current_school_id() is
  'School of the calling user, only if both the profile and the school are active. NULL otherwise.';

create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.user_id = (select auth.uid())
    and p.status = 'active'
$$;

comment on function private.current_app_role() is
  'Role of the calling user if their profile is active. NULL otherwise.';

grant usage on schema private to authenticated;
revoke all on all functions in schema private from public;
grant execute on function private.current_school_id() to authenticated;
grant execute on function private.current_app_role() to authenticated;

-- -----------------------------------------------------------------------------
-- Table privileges (Supabase grants ALL to anon/authenticated by default;
-- start from zero and grant only what is needed).
-- -----------------------------------------------------------------------------
revoke all on public.schools, public.school_settings, public.profiles, public.audit_logs
  from anon, authenticated;

grant select on public.schools, public.school_settings, public.profiles, public.audit_logs
  to authenticated;

-- School admins may edit branding/contact details. Identity and lifecycle
-- columns (code, slug, school_type, status) are platform-controlled.
grant update (
  name, motto, logo_url, cover_image_url, address, city, county, country,
  phone, email, website, primary_color, secondary_color, timezone, currency
) on public.schools to authenticated;

grant update (
  academic_system, passing_score, attendance_threshold,
  allow_parent_accounts, allow_student_registration
) on public.school_settings to authenticated;

-- Users may edit their own personal details only. role, status, school_id and
-- user_id are deliberately NOT grantable to browser roles.
grant update (first_name, middle_name, last_name, phone, photo_url)
  on public.profiles to authenticated;

-- -----------------------------------------------------------------------------
-- Enable RLS (and FORCE it so even the table owner is subject to it when not
-- a superuser / BYPASSRLS role).
-- -----------------------------------------------------------------------------
alter table public.schools          enable row level security;
alter table public.school_settings  enable row level security;
alter table public.profiles         enable row level security;
alter table public.audit_logs       enable row level security;

alter table public.schools          force row level security;
alter table public.school_settings  force row level security;
alter table public.profiles         force row level security;
alter table public.audit_logs       force row level security;

-- -----------------------------------------------------------------------------
-- schools
-- -----------------------------------------------------------------------------
create policy "Members can read their own school"
  on public.schools for select
  to authenticated
  using (id = (select private.current_school_id()));

create policy "School admins can update their own school"
  on public.schools for update
  to authenticated
  using (
    id = (select private.current_school_id())
    and (select private.current_app_role()) = 'school_admin'
  )
  with check (
    id = (select private.current_school_id())
    and (select private.current_app_role()) = 'school_admin'
  );

-- -----------------------------------------------------------------------------
-- school_settings
-- -----------------------------------------------------------------------------
create policy "Members can read their school settings"
  on public.school_settings for select
  to authenticated
  using (school_id = (select private.current_school_id()));

create policy "School admins can update their school settings"
  on public.school_settings for update
  to authenticated
  using (
    school_id = (select private.current_school_id())
    and (select private.current_app_role()) = 'school_admin'
  )
  with check (
    school_id = (select private.current_school_id())
    and (select private.current_app_role()) = 'school_admin'
  );

-- -----------------------------------------------------------------------------
-- profiles
-- Everyone can read their own profile (even if inactive, so the app can
-- explain why access is blocked). Staff (school_admin, teacher) can read
-- profiles in their own school. Students and parents cannot list other users.
-- -----------------------------------------------------------------------------
create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Staff can read profiles in their school"
  on public.profiles for select
  to authenticated
  using (
    school_id = (select private.current_school_id())
    and (select private.current_app_role()) in ('school_admin', 'teacher')
  );

create policy "Users can update their own personal details"
  on public.profiles for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Belt and braces: even if a future migration grants broader column
-- privileges, a browser-role session can never change identity columns.
create or replace function private.guard_profile_identity_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.role      is distinct from old.role
       or new.school_id is distinct from old.school_id
       or new.user_id   is distinct from old.user_id
       or new.status    is distinct from old.status) then
    raise exception 'Not allowed to change role, school, status or account link'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_identity_columns
  before update on public.profiles
  for each row execute function private.guard_profile_identity_columns();

-- -----------------------------------------------------------------------------
-- audit_logs — readable by school admins for their own school only.
-- No write policies: rows are written exclusively by SECURITY DEFINER triggers.
-- -----------------------------------------------------------------------------
create policy "School admins can read their school audit log"
  on public.audit_logs for select
  to authenticated
  using (
    school_id = (select private.current_school_id())
    and (select private.current_app_role()) = 'school_admin'
  );
