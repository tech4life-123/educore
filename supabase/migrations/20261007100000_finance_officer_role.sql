-- =============================================================================
-- EduCore — Finance, step 1 of 2: the finance_officer role
--
-- A new value on public.app_role. This is its own migration on purpose:
-- PostgreSQL does not let a new enum value be USED in the transaction that
-- adds it, and the next migration (finance foundation) uses it. When pasting
-- into the Supabase SQL Editor, run this file first, then the next one.
--
-- A finance officer is a school-scoped staff member. Out of the box existing
-- RLS gives them nothing beyond their own profile and school; everything
-- finance-related is granted explicitly by the finance foundation migration.
-- =============================================================================

alter type public.app_role add value if not exists 'finance_officer';
