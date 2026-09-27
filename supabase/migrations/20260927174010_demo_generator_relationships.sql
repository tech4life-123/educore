-- guardian_links.relationship only accepts mother / father / guardian / grandparent /
-- sibling / other. The first generator version used other words; this patched the live
-- function. The generator file in this repository already has the fix, so on a fresh
-- database this finds nothing to change and does nothing.
do $do$
declare d text;
begin
  d := pg_get_functiondef('demo.create_school(text,text,text,text,text,text,numeric,numeric,integer[],integer,integer)'::regprocedure);
  if position('then ''Aunt'' when' in d) = 0 then
    return;
  end if;
  d := replace(d, $o$when demo.u(v_seed || ':r') < 0.85 then 'Aunt' when demo.u(v_seed || ':r') < 0.93 then 'Uncle' else 'Guardian' end;$o$,
                  $n$when demo.u(v_seed || ':r') < 0.85 then 'grandparent' when demo.u(v_seed || ':r') < 0.95 then 'guardian' else 'sibling' end;$n$);
  d := replace(d, $o$then 'Mother' when demo.u(v_seed || ':r') < 0.75 then 'Father'$o$, $n$then 'mother' when demo.u(v_seed || ':r') < 0.75 then 'father'$n$);
  d := replace(d, $o$demo.pick(case when v_rel in ('Mother','Aunt') then v_first_f when v_rel = 'Guardian' then v_first_f || v_first_m else v_first_m end, v_seed || ':pf'),$o$,
                  $n$demo.pick(case v_rel when 'mother' then v_first_f when 'father' then v_first_m else v_first_f || v_first_m end, v_seed || ':pf'),$n$);
  d := replace(d, $o$null, case when v_rel in ('Mother','Father') then v_surname else demo.pick(v_last, v_seed || ':pl') end,$o$,
                  $n$null, case when v_rel = 'guardian' then demo.pick(v_last, v_seed || ':pl') else v_surname end,$n$);
  execute d;
end $do$;
revoke all on all functions in schema demo from public, anon, authenticated;
