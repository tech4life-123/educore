-- Grade order is unique per school; make that check deferrable so two rows can
-- swap positions inside one transaction.
alter table public.grade_levels drop constraint grade_levels_school_seq_key;
alter table public.grade_levels add constraint grade_levels_school_seq_key
  unique (school_id, sequence) deferrable initially immediate;

-- Reorder grade levels atomically. SECURITY INVOKER: RLS and the admin-only
-- write policies still decide; the function only makes the swap atomic
-- (swapping two unique positions).
create or replace function public.move_grade_level(p_grade_id uuid, p_direction text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_school uuid := private.current_school_id();
  v_seq smallint;
  v_other uuid;
  v_other_seq smallint;
begin
  if v_school is null or not private.is_school_admin() then
    raise exception 'Only school administrators can reorder grade levels' using errcode = '42501';
  end if;
  if p_direction not in ('up', 'down') then
    raise exception 'Direction must be up or down' using errcode = '22023';
  end if;

  select sequence into v_seq from public.grade_levels where id = p_grade_id and school_id = v_school for update;
  if v_seq is null then
    raise exception 'Grade level not found' using errcode = '22023';
  end if;

  if p_direction = 'up' then
    select id, sequence into v_other, v_other_seq from public.grade_levels
    where school_id = v_school and sequence < v_seq order by sequence desc limit 1 for update;
  else
    select id, sequence into v_other, v_other_seq from public.grade_levels
    where school_id = v_school and sequence > v_seq order by sequence asc limit 1 for update;
  end if;
  if v_other is null then
    return; -- already first / last
  end if;

  set constraints public.grade_levels_school_seq_key deferred;
  update public.grade_levels set sequence = v_seq where id = v_other;
  update public.grade_levels set sequence = v_other_seq where id = p_grade_id;
end;
$$;

revoke all on function public.move_grade_level(uuid, text) from public, anon;
grant execute on function public.move_grade_level(uuid, text) to authenticated;
