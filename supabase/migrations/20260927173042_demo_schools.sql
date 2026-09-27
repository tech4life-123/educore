-- =============================================================================
-- EduCore — Demonstration schools (milestone 11)
--
-- schools.is_demo marks a school whose people and records are fictional,
-- generated for demonstrations. The app shows a banner inside such a school,
-- marks its report cards "DEMONSTRATION", and labels it on the platform
-- screens. It can only be set in the database (no user has UPDATE on it).
-- =============================================================================

alter table public.schools add column is_demo boolean not null default false;

-- Statistics now say which rows are demonstration schools (return type changes).
drop function public.platform_school_statistics();

create or replace function public.platform_school_statistics()
returns table (
  school_id uuid,
  name text,
  code text,
  county text,
  school_type public.school_type,
  status public.school_status,
  created_at timestamptz,
  is_demo boolean,
  current_year text,
  students integer,
  female integer,
  male integer,
  enrolled integer,
  teachers integer,
  admins integer,
  classes integer,
  att_present integer,
  att_late integer,
  att_absent integer,
  att_excused integer,
  graded_students integer,
  passed integer,
  passing_score numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if private.current_app_role() is distinct from 'super_admin' then
    raise exception 'Only platform administrators can view platform statistics' using errcode = '42501';
  end if;

  return query
  select
    s.id, s.name, s.code, s.county, s.school_type, s.status, s.created_at, s.is_demo,
    y.name,
    coalesce(st.total, 0)::int, coalesce(st.female, 0)::int, coalesce(st.male, 0)::int,
    coalesce(en.n, 0)::int,
    coalesce(sf.teachers, 0)::int, coalesce(sf.admins, 0)::int,
    coalesce(cl.n, 0)::int,
    coalesce(att.present, 0)::int, coalesce(att.late, 0)::int, coalesce(att.absent, 0)::int, coalesce(att.excused, 0)::int,
    coalesce(rc.graded, 0)::int, coalesce(rc.passed, 0)::int,
    coalesce(ss.passing_score, 70)
  from public.schools s
  left join public.school_settings ss on ss.school_id = s.id
  left join lateral (
    select ay.id, ay.name, ay.starts_on, ay.ends_on
    from public.academic_years ay
    where ay.school_id = s.id and ay.is_current
    limit 1
  ) y on true
  left join lateral (
    select count(*) as total,
           count(*) filter (where sp.gender = 'female') as female,
           count(*) filter (where sp.gender = 'male') as male
    from public.profiles p
    left join public.student_profiles sp on sp.profile_id = p.id and sp.school_id = p.school_id
    where p.school_id = s.id and p.role = 'student' and p.status = 'active'
  ) st on true
  left join lateral (
    select count(*) filter (where p.role = 'teacher') as teachers,
           count(*) filter (where p.role = 'school_admin') as admins
    from public.profiles p
    where p.school_id = s.id and p.status = 'active' and p.role in ('teacher', 'school_admin')
  ) sf on true
  left join lateral (
    select count(*) as n from public.enrollments e
    where e.school_id = s.id and e.academic_year_id = y.id and e.status = 'active'
  ) en on true
  left join lateral (
    select count(*) as n from public.classes c
    where c.school_id = s.id and c.academic_year_id = y.id
  ) cl on true
  left join lateral (
    select count(*) filter (where r.status = 'present') as present,
           count(*) filter (where r.status = 'late') as late,
           count(*) filter (where r.status = 'absent') as absent,
           count(*) filter (where r.status = 'excused') as excused
    from public.attendance_records r
    where r.school_id = s.id and r.date between y.starts_on and y.ends_on
  ) att on true
  left join lateral (
    select count(*) as graded,
           count(*) filter (where round(latest.average) >= coalesce(ss.passing_score, 70)) as passed
    from (
      select distinct on (c.student_id) c.student_id, c.average
      from public.report_cards c
      join public.academic_terms t on t.id = c.term_id
      where c.school_id = s.id and c.academic_year_id = y.id
      order by c.student_id, t.sequence desc
    ) latest
    where latest.average is not null
  ) rc on true
  order by s.name;
end;
$$;


revoke all on function public.platform_school_statistics() from public, anon;
grant execute on function public.platform_school_statistics() to authenticated;
