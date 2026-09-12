-- Company activation gates every booking surface. No customer data is rewritten.

create or replace function public.apply_import_activity_default() returns trigger language plpgsql security definer set search_path=public as $$
declare activity text; candidate text;
begin
 if new.status not in ('draft','ready','error') or new.sales_destination<>'connectyhub_checkout' or coalesce(new.metadata,'{}'::jsonb) ? 'action_version' then return new; end if;
 candidate:=coalesce(new.source_evidence->>'source_agent_id',new.source_evidence->>'sourceAgentId');
 select coalesce(metadata->'prompt_builder_config'->>'templateId',metadata->'prompt_builder_config'->>'template_id') into activity
 from public.agent_registry where id::text=candidate and organization_id=new.organization_id;
 if activity is not null and public.catalog_activity_destination(activity)='appointment' and exists(select 1 from public.customer_agenda_settings where organization_id=new.organization_id and enabled) then
   new.sales_destination:='appointment';
   new.status:='draft';
   new.fulfillment:=coalesce(new.fulfillment,'{}'::jsonb) || '{"mode":"service","scheduling_required":true}'::jsonb;
   new.metadata:=coalesce(new.metadata,'{}'::jsonb) || '{"action_origin":"activity_default"}'::jsonb;
   new.warnings:=array_append(coalesce(new.warnings,array[]::text[]),'Agendamento sugerido pela atividade. Revise a ação e a agenda deste item antes de publicar.');
 end if;
 return new;
end $$;

create or replace function public.apply_catalog_activity_profile() returns trigger language plpgsql security definer set search_path=public as $$
declare agent public.agent_registry; candidate text; config jsonb; resource text; agent_count integer;
begin
 if new.scope <> 'organization' or new.memory_type <> 'sales_catalog_item' then return new; end if;
 new.metadata := coalesce(new.metadata,'{}'::jsonb);
 candidate := coalesce(new.metadata->>'source_agent_id',new.metadata->>'agent_id');
 if candidate is null and jsonb_typeof(new.metadata->'assigned_agent_ids')='array' then
   if jsonb_array_length(new.metadata->'assigned_agent_ids')=1 then candidate:=new.metadata->'assigned_agent_ids'->>0; end if;
 end if;
 if candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   select * into agent from public.agent_registry where id=candidate::uuid and organization_id=new.organization_id;
 elsif candidate is null then
   select count(*) into agent_count from public.agent_registry where organization_id=new.organization_id and metadata ? 'prompt_builder_config' and coalesce(metadata->>'controls_all_whatsapp_agents','false')<>'true';
   if agent_count=1 then select * into agent from public.agent_registry where organization_id=new.organization_id and metadata ? 'prompt_builder_config' and coalesce(metadata->>'controls_all_whatsapp_agents','false')<>'true' limit 1; end if;
 end if;
 -- Never trust an activity supplied by a public URL or another tenant's agent.
 new.metadata := new.metadata - 'activity_profile' - 'profile_agent_id';
 if agent.id is not null then
   config := coalesce(agent.metadata->'prompt_builder_config','{}'::jsonb);
   new.metadata := new.metadata || jsonb_build_object('activity_profile',jsonb_build_object('templateId',coalesce(config->>'templateId',config->>'template_id','generic_sales'),'professionalIdentity',config->'professionalIdentity'),'profile_agent_id',agent.id);
   if exists(select 1 from public.customer_agenda_settings where organization_id=new.organization_id and enabled) and not (new.metadata ? 'action_version') and (coalesce(new.metadata->>'sales_destination','connectyhub_checkout')='connectyhub_checkout' or new.metadata->>'action_origin'='activity_default') then
     new.metadata := new.metadata || jsonb_build_object('sales_destination',public.catalog_activity_destination(coalesce(config->>'templateId',config->>'template_id')),'action_origin','activity_default');
   end if;
 end if;
 resource:=new.metadata->'fulfillment'->>'agenda_resource_id';
 if nullif(resource,'') is not null and not exists(select 1 from public.customer_agenda_resources where id::text=resource and organization_id=new.organization_id and kind='service') then raise exception 'AGENDA_RESOURCE_SCOPE'; end if;
 return new;
end $$;

-- Run after the activity-profile triggers. Preserve existing links while paused,
-- but reject a new destination/resource even when a write bypasses the app API.
create or replace function public.guard_catalog_agenda_activation() returns trigger language plpgsql security definer set search_path=public as $$
declare destination text; resource text; previous_destination text; previous_resource text; active boolean;
begin
 if tg_table_name='intelligence_memory' then
   if new.scope<>'organization' or new.memory_type<>'sales_catalog_item' then return new; end if;
   destination:=coalesce(new.metadata->>'sales_destination','connectyhub_checkout');
   resource:=nullif(coalesce(new.metadata->'fulfillment'->>'agenda_resource_id',new.metadata->'fulfillment'->>'agendaResourceId'),'');
   if tg_op='UPDATE' and old.organization_id=new.organization_id and old.scope='organization' and old.memory_type='sales_catalog_item' then
     previous_destination:=coalesce(old.metadata->>'sales_destination','connectyhub_checkout');
     previous_resource:=nullif(coalesce(old.metadata->'fulfillment'->>'agenda_resource_id',old.metadata->'fulfillment'->>'agendaResourceId'),'');
   end if;
 else
   destination:=new.sales_destination;
   resource:=nullif(coalesce(new.fulfillment->>'agenda_resource_id',new.fulfillment->>'agendaResourceId'),'');
   if tg_op='UPDATE' and old.organization_id=new.organization_id then
     previous_destination:=old.sales_destination;
     previous_resource:=nullif(coalesce(old.fulfillment->>'agenda_resource_id',old.fulfillment->>'agendaResourceId'),'');
   end if;
 end if;
 if resource is not distinct from previous_resource and (destination is not distinct from previous_destination or destination<>'appointment') then return new; end if;
 if destination<>'appointment' and resource is null then return new; end if;
 select enabled into active from public.customer_agenda_settings where organization_id=new.organization_id for share;
 if not coalesce(active,false) then raise exception 'AGENDA_NOT_ENABLED'; end if;
 if resource is not null and not exists(select 1 from public.customer_agenda_resources where id::text=resource and organization_id=new.organization_id and kind='service' and enabled) then raise exception 'AGENDA_RESOURCE_UNAVAILABLE'; end if;
 return new;
end $$;
create trigger zz_catalog_agenda_activation before insert or update on public.intelligence_memory for each row execute function public.guard_catalog_agenda_activation();
create trigger zz_import_agenda_activation before insert or update on public.sales_catalog_import_items for each row execute function public.guard_catalog_agenda_activation();
revoke all on function public.guard_catalog_agenda_activation() from public,anon,authenticated;

-- Serialize reservation with a concurrent company deactivation.
create or replace function public.reserve_customer_appointment(p_org uuid,p_resource uuid,p_lead uuid,p_start timestamptz,p_party integer,p_key text,p_conversation uuid default null,p_agent uuid default null,p_replace uuid default null,p_version integer default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare resource public.customer_agenda_resources; settings public.customer_agenda_settings; booking public.customer_agenda_bookings; previous public.customer_agenda_bookings;
 finish timestamptz; local_start timestamp; local_end timestamp; occupied integer; slot jsonb;
begin
 select * into resource from public.customer_agenda_resources where id=p_resource and organization_id=p_org for update;
 select * into settings from public.customer_agenda_settings where organization_id=p_org for share;
 if resource.id is null or not resource.enabled or settings.organization_id is null or not settings.enabled then raise exception 'AGENDA_UNAVAILABLE'; end if;
 if not exists(select 1 from public.leads where id=p_lead and organization_id=p_org) then raise exception 'LEAD_SCOPE'; end if;
 if p_conversation is not null and not exists(select 1 from public.conversations where id=p_conversation and organization_id=p_org and lead_id=p_lead) then raise exception 'CONVERSATION_SCOPE';end if;
 if p_agent is not null and not exists(select 1 from public.agent_registry where id=p_agent and organization_id=p_org) then raise exception 'AGENT_SCOPE';end if;
 if p_key is null or length(p_key) not between 1 and 180 then raise exception 'INVALID_REQUEST_KEY';end if;
 select * into booking from public.customer_agenda_bookings where organization_id=p_org and request_key=p_key;
 if booking.id is not null then
   if booking.lead_id<>p_lead or booking.resource_id<>p_resource or booking.starts_at<>p_start or booking.party_size<>p_party then raise exception 'REQUEST_KEY_CONFLICT';end if;
   return to_jsonb(booking);
 end if;
 if p_start is null or p_start<=now() or p_start>now()+interval '1 year' or p_party is null or p_party<1 or p_party>resource.capacity or (resource.kind='service' and p_party<>1) then raise exception 'INVALID_APPOINTMENT';end if;
 finish:=p_start+make_interval(mins=>resource.duration_minutes);
 local_start:=p_start at time zone settings.timezone; local_end:=finish at time zone settings.timezone;
 if local_start::date=any(resource.blocked_dates) or local_end::date<>local_start::date then raise exception 'OUTSIDE_HOURS';end if;
 if not exists(select 1 from jsonb_array_elements(resource.weekly_hours) h where (h->'days') @> to_jsonb(array[extract(isodow from local_start)::integer]) and local_start::time >= (h->>'start')::time and local_end::time <= (h->>'end')::time) then raise exception 'OUTSIDE_HOURS';end if;
 if p_replace is not null then
   select * into previous from public.customer_agenda_bookings where id=p_replace and organization_id=p_org and lead_id=p_lead for update;
   if previous.id is null or p_version is null or previous.status<>'booked' or previous.version<>p_version or previous.resource_id<>p_resource then raise exception 'STALE_BOOKING';end if;
 end if;
 select coalesce(max((select count(*) from public.customer_agenda_bookings b where b.organization_id=p_org and b.resource_id=p_resource and b.status='booked' and b.starts_at<=points.at and b.ends_at>points.at and (p_replace is null or b.id<>p_replace))),0) into occupied
 from (select p_start as at union select starts_at from public.customer_agenda_bookings where organization_id=p_org and resource_id=p_resource and status='booked' and starts_at>=p_start and starts_at<finish and (p_replace is null or id<>p_replace)) points;
 if occupied >= (case when resource.kind='table' then 1 else resource.capacity end) then raise exception 'SLOT_UNAVAILABLE';end if;
 if p_replace is null then
   insert into public.customer_agenda_bookings(organization_id,resource_id,lead_id,conversation_id,agent_id,starts_at,ends_at,party_size,request_key) values(p_org,p_resource,p_lead,p_conversation,p_agent,p_start,finish,p_party,p_key) returning * into booking;
 else
   update public.customer_agenda_bookings set starts_at=p_start,ends_at=finish,party_size=p_party,confirmed_at=null,version=version+1,updated_at=now(),request_key=p_key where id=p_replace returning * into booking;
 end if;
 insert into public.customer_agenda_events(organization_id,booking_id,version,event_type,actor) values(p_org,booking.id,booking.version,case when p_replace is null then 'booked' else 'rescheduled' end,'booking_service');
 return to_jsonb(booking);
end $$;
