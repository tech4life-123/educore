-- ON CONFLICT can't use the (now deferrable) grade-order constraint as an
-- arbiter, so the seeder skips existing rows explicitly instead.
create or replace function private.seed_grade_levels(p_school_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.grade_levels (school_id, name, sequence, stage)
  select p_school_id, v.name, v.seq, v.stage::public.school_stage
  from (values
    ('Nursery', 1, 'early_childhood'), ('K-I', 2, 'early_childhood'), ('K-II', 3, 'early_childhood'),
    ('Grade 1', 4, 'primary'), ('Grade 2', 5, 'primary'), ('Grade 3', 6, 'primary'),
    ('Grade 4', 7, 'primary'), ('Grade 5', 8, 'primary'), ('Grade 6', 9, 'primary'),
    ('Grade 7', 10, 'junior_high'), ('Grade 8', 11, 'junior_high'), ('Grade 9', 12, 'junior_high'),
    ('Grade 10', 13, 'senior_high'), ('Grade 11', 14, 'senior_high'), ('Grade 12', 15, 'senior_high')
  ) as v(name, seq, stage)
  where not exists (
    select 1 from public.grade_levels g
    where g.school_id = p_school_id and (g.sequence = v.seq or lower(g.name) = lower(v.name))
  );
end; $$;
revoke all on function private.seed_grade_levels(uuid) from public;
