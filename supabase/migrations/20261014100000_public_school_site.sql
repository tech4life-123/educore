-- =============================================================================
-- EduCore — Public school page (multi-school domains plan, step 6)
--
-- A visitor who arrives on a school's verified domain sees that school's own
-- public page. The page needs the school's public profile before anyone has
-- signed in, so this adds ONE read-only function for `anon`.
--
-- What it exposes, and why that is acceptable:
--   * Only the school's public profile: name, type, motto, logo, cover image,
--     address, phone, email, website, brand colours. Nothing about people,
--     fees, classes or any other record.
--   * Only when the asked-for hostname is a VERIFIED domain of an ACTIVE
--     school. Anything else returns no rows, so the function cannot be used
--     to probe for schools. It takes a hostname, never a school id.
--   * A school only gets a public page after its domain has been verified,
--     which is already a deliberate step by the school and a platform admin.
-- This is display information only; it is never used for authorization.
-- =============================================================================

create or replace function public.public_school_site(p_domain text)
returns table (
  name            text,
  school_type     public.school_type,
  motto           text,
  logo_url        text,
  cover_image_url text,
  address         text,
  city            text,
  county          text,
  country         text,
  phone           text,
  email           text,
  website         text,
  primary_color   text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.name, s.school_type, s.motto, s.logo_url, s.cover_image_url, s.address, s.city,
         s.county, s.country, s.phone, s.email, s.website, s.primary_color
  from public.school_domains d
  join public.schools s on s.id = d.school_id
  where d.domain = lower(btrim(p_domain))
    and d.verification_status = 'verified'
    and s.status = 'active'
  limit 1
$$;

revoke all on function public.public_school_site(text) from public;
grant execute on function public.public_school_site(text) to anon, authenticated;
