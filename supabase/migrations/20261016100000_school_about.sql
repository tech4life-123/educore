-- =============================================================================
-- EduCore — "About us" text for a school's public page
--
-- A short free-text paragraph (up to 2,000 characters) that the school admin
-- writes in Settings and that appears on the school's public page. School
-- admins may edit it like the other profile columns; the public page function
-- returns it (and nothing new besides) for a verified domain of an active school.
-- =============================================================================

alter table public.schools
  add column about text check (about is null or char_length(about) <= 2000);

grant update (about) on public.schools to authenticated;

-- The return type changes, so the function is replaced rather than altered.
drop function public.public_school_site(text);

create function public.public_school_site(p_domain text)
returns table (
  name            text,
  school_type     public.school_type,
  motto           text,
  about           text,
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
  select s.name, s.school_type, s.motto, s.about, s.logo_url, s.cover_image_url, s.address, s.city,
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
