-- =============================================================================
-- EduCore — Migration 005: User management
--
-- Adds login identity columns to profiles and the database functions that
-- school admins (and platform super admins) use to manage members.
--
-- Security model:
--   * Auth accounts (auth.users) are created/updated by the server with the
--     service-role key — but ONLY after the corresponding function below has
--     authorized the caller using THEIR OWN session (auth.uid()). The
--     database, not the app, decides who may manage whom.
--   * Every function is SECURITY DEFINER with an empty search_path, derives
--     the caller's school from their own active profile, and never trusts a
--     school id from the client for school admins.
--   * Profile changes made here are captured by the existing audit trigger
--     with the acting admin as user_id.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- New profile columns
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column username text
    check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  add column email text
    check (email is null or (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  add column must_change_password boolean not null default false;

comment on column public.profiles.username is
  'School-issued login name (lower case). Signs in as <username>@<SCHOOL CODE>.';
comment on column public.profiles.email is
  'Real email address used to sign in, if the person has one.';
comment on column public.profiles.must_change_password is
  'True after an admin sets a temporary password; the user must choose a new one at next sign-in.';

create unique index profiles_school_username_key
  on public.profiles (school_id, username)
  where username is not null;

-- Identity columns stay out of reach of browser roles (no column grants),
-- and the guard trigger now covers the new ones too.
create or replace function private.guard_profile_identity_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.role                 is distinct from old.role
       or new.school_id            is distinct from old.school_id
       or new.user_id              is distinct from old.user_id
       or new.status               is distinct from old.status
       or new.username             is distinct from old.username
       or new.email                is distinct from old.email
       or new.must_change_password is distinct from old.must_change_password) then
    raise exception 'Not allowed to change role, school, status, login or password flags'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Shared authorization helper: may the caller manage members of p_school_id?
-- -----------------------------------------------------------------------------
create or replace function private.assert_can_manage_school(p_school_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := private.current_app_role();
begin
  if v_role = 'super_admin' then
    if not exists (select 1 from public.schools where id = p_school_id and status <> 'archived') then
      raise exception 'School not found' using errcode = '22023';
    end if;
    return;
  end if;

  if v_role = 'school_admin' and p_school_id = private.current_school_id() then
    return;
  end if;

  raise exception 'Not authorized to manage users in this school' using errcode = '42501';
end;
$$;

-- Resolve a target member and check the caller may manage them.
-- Returns the target's (school_id, user_id). Never allows acting on yourself
-- or on a platform super admin.
create or replace function private.resolve_manageable_member(p_profile_id uuid)
returns table (school_id uuid, user_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_target public.profiles%rowtype;
begin
  select * into v_target from public.profiles p where p.id = p_profile_id;
  if not found then
    raise exception 'User not found' using errcode = '22023';
  end if;
  if v_target.role = 'super_admin' then
    raise exception 'Platform administrators cannot be managed here' using errcode = '42501';
  end if;
  if v_target.user_id = (select auth.uid()) then
    raise exception 'You cannot change your own account here' using errcode = '42501';
  end if;

  perform private.assert_can_manage_school(v_target.school_id);
  return query select v_target.school_id, v_target.user_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- create_member — link a freshly created auth user to a school
-- -----------------------------------------------------------------------------
create or replace function public.create_member(
  p_school_id   uuid,
  p_user_id     uuid,
  p_first_name  text,
  p_middle_name text,
  p_last_name   text,
  p_role        public.app_role,
  p_username    text,
  p_email       text,
  p_phone       text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
begin
  perform private.assert_can_manage_school(p_school_id);

  if p_role = 'super_admin' then
    raise exception 'Platform administrators cannot be created here' using errcode = '42501';
  end if;

  if p_role = 'parent' and not coalesce(
       (select s.allow_parent_accounts from public.school_settings s where s.school_id = p_school_id), false) then
    raise exception 'Parent accounts are turned off for this school' using errcode = '22023';
  end if;

  if nullif(btrim(p_username), '') is null and nullif(btrim(p_email), '') is null then
    raise exception 'A username or an email address is required' using errcode = '22023';
  end if;

  insert into public.profiles (
    user_id, school_id, first_name, middle_name, last_name, phone,
    role, status, username, email, must_change_password
  ) values (
    p_user_id, p_school_id, btrim(p_first_name), nullif(btrim(p_middle_name), ''), btrim(p_last_name),
    nullif(btrim(p_phone), ''), p_role, 'active',
    lower(nullif(btrim(p_username), '')), lower(nullif(btrim(p_email), '')), true
  )
  returning id into v_profile_id;

  return v_profile_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- set_member_status — suspend / reactivate / deactivate
-- Returns the target auth user id so the server can mirror the change in Auth.
-- -----------------------------------------------------------------------------
create or replace function public.set_member_status(p_profile_id uuid, p_status public.profile_status)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if p_status = 'invited' then
    raise exception 'Invalid status' using errcode = '22023';
  end if;

  select m.user_id into v_user_id from private.resolve_manageable_member(p_profile_id) m;

  update public.profiles set status = p_status where id = p_profile_id;
  return v_user_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- require_password_change — authorize an admin password reset
-- Flags the account; the server then sets the temporary password in Auth.
-- -----------------------------------------------------------------------------
create or replace function public.require_password_change(p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select m.user_id into v_user_id from private.resolve_manageable_member(p_profile_id) m;

  update public.profiles set must_change_password = true where id = p_profile_id;
  return v_user_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- platform_create_school — super admins only
-- -----------------------------------------------------------------------------
create or replace function public.platform_create_school(
  p_name          text,
  p_code          text,
  p_slug          text,
  p_school_type   public.school_type,
  p_motto         text,
  p_city          text,
  p_county        text,
  p_country       text,
  p_primary_color text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_id uuid;
begin
  if private.current_app_role() is distinct from 'super_admin' then
    raise exception 'Only platform administrators can create schools' using errcode = '42501';
  end if;

  insert into public.schools (name, code, slug, school_type, motto, city, county, country, primary_color, status)
  values (
    btrim(p_name), upper(btrim(p_code)), lower(btrim(p_slug)), p_school_type,
    nullif(btrim(p_motto), ''), nullif(btrim(p_city), ''), nullif(btrim(p_county), ''),
    coalesce(nullif(btrim(p_country), ''), 'Liberia'), nullif(btrim(p_primary_color), ''), 'active'
  )
  returning id into v_school_id;

  return v_school_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges: callable by signed-in users only (authorization is inside).
-- -----------------------------------------------------------------------------
revoke all on function public.create_member(uuid, uuid, text, text, text, public.app_role, text, text, text) from public, anon;
revoke all on function public.set_member_status(uuid, public.profile_status) from public, anon;
revoke all on function public.require_password_change(uuid) from public, anon;
revoke all on function public.platform_create_school(text, text, text, public.school_type, text, text, text, text, text) from public, anon;

grant execute on function public.create_member(uuid, uuid, text, text, text, public.app_role, text, text, text) to authenticated;
grant execute on function public.set_member_status(uuid, public.profile_status) to authenticated;
grant execute on function public.require_password_change(uuid) to authenticated;
grant execute on function public.platform_create_school(text, text, text, public.school_type, text, text, text, text, text) to authenticated;

revoke all on function private.assert_can_manage_school(uuid) from public;
revoke all on function private.resolve_manageable_member(uuid) from public;
