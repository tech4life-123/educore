-- =============================================================================
-- EduCore — Automatic school subdomains (multi-school domains plan, step 7)
--
-- Every school gets an address of the form <slug>.<base domain>, for example
-- st-peters.educore.example. The platform owns the base domain and serves it
-- through one wildcard record on the Vercel project, so a new school needs no
-- per-school DNS or Vercel call: the row below is all it takes, and it is
-- verified from the start (the platform, not the school, controls the name).
--
--   * platform_provision_subdomain(school, base)  one school, idempotent
--   * platform_provision_missing_subdomains(base) every active school without one
-- Super admins only; authorization is checked first inside the function.
-- Schools still cannot insert subdomain rows themselves (unchanged).
-- =============================================================================

create or replace function public.platform_provision_subdomain(p_school_id uuid, p_base text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base   text := lower(btrim(coalesce(p_base, '')));
  v_slug   text;
  v_domain text;
  v_has_primary boolean;
begin
  if private.current_app_role() is distinct from 'super_admin' then
    raise exception 'Only platform administrators can provision school addresses' using errcode = '42501';
  end if;
  if v_base !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' or char_length(v_base) > 180 then
    raise exception 'The base domain is not a valid hostname' using errcode = '22023';
  end if;

  select slug into v_slug from public.schools where id = p_school_id;
  if not found then
    raise exception 'School not found' using errcode = '22023';
  end if;
  if v_slug in ('www', 'app', 'api', 'admin', 'platform', 'mail', 'smtp', 'ftp', 'cdn', 'static', 'status', 'support', 'help', 'login', 'auth', 'dashboard') then
    raise exception 'The school code "%" is reserved and cannot be used as an address', v_slug using errcode = '22023';
  end if;

  -- One system subdomain per school: asking again just returns it.
  select domain into v_domain from public.school_domains
   where school_id = p_school_id and domain_type = 'subdomain' limit 1;
  if found then return v_domain; end if;

  v_domain := v_slug || '.' || v_base;
  select exists (select 1 from public.school_domains where school_id = p_school_id and is_primary) into v_has_primary;

  insert into public.school_domains (school_id, domain, domain_type, is_primary, verification_status, ssl_status)
  values (p_school_id, v_domain, 'subdomain', not v_has_primary, 'verified', 'issued');
  return v_domain;
end;
$$;

create or replace function public.platform_provision_missing_subdomains(p_base text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school record;
  v_count  integer := 0;
begin
  if private.current_app_role() is distinct from 'super_admin' then
    raise exception 'Only platform administrators can provision school addresses' using errcode = '42501';
  end if;
  for v_school in
    select s.id from public.schools s
     where s.status = 'active'
       and not exists (select 1 from public.school_domains d where d.school_id = s.id and d.domain_type = 'subdomain')
  loop
    begin
      perform public.platform_provision_subdomain(v_school.id, p_base);
      v_count := v_count + 1;
    exception when sqlstate '22023' or sqlstate '23505' then
      -- reserved name or a clash: leave that school for a person to look at
      null;
    end;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.platform_provision_subdomain(uuid, text) from public, anon;
revoke all on function public.platform_provision_missing_subdomains(text) from public, anon;
grant execute on function public.platform_provision_subdomain(uuid, text) to authenticated;
grant execute on function public.platform_provision_missing_subdomains(text) to authenticated;
