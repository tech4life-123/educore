-- The platform allows `SET session_replication_role` but not set_config(); switch the
-- demo generator to the statement form. The generator file in this repository already
-- uses the statement form, so on a fresh database this is a no-op.
do $$
declare r record; d text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'demo' loop
    d := pg_get_functiondef(r.oid);
    if position('set_config(''session_replication_role''' in d) > 0 then
      d := replace(d, 'perform set_config(''session_replication_role'', ''replica'', true);', 'execute ''set local session_replication_role = replica'';');
      d := replace(d, 'perform set_config(''session_replication_role'', ''origin'', true);', 'execute ''set local session_replication_role = origin'';');
      execute d;
    end if;
  end loop;
end $$;
revoke all on all functions in schema demo from public, anon, authenticated;
