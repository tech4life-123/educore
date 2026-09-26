-- =============================================================================
-- EduCore — Migration 001: Foundation schema
--
-- Creates the tenant (school) model, per-school settings, user profiles linked
-- to Supabase Auth, and the append-only audit log.
--
-- Deletion policy (deliberate architectural decision):
--   Schools, profiles and audit logs are NEVER hard-deleted in normal
--   operation. Every foreign key uses ON DELETE RESTRICT so that deleting a
--   school cannot silently destroy historical academic data. Schools are
--   retired by setting status = 'archived'; users by setting a profile status.
-- =============================================================================

-- Private schema for helper functions. It is NOT exposed through the Supabase
-- Data API (PostgREST only exposes `public` and `graphql_public` by default).
create schema if not exists private;
revoke all on schema private from public;

-- -----------------------------------------------------------------------------
-- Enumerated types
-- -----------------------------------------------------------------------------
create type public.app_role as enum (
  'super_admin',
  'school_admin',
  'teacher',
  'student',
  'parent'
);

create type public.school_status as enum ('pending', 'active', 'suspended', 'archived');

create type public.school_type as enum (
  'high_school',
  'junior_high',
  'elementary',
  'university',
  'college',
  'vocational',
  'other'
);

create type public.profile_status as enum ('invited', 'active', 'suspended', 'inactive');

create type public.academic_system as enum ('semester', 'trimester', 'quarter', 'term');

-- -----------------------------------------------------------------------------
-- Generic trigger helpers
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- schools — the tenant table
-- -----------------------------------------------------------------------------
create table public.schools (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(btrim(name)) between 2 and 200),
  code             text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$'),
  slug             text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 63),
  school_type      public.school_type not null default 'high_school',
  motto            text check (char_length(motto) <= 300),
  logo_url         text check (logo_url is null or logo_url ~ '^https://'),
  cover_image_url  text check (cover_image_url is null or cover_image_url ~ '^https://'),
  address          text check (char_length(address) <= 500),
  city             text check (char_length(city) <= 100),
  county           text check (char_length(county) <= 100),
  country          text not null default 'Liberia' check (char_length(country) between 2 and 100),
  phone            text check (char_length(phone) <= 30),
  email            text check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  website          text check (website is null or website ~ '^https?://'),
  primary_color    text check (primary_color is null or primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color  text check (secondary_color is null or secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  timezone         text not null default 'Africa/Monrovia',
  currency         text not null default 'LRD' check (currency ~ '^[A-Z]{3}$'),
  status           public.school_status not null default 'pending',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint schools_code_key unique (code),
  constraint schools_slug_key unique (slug)
);

comment on table public.schools is 'Tenants. Every school-owned table references schools.id via school_id.';

create index schools_status_idx on public.schools (status);

-- Reject unknown IANA time zones (a CHECK constraint cannot consult the catalog).
create or replace function private.validate_school_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid time zone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger schools_validate_timezone
  before insert or update of timezone on public.schools
  for each row execute function private.validate_school_timezone();

create trigger schools_set_updated_at
  before update on public.schools
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- school_settings — exactly one row per school
-- -----------------------------------------------------------------------------
create table public.school_settings (
  id                          uuid primary key default gen_random_uuid(),
  school_id                   uuid not null references public.schools (id) on delete restrict,
  academic_system             public.academic_system not null default 'semester',
  passing_score               numeric(5, 2) not null default 70 check (passing_score between 0 and 100),
  attendance_threshold        numeric(5, 2) not null default 75 check (attendance_threshold between 0 and 100),
  allow_parent_accounts       boolean not null default true,
  allow_student_registration  boolean not null default false,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint school_settings_school_id_key unique (school_id)
);

create trigger school_settings_set_updated_at
  before update on public.school_settings
  for each row execute function private.set_updated_at();

-- Every new school automatically gets a settings row with platform defaults.
create or replace function private.create_default_school_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.school_settings (school_id) values (new.id)
  on conflict (school_id) do nothing;
  return new;
end;
$$;

create trigger schools_create_default_settings
  after insert on public.schools
  for each row execute function private.create_default_school_settings();

-- -----------------------------------------------------------------------------
-- profiles — application identity, one per Supabase Auth user
--
-- Credentials live ONLY in auth.users (managed by Supabase Auth).
-- A super_admin is a platform operator and belongs to no school; every other
-- role must belong to exactly one school (enforced by profiles_role_scope).
-- -----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete restrict,
  school_id    uuid references public.schools (id) on delete restrict,
  first_name   text not null check (char_length(btrim(first_name)) between 1 and 100),
  middle_name  text check (char_length(middle_name) <= 100),
  last_name    text not null check (char_length(btrim(last_name)) between 1 and 100),
  phone        text check (char_length(phone) <= 30),
  photo_url    text check (photo_url is null or photo_url ~ '^https://'),
  role         public.app_role not null,
  status       public.profile_status not null default 'invited',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profiles_user_id_key unique (user_id),
  constraint profiles_role_scope check ((role = 'super_admin') = (school_id is null))
);

comment on constraint profiles_role_scope on public.profiles is
  'super_admin profiles have no school; every other role belongs to exactly one school.';

create index profiles_school_id_role_idx on public.profiles (school_id, role);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- audit_logs — append-only change history
-- school_id is nullable for platform-level events (e.g. actions on super_admin
-- profiles). user_id is intentionally NOT a foreign key so history survives
-- even if an auth user is later removed.
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid references public.schools (id) on delete restrict,
  user_id      uuid,
  action       text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type  text not null check (char_length(entity_type) between 1 and 100),
  entity_id    uuid,
  old_data     jsonb,
  new_data     jsonb,
  created_at   timestamptz not null default now()
);

create index audit_logs_school_created_idx on public.audit_logs (school_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

create or replace function private.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only' using errcode = '42501';
end;
$$;

create trigger audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function private.prevent_audit_log_mutation();
