-- =============================================================================
-- EduCore — Migration 003: Audit logging for foundation tables
--
-- Every INSERT / UPDATE / DELETE on schools, school_settings and profiles
-- writes an immutable row to audit_logs recording who (auth.uid()), what
-- (action + entity), when (created_at), which record (entity_id) and the
-- before/after values (old_data / new_data).
-- =============================================================================

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old       jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new       jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row       jsonb := coalesce(v_new, v_old);
  v_school_id uuid;
begin
  -- Skip no-op updates (e.g. only updated_at changed).
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return null;
  end if;

  v_school_id := case
    when tg_table_name = 'schools' then (v_row ->> 'id')::uuid
    else (v_row ->> 'school_id')::uuid
  end;

  insert into public.audit_logs (school_id, user_id, action, entity_type, entity_id, old_data, new_data)
  values (
    v_school_id,
    (select auth.uid()),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    v_old,
    v_new
  );

  return null;
end;
$$;

revoke all on function private.audit_row_change() from public;

create trigger schools_audit
  after insert or update or delete on public.schools
  for each row execute function private.audit_row_change();

create trigger school_settings_audit
  after insert or update or delete on public.school_settings
  for each row execute function private.audit_row_change();

create trigger profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function private.audit_row_change();
