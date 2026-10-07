-- =============================================================================
-- EduCore — Platform tool: platform_set_domain_verification (milestone,
-- multi-school domains plan, step 4)
--
-- Lets a super admin approve or reject a school's custom-domain request from
-- the Super Admin "Domains" dashboard. Mirrors platform_set_school_status
-- exactly: SECURITY DEFINER because a super admin has no RLS write power
-- over school_domains (only the owning school's own admins do, and even
-- they can never touch verification_status — see the guard trigger in
-- 20261006192900_school_domains.sql). Checks private.current_app_role() =
-- 'super_admin' FIRST. Status changes are recorded by the existing
-- audit_row_change trigger already attached to school_domains.
--
-- Scope: this only flips the status column. It does NOT talk to Vercel's
-- API to actually provision or verify DNS/TLS for the domain — that is step
-- 5 of the plan. For now "verified" here just means "a super admin looked
-- at this request and approved it"; actual DNS verification is a manual,
-- out-of-band step until step 5 lands. The dashboard says so.
-- =============================================================================

create or replace function public.platform_set_domain_verification(
  p_domain_id uuid,
  p_status public.domain_verification_status
)
returns public.domain_verification_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.domain_verification_status;
  v_domain_type public.domain_type;
begin
  if private.current_app_role() is distinct from 'super_admin' then
    raise exception 'Only platform administrators can change a domain''s verification status' using errcode = '42501';
  end if;
  if p_status is null then
    raise exception 'Choose a verification status' using errcode = '22023';
  end if;

  select verification_status, domain_type into v_current, v_domain_type
    from public.school_domains where id = p_domain_id for update;
  if not found then
    raise exception 'Domain request not found' using errcode = '22023';
  end if;
  if v_domain_type <> 'custom' then
    -- The built-in *.educore subdomains carry no review queue; this function
    -- only ever moves a school-submitted custom-domain request.
    raise exception 'Only custom domain requests can be reviewed' using errcode = '22023';
  end if;
  if v_current = p_status then
    return v_current;
  end if;

  update public.school_domains set verification_status = p_status where id = p_domain_id;
  return p_status;
end;
$$;

revoke all on function public.platform_set_domain_verification(uuid, public.domain_verification_status) from public, anon;
grant execute on function public.platform_set_domain_verification(uuid, public.domain_verification_status) to authenticated;
