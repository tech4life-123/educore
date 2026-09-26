-- =============================================================================
-- EduCore — DEVELOPMENT SEED DATA (local `supabase db reset` only)
--
-- Everything here is obviously fictional and prefixed "Demo". It is loaded
-- automatically by the Supabase CLI into a LOCAL database and must never be
-- applied to a production project.
--
-- Auth users cannot be created safely from SQL. After seeding, create users in
-- Supabase Studio (Authentication → Add user) and attach profiles with
-- supabase/snippets/attach_profile.sql.
-- =============================================================================

insert into public.schools (name, code, slug, school_type, motto, city, county, country, primary_color, secondary_color, status)
values
  ('Demo School', 'DEMO-01', 'demo-school', 'high_school', 'Development data only', 'Monrovia', 'Montserrado', 'Liberia', '#1D4ED8', '#F59E0B', 'active'),
  ('Demo School Two', 'DEMO-02', 'demo-school-two', 'high_school', 'Second tenant for isolation testing', 'Gbarnga', 'Bong', 'Liberia', '#047857', null, 'active')
on conflict (code) do nothing;
