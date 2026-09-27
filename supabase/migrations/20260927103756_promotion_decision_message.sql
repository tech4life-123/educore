-- Clearer error text ("The person must be a student").
create or replace function private.check_promotion_decision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_profile_role(new.student_id, array['student']::public.app_role[], 'The person');
  new.decided_by := private.current_profile_id();
  return new;
end;
$$;
