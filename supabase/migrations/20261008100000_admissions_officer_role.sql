-- Document services (finance spec Phase 3): a role for the staff member who
-- processes admission documents. Run this FIRST and ALONE — a new enum value
-- cannot be used in the same transaction that adds it.
alter type public.app_role add value if not exists 'admissions_officer';
