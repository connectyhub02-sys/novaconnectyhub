-- Lead consent is scoped to the customer company, independently of account billing notices.
create table public.lead_contact_links (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 lead_id uuid not null references public.leads(id) on delete cascade,
 public_key uuid not null default gen_random_uuid() unique,
 primary key(organization_id,lead_id)
);
alter table public.lead_contact_links enable row level security;
revoke all on public.lead_contact_links from public,anon,authenticated;
grant all on public.lead_contact_links to service_role;

create function public.ensure_lead_contact_link(p_org uuid,p_lead uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare l public.leads; k uuid; paused boolean;
begin
 select * into l from public.leads where id=p_lead and organization_id=p_org for update;
 if not found then raise exception 'LEAD_SCOPE'; end if;
 insert into public.lead_contact_links(organization_id,lead_id) values(p_org,p_lead) on conflict do nothing;
 select public_key into k from public.lead_contact_links where organization_id=p_org and lead_id=p_lead;
 select coalesce(preferences->>'paused','false')='true' into paused from public.automation_lead_profiles where organization_id=p_org and lead_id=p_lead;
 return jsonb_build_object('public_key',k,'enabled',l.status<>'archived' and coalesce(l.metadata->>'whatsapp_opt_out','false')<>'true' and coalesce(l.metadata#>>'{opt_out,requested_at}','')='' and not coalesce(paused,false));
end $$;

create function public.get_lead_contact_link(p_key uuid) returns jsonb
language sql security definer set search_path=public as $$
 select jsonb_build_object('public_key',k.public_key,'enabled',coalesce(l.metadata->>'whatsapp_opt_out','false')<>'true' and coalesce(l.metadata#>>'{opt_out,requested_at}','')='')
 from public.lead_contact_links k join public.leads l on l.id=k.lead_id and l.organization_id=k.organization_id where k.public_key=p_key
$$;

-- Persist the decision before acknowledging it, and preserve unrelated lead metadata.
create function public.opt_out_lead_contact(p_org uuid,p_lead uuid,p_source text) returns boolean
language plpgsql security definer set search_path=public as $$
declare l public.leads;
begin
 if p_source is null or p_source not in ('public_link','whatsapp_agent') then raise exception 'INVALID_SOURCE'; end if;
 select * into l from public.leads where id=p_lead and organization_id=p_org for update;
 if not found then return false; end if;
 update public.leads set metadata=coalesce(metadata,'{}') || jsonb_build_object('whatsapp_opt_out',true,'opt_out',
   (case when jsonb_typeof(metadata->'opt_out')='object' then metadata->'opt_out' else '{}'::jsonb end) || jsonb_build_object('requested_at',coalesce(nullif(metadata#>>'{opt_out,requested_at}',''),now()::text),'source',coalesce(nullif(metadata#>>'{opt_out,source}',''),p_source)))
 where id=p_lead and organization_id=p_org;
 return true;
end $$;

-- Also covers existing verbal opt-outs and integrations that set the legacy flag.
create function public.cancel_opted_out_lead_contacts() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if coalesce(new.metadata->>'whatsapp_opt_out','false')<>'true' and coalesce(new.metadata#>>'{opt_out,requested_at}','')='' then return new; end if;
 insert into public.automation_lead_profiles(organization_id,lead_id,preferences)
 values(new.organization_id,new.id,'{"paused":true}') on conflict(organization_id,lead_id) do update
 set preferences=automation_lead_profiles.preferences || '{"paused":true}',updated_at=now();
 update public.automation_dispatches set status='skipped',reason='lead_opted_out',lease_until=null,updated_at=now()
 where organization_id=new.organization_id and lead_id=new.id and status in ('pending','processing','failed');
 update public.customer_agenda_notices n set status='skipped',reason='lead_opted_out',lease_until=null,updated_at=now()
 from public.customer_agenda_bookings b where n.booking_id=b.id and b.organization_id=new.organization_id and b.lead_id=new.id
 and n.organization_id=new.organization_id and n.audience='lead' and n.status in ('pending','processing','failed');
 update public.custom_software_meeting_notices n set state='cancelled',error_code='lead_opted_out',updated_at=now()
 from public.custom_software_requests r where n.request_id=r.id and r.organization_id=new.organization_id and r.lead_id=new.id and n.state in ('pending','claimed');
 update public.customer_lead_visits set return_status='cancelled' where organization_id=new.organization_id and lead_id=new.id and return_status in ('pending','scheduled');
 return new;
end $$;
create trigger lead_contact_opt_out after insert or update of metadata on public.leads for each row execute function public.cancel_opted_out_lead_contacts();

-- Existing decisions remain effective after deploying the unified preference.
update public.leads set metadata=metadata where metadata->>'whatsapp_opt_out'='true' or coalesce(metadata#>>'{opt_out,requested_at}','')<>'';

revoke all on function public.ensure_lead_contact_link(uuid,uuid),public.get_lead_contact_link(uuid),public.opt_out_lead_contact(uuid,uuid,text),public.cancel_opted_out_lead_contacts() from public,anon,authenticated;
grant execute on function public.ensure_lead_contact_link(uuid,uuid),public.get_lead_contact_link(uuid),public.opt_out_lead_contact(uuid,uuid,text) to service_role;
