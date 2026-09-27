-- =============================================================================
-- EduCore — Reports & analytics aggregates (milestone 10)
--
-- Attendance for a whole school year is too many rows to ship to the app, so
-- these functions count in the database. They are SECURITY INVOKER: they run
-- with the caller's own rights, so Row Level Security decides which marks are
-- counted (a school admin: their whole school; anyone else: only what they
-- could already see). They add no access of their own.
-- =============================================================================

create or replace function public.report_attendance_by_month(p_year_id uuid)
returns table (class_id uuid, month date, present integer, late integer, absent integer, excused integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.class_id,
         date_trunc('month', r.date)::date as month,
         count(*) filter (where r.status = 'present')::int,
         count(*) filter (where r.status = 'late')::int,
         count(*) filter (where r.status = 'absent')::int,
         count(*) filter (where r.status = 'excused')::int
  from public.attendance_records r
  join public.academic_years y on y.id = p_year_id and y.school_id = r.school_id
  where r.date between y.starts_on and y.ends_on
  group by r.class_id, date_trunc('month', r.date)
$$;

create or replace function public.report_attendance_by_student(p_year_id uuid)
returns table (student_id uuid, present integer, late integer, absent integer, excused integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.student_id,
         count(*) filter (where r.status = 'present')::int,
         count(*) filter (where r.status = 'late')::int,
         count(*) filter (where r.status = 'absent')::int,
         count(*) filter (where r.status = 'excused')::int
  from public.attendance_records r
  join public.academic_years y on y.id = p_year_id and y.school_id = r.school_id
  where r.date between y.starts_on and y.ends_on
  group by r.student_id
$$;

revoke all on function public.report_attendance_by_month(uuid) from public, anon;
revoke all on function public.report_attendance_by_student(uuid) from public, anon;
grant execute on function public.report_attendance_by_month(uuid) to authenticated;
grant execute on function public.report_attendance_by_student(uuid) to authenticated;
