-- =============================================================================
-- EduCore — attach a profile to an existing Supabase Auth user
--
-- This is the only supported way (for this milestone) to grant someone access.
-- Run it as the database owner (Supabase SQL editor). Browser roles cannot
-- create profiles or assign roles — by design.
--
-- 1. Create the user: Supabase Dashboard → Authentication → Users → Add user
--    (tick "Auto Confirm User" or send an invite).
-- 2. Edit the values below and run.
-- =============================================================================

-- ---- A school user (school_admin | teacher | student | parent) --------------
insert into public.profiles (user_id, school_id, first_name, last_name, role, status)
select u.id, s.id, 'Demo', 'Administrator', 'school_admin', 'active'
from auth.users u
cross join public.schools s
where u.email = 'admin@example.com'     -- <- the user's email
  and s.code  = 'DEMO-01';              -- <- the school's code

-- ---- A platform super admin (belongs to no school) --------------------------
-- insert into public.profiles (user_id, school_id, first_name, last_name, role, status)
-- select u.id, null, 'Platform', 'Operator', 'super_admin', 'active'
-- from auth.users u
-- where u.email = 'operator@example.com';

-- ---- Creating a school on a hosted project (no seed there) -------------------
-- insert into public.schools (name, code, slug, school_type, country, status)
-- values ('Your School Name', 'YOURCODE', 'your-school', 'high_school', 'Liberia', 'active');
