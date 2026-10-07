-- =============================================================================
-- EduCore — School domains (subdomains & custom domains)
--
-- Phase 1 of the multi-school website/subdomain/custom-domain expansion.
-- This migration adds ONLY the table, privileges, RLS and audit wiring.
-- Hostname resolution (proxy.ts), the public marketing site, the Super Admin
-- domains dashboard and the Vercel domain API integration are later phases —
-- see ARCHITECTURE.md §22.
--
-- Security model (unchanged from the rest of the schema):
--   * A hostname is routing information ONLY. It is never an authorization
--     input — private.current_school_id() still comes solely from the
--     signed-in user's own profile (see 20260926230102_tenant_isolation_rls).
--   * verification_status and ssl_status are PLATFORM-CONTROLLED. A school
--     admin can request a custom domain and see its status, but only
--     server-side code using the service-role client (after a real DNS/
--     Vercel check) may mark a domain verified or issued. Mirrors how
--     schools.status and schools.code/slug are handled.
--   * Subdomain rows are system-provisioned (server-side, at school
--     creation), not browser-insertable, so a school admin can never claim
--     an arbitrary subdomain by inserting a row directly.
-- =============================================================================

create type public.domain_type as enum ('subdomain', 'custom');
create type public.domain_verification_status as enum ('pending', 'verified', 'failed');
create type public.domain_ssl_status as enum ('pending', 'issued', 'failed');

create table public.school_domains (
  id                   uuid primary key default gen_random_uuid(),
  school_id            uuid not null references public.schools(id) on delete cascade,
  domain               text not null check (
                          char_length(domain) <= 253
                          and domain = lower(domain)
                          and domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
                        ),
  domain_type          public.domain_type not null,
  is_primary           boolean not null default false,
  verification_status  public.domain_verification_status not null default 'pending',
  verification_token   text,
  ssl_status           public.domain_ssl_status not null default 'pending',
  vercel_domain_id      text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint school_domains_domain_key unique (domain)
);

comment on table public.school_domains is
  'Hostnames a school is reachable at: exactly one system-issued subdomain plus zero or more school-requested custom domains. Verification/SSL state is platform-controlled.';
comment on column public.school_domains.domain is
  'Lowercase hostname, no scheme/port/path (e.g. "lincoln-high.educore.com" or "www.lincolnhigh.edu.lr").';
comment on column public.school_domains.verification_token is
  'DNS TXT challenge value for a pending custom domain. Null for subdomains, which need no challenge.';

create index school_domains_school_id_idx on public.school_domains (school_id);

-- Exactly one primary domain per school (the one used in links, emails, canonical URLs).
create unique index school_domains_one_primary_per_school
  on public.school_domains (school_id)
  where is_primary;

create trigger school_domains_set_updated_at
  before update on public.school_domains
  for each row execute function private.set_updated_at();

create trigger school_domains_audit
  after insert or update or delete on public.school_domains
  for each row execute function private.audit_row_change();

-- -----------------------------------------------------------------------------
-- Privileges — start from zero, same pattern as every other tenant table.
-- -----------------------------------------------------------------------------
revoke all on public.school_domains from anon, authenticated;

grant select on public.school_domains to authenticated;

-- A school admin may request/withdraw a CUSTOM domain for their own school
-- and choose which of their (already-settled) domains is primary. They
-- cannot touch domain_type, verification_status, verification_token,
-- ssl_status or vercel_domain_id — those are set by server-side code only.
grant insert (school_id, domain, domain_type) on public.school_domains to authenticated;
grant update (is_primary) on public.school_domains to authenticated;
grant delete on public.school_domains to authenticated;

alter table public.school_domains enable row level security;
alter table public.school_domains force row level security;

create policy "Members can read their own school's domains"
  on public.school_domains for select
  to authenticated
  using (school_id = (select private.current_school_id()));

create policy "School admins can request a custom domain"
  on public.school_domains for insert
  to authenticated
  with check (
    school_id = (select private.current_school_id())
    and (select private.is_school_admin())
    and domain_type = 'custom'
  );

create policy "School admins can choose their primary domain"
  on public.school_domains for update
  to authenticated
  using (
    school_id = (select private.current_school_id())
    and (select private.is_school_admin())
  )
  with check (
    school_id = (select private.current_school_id())
    and (select private.is_school_admin())
  );

create policy "School admins can remove their own custom domains"
  on public.school_domains for delete
  to authenticated
  using (
    school_id = (select private.current_school_id())
    and (select private.is_school_admin())
    and domain_type = 'custom'
  );

-- Belt and braces: even if a future migration grants broader column
-- privileges, a browser-role session can never change these fields.
-- (Same pattern as private.guard_profile_identity_columns().)
create or replace function private.guard_school_domains_identity_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.domain              is distinct from old.domain
       or new.domain_type         is distinct from old.domain_type
       or new.verification_status is distinct from old.verification_status
       or new.verification_token  is distinct from old.verification_token
       or new.ssl_status          is distinct from old.ssl_status
       or new.vercel_domain_id    is distinct from old.vercel_domain_id
       or new.school_id           is distinct from old.school_id) then
    raise exception 'Not allowed to change domain, type, verification, SSL state or school link'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger school_domains_guard_identity_columns
  before update on public.school_domains
  for each row execute function private.guard_school_domains_identity_columns();
