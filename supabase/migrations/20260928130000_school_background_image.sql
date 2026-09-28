-- -----------------------------------------------------------------------------
-- School background image
--   A school admin may upload one image (stored in schools.cover_image_url,
--   an existing unused column) that is shown, blurred, behind every portal
--   for everyone in that school. School admins additionally get a personal
--   on/off toggle for their own view (profiles.show_school_background) —
--   students, parents and teachers always see it when the school has one.
--
--   cover_image_url already has the RLS/grant a school admin needs to write
--   it (see 20260926230102_tenant_isolation_rls.sql: the "schools" update
--   grant already lists cover_image_url, and "School admins can update their
--   own school" already covers the row). Only two things are new here: the
--   storage bucket the image itself lives in, and the personal toggle.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-backgrounds', 'school-backgrounds', true, 3145728, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "School admins upload their school background" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'school-backgrounds'
    and (storage.foldername(name))[1] = (select private.current_school_id())::text
    and (select private.is_school_admin())
  );

create policy "School admins read their background folder" on storage.objects for select to authenticated
  using (
    bucket_id = 'school-backgrounds'
    and (storage.foldername(name))[1] = (select private.current_school_id())::text
    and (select private.is_school_admin())
  );

create policy "School admins delete their school background" on storage.objects for delete to authenticated
  using (
    bucket_id = 'school-backgrounds'
    and (storage.foldername(name))[1] = (select private.current_school_id())::text
    and (select private.is_school_admin())
  );

-- -----------------------------------------------------------------------------
-- Personal opt-out (school admins only, enforced in the app — the column
-- itself is an ordinary personal-profile field, same shape as photo_url).
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column show_school_background boolean not null default true;

grant update (show_school_background) on public.profiles to authenticated;
