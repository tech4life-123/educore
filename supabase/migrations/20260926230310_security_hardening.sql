-- =============================================================================
-- EduCore — Migration 004: Advisor-driven hardening
--
-- 1. Some Supabase projects ship a `public.rls_auto_enable()` SECURITY DEFINER
--    helper (used by an event trigger). It is not part of EduCore's API, so
--    browser roles must not be able to call it via /rest/v1/rpc.
-- 2. Merge the two permissive SELECT policies on profiles into one policy
--    (same semantics, evaluated once per row — Supabase lint 0006).
-- =============================================================================

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;

-- Stop Supabase's per-schema default grant that makes every new function in
-- `public` executable by browser roles. Future RPCs must be granted explicitly.
alter default privileges in schema public revoke execute on functions from anon, authenticated;

drop policy "Users can read their own profile" on public.profiles;
drop policy "Staff can read profiles in their school" on public.profiles;

create policy "Users read own profile; staff read profiles in their school"
  on public.profiles for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (
      school_id = (select private.current_school_id())
      and (select private.current_app_role()) in ('school_admin', 'teacher')
    )
  );
