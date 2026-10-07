-- =============================================================================
-- EduCore — Public hostname resolution for school_domains
--
-- Phase 2 of the multi-school domains plan: proxy.ts needs to answer "which
-- school, if any, owns this hostname" for a visitor who isn't signed in yet
-- (or isn't signed in at all). That lookup has to work for `anon`.
--
-- What this exposes, and why it's safe:
--   * Only `domain` and `school_id`, for rows that are VERIFIED and belong to
--     an ACTIVE school. Nothing else on the row (ssl_status, the DNS
--     verification_token, vercel_domain_id) is reachable by anon — those stay
--     exactly as locked down as migration 20261006192900 left them.
--   * This is public information by construction: anyone who can resolve DNS
--     or look at the TLS certificate for a live domain already learns it
--     points at EduCore. The table only confirms what the internet already
--     shows.
--   * This is still ROUTING information, never authorization. Nothing here
--     changes private.current_school_id() or any RLS policy that gates real
--     data — a hostname match only ever decides which marketing page or
--     fallback a visitor sees, in a later phase.
-- =============================================================================

-- `anon` has no SELECT grant on `schools` at all (by design — see
-- 20260926230102_tenant_isolation_rls), so the policy below can't query it
-- directly: that would fail with "permission denied for table schools"
-- rather than just filtering rows, which would break hostname resolution
-- outright. A SECURITY DEFINER helper does the active-school check without
-- needing a table grant — same pattern as private.current_school_id().
create or replace function private.is_school_active(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.schools s
    where s.id = p_school_id
      and s.status = 'active'
  )
$$;

comment on function private.is_school_active(uuid) is
  'True if the given school exists and is active. Used only for public hostname resolution — never for authorization.';

grant execute on function private.is_school_active(uuid) to anon, authenticated;

grant select (domain, school_id) on public.school_domains to anon;

create policy "Anyone can resolve a verified domain to its active school"
  on public.school_domains for select
  to anon
  using (
    verification_status = 'verified'
    and (select private.is_school_active(school_id))
  );
