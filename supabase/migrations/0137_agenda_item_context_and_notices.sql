-- Preserve the selected catalog item and the factual location with the booking.
-- Existing bookings/contacts are not changed and old events are not replayed.
alter table public.customer_agenda_bookings add column appointment_context jsonb not null default '{}'::jsonb;
alter table public.customer_agenda_offers add column catalog_item_id uuid references public.intelligence_memory(id) on delete set null;

create function public.reserve_customer_appointment_item(
 p_org uuid,p_resource uuid,p_lead uuid,p_start timestamptz,p_party integer,p_key text,p_item uuid default null,
 p_conversation uuid default null,p_agent uuid default null,p_replace uuid default null,p_version integer default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare item public.intelligence_memory; resource public.customer_agenda_resources; result jsonb; snapshot jsonb; agent_ids jsonb; instance_ids jsonb;
begin
 perform 1 from public.leads where id=p_lead and organization_id=p_org for update;
 if not found then raise exception 'LEAD_SCOPE'; end if;
 if p_item is not null then
   select * into item from public.intelligence_memory where id=p_item and organization_id=p_org
     and scope='organization' and memory_type='sales_catalog_item' for share;
   if item.id is null or coalesce(item.metadata->>'status','draft')<>'active'
     or item.metadata->>'sales_destination' is distinct from 'appointment' then raise exception 'CATALOG_APPOINTMENT_UNAVAILABLE'; end if;
   if coalesce(nullif(item.metadata->'fulfillment'->>'agenda_resource_id',''),
     (select default_resource_id::text from public.customer_agenda_settings where organization_id=p_org)) is distinct from p_resource::text
     then raise exception 'AGENDA_RESOURCE_SCOPE'; end if;
   agent_ids:=coalesce(item.metadata->'assigned_agent_ids',item.metadata->'agent_ids','[]'::jsonb);
   instance_ids:=coalesce(item.metadata->'assigned_whatsapp_instance_ids',item.metadata->'whatsapp_instance_ids','[]'::jsonb);
   if (jsonb_array_length(agent_ids)>0 or jsonb_array_length(instance_ids)>0)
     and not (agent_ids @> jsonb_build_array(p_agent::text))
     and not exists(select 1 from public.whatsapp_instances wi where wi.organization_id=p_org
       and wi.metadata->>'agent_id'=p_agent::text and instance_ids @> jsonb_build_array(wi.id::text))
     then raise exception 'AGENT_SCOPE'; end if;
 end if;
 result:=public.reserve_customer_appointment(p_org,p_resource,p_lead,p_start,p_party,p_key,p_conversation,p_agent,p_replace,p_version);
 if coalesce(result->'appointment_context','{}'::jsonb)<>'{}'::jsonb and p_replace is null then
   if result->'appointment_context'->>'catalog_item_id' is distinct from p_item::text then raise exception 'REQUEST_KEY_CONFLICT'; end if;
   return result;
 end if;
 select * into resource from public.customer_agenda_resources where id=p_resource and organization_id=p_org;
 snapshot:=jsonb_strip_nulls(jsonb_build_object('catalog_item_id',p_item,
   'item_title',case when p_item is not null then coalesce(item.metadata->>'title',item.title) end,
   'service_name',resource.service_name,'resource_name',resource.name,
   'location_address',resource.location_address,'location_url',resource.location_url));
 update public.customer_agenda_bookings set appointment_context=snapshot where id=(result->>'id')::uuid and organization_id=p_org
   returning to_jsonb(customer_agenda_bookings.*) into result;
 return result;
end $$;
revoke all on function public.reserve_customer_appointment_item(uuid,uuid,uuid,timestamptz,integer,text,uuid,uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.reserve_customer_appointment_item(uuid,uuid,uuid,timestamptz,integer,text,uuid,uuid,uuid,uuid,integer) to service_role;

-- Public audiences have independent receipts, including the same phone in both roles.
do $$ declare constraint_name text; begin
 for constraint_name in select conname from pg_constraint where conrelid='public.customer_agenda_notices'::regclass
   and contype='u' and pg_get_constraintdef(oid)='UNIQUE (booking_id, booking_version, kind, recipient_phone)'
 loop execute format('alter table public.customer_agenda_notices drop constraint %I',constraint_name); end loop;
end $$;
alter table public.customer_agenda_notices add constraint agenda_notice_audience_unique unique(booking_id,booking_version,kind,audience,recipient_phone);

-- Read the current booking and recipient state while claiming the final send.
create function public.begin_customer_agenda_notice(p_notice uuid,p_claim uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare n public.customer_agenda_notices; b public.customer_agenda_bookings;
begin
 select * into n from public.customer_agenda_notices where id=p_notice;
 if n.id is null then return false; end if;
 perform 1 from public.leads where id=(select lead_id from public.customer_agenda_bookings where id=n.booking_id)
   and organization_id=n.organization_id and status<>'archived' for update;
 if not found then return false; end if;
 select * into b from public.customer_agenda_bookings where id=n.booking_id and organization_id=n.organization_id for share;
 if b.id is null or b.version<>n.booking_version or (n.kind='reminder' and (b.status<>'booked' or b.starts_at<=now()))
   or (n.kind='outcome' and b.status<>'booked') then
   update public.customer_agenda_notices set status='skipped',reason='booking_changed_before_send' where id=p_notice and claim_token=p_claim and status='processing';
   return false;
 end if;
 update public.customer_agenda_notices set status='sending',lease_until=now()+interval '2 minutes'
   where id=p_notice and claim_token=p_claim and status='processing' and lease_until>now();
 return found;
end $$;
revoke all on function public.begin_customer_agenda_notice(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_customer_agenda_notice(uuid,uuid) to service_role;
