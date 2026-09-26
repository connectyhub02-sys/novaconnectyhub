-- Leaving the list stops every automatic contact. When the lead talks to the company again, the lead is
-- back on the list: the pause caused by the opt-out is lifted, a pause set by the owner is kept.

-- The opt-out pause is marked with its reason. A pause the owner set before is kept without one.
do $$
declare definition text; first_needle text; second_needle text;
begin
  select replace(pg_get_functiondef('public.cancel_opted_out_lead_contacts()'::regprocedure),chr(13),'') into definition;
  if position('paused_reason' in definition)>0 then return; end if;
  first_needle:=$n$values(new.organization_id,new.id,'{"paused":true}')$n$;
  second_needle:=$n$set preferences=automation_lead_profiles.preferences || '{"paused":true}'$n$;
  if position(first_needle in definition)=0 or position(second_needle in definition)=0 then raise exception 'OPT_OUT_TRIGGER_UNEXPECTED'; end if;
  definition:=replace(definition,first_needle,$n$values(new.organization_id,new.id,'{"paused":true,"paused_reason":"opt_out"}')$n$);
  definition:=replace(definition,second_needle,$n$set preferences=automation_lead_profiles.preferences || case when automation_lead_profiles.preferences->>'paused'='true' then '{"paused":true}'::jsonb else '{"paused":true,"paused_reason":"opt_out"}'::jsonb end$n$);
  execute definition;
end $$;

-- Existing opt-outs: their pause came from the opt-out, unless the owner changed the preferences since.
update public.automation_lead_profiles p set preferences=p.preferences || '{"paused_reason":"opt_out"}'
from public.leads l
where l.id=p.lead_id and l.organization_id=p.organization_id and p.preferences->>'paused'='true' and p.preferences->>'paused_reason' is null
  and (l.metadata->>'whatsapp_opt_out'='true' or coalesce(l.metadata#>>'{opt_out,requested_at}','')<>'')
  and p.preferences->>'windowStart' is null;

create or replace function public.reinstate_lead_contact(p_org uuid,p_lead uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare l public.leads;
begin
 select * into l from public.leads where id=p_lead and organization_id=p_org for update;
 if not found or (coalesce(l.metadata->>'whatsapp_opt_out','false')<>'true' and coalesce(l.metadata#>>'{opt_out,requested_at}','')='') then return false; end if;
 update public.leads set metadata=(coalesce(metadata,'{}') - 'whatsapp_opt_out' - 'opt_out') || jsonb_build_object('opt_out_history',
   coalesce(metadata->'opt_out_history','[]'::jsonb) || jsonb_build_array(coalesce(metadata->'opt_out','{}'::jsonb) || jsonb_build_object('reinstated_at',now(),'reinstated_by','lead_message')))
 where id=p_lead and organization_id=p_org;
 update public.automation_lead_profiles set preferences=preferences - 'paused' - 'paused_reason',updated_at=now()
 where organization_id=p_org and lead_id=p_lead and preferences->>'paused_reason'='opt_out';
 return true;
end $$;
revoke all on function public.reinstate_lead_contact(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reinstate_lead_contact(uuid,uuid) to service_role;

notify pgrst, 'reload schema';
