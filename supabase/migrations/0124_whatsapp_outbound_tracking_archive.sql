create table public.whatsapp_outbound_deliveries (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 whatsapp_instance_id uuid not null references public.whatsapp_instances(id) on delete cascade,
 lead_id uuid references public.leads(id) on delete cascade,
 conversation_id uuid references public.conversations(id) on delete set null,
 target text not null, path text not null, source text not null,
 status text not null default 'prepared' check(status in ('prepared','sending','queued','sent','failed','uncertain')),
 message_type text not null, text_content text, payload jsonb not null,
 provider_message_id text, provider_status integer,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index whatsapp_outbound_lead_history on public.whatsapp_outbound_deliveries(organization_id,lead_id,created_at desc);
create table public.whatsapp_outbound_links (
 id uuid primary key default gen_random_uuid(),
 delivery_id uuid not null references public.whatsapp_outbound_deliveries(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 lead_id uuid references public.leads(id) on delete cascade,
 target_url text not null check(target_url ~ '^https?://'), label text not null,
 click_count integer not null default 0, last_clicked_at timestamptz,
 created_at timestamptz not null default now(),unique(delivery_id,target_url)
);
alter table public.whatsapp_outbound_deliveries enable row level security;
alter table public.whatsapp_outbound_links enable row level security;
revoke all on public.whatsapp_outbound_deliveries,public.whatsapp_outbound_links from public,anon,authenticated;
grant all on public.whatsapp_outbound_deliveries,public.whatsapp_outbound_links to service_role;

-- All direct recipients acquire a lead record in the sending company's archive.
-- Existing handoffs, appointments and consent are never changed by an outbound send.
create function public.prepare_whatsapp_outbound(p_id uuid,p_instance uuid,p_target text,p_path text,p_source text,p_type text,p_text text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare org uuid; l uuid; c uuid; phone text;
begin
 select organization_id into org from public.whatsapp_instances where id=p_instance;
 if org is null then raise exception 'OUTBOUND_INSTANCE_REQUIRED'; end if;
 if p_target is null or p_target='' then raise exception 'OUTBOUND_TARGET_REQUIRED'; end if;
 if p_target ~ '^[+0-9 ()-]+(@s.whatsapp.net|@c.us)?$' then
   phone:=regexp_replace(split_part(p_target,'@',1),'[^0-9]','','g');
   if length(phone) not between 10 and 15 then raise exception 'OUTBOUND_PHONE_INVALID'; end if;
   perform pg_advisory_xact_lock(hashtextextended(org::text||':'||phone,124));
   select id into l from public.leads where organization_id=org and channel='whatsapp' and phone_number=phone;
   if l is null then
     insert into public.leads(organization_id,channel,phone_number,source,metadata)
       values(org,'whatsapp',phone,'whatsapp_outbound','{"created_from":"outbound_archive"}')
       on conflict (organization_id,channel,phone_number) where phone_number is not null do nothing returning id into l;
     -- An inbound webhook may have created the same lead while preparation was running.
     if l is null then
       select id into l from public.leads where organization_id=org and channel='whatsapp' and phone_number=phone;
     end if;
   end if;
   select id into c from public.conversations where organization_id=org and lead_id=l and whatsapp_instance_id=p_instance order by updated_at desc limit 1;
 else
   select id,lead_id into c,l from public.conversations where organization_id=org and whatsapp_instance_id=p_instance and provider_chat_id=p_target order by updated_at desc limit 1;
 end if;
 insert into public.whatsapp_outbound_deliveries(id,organization_id,whatsapp_instance_id,lead_id,conversation_id,target,path,source,message_type,text_content,payload)
 values(p_id,org,p_instance,l,c,p_target,p_path,p_source,p_type,p_text,public.lead_archive_safe_json(p_payload));
 return jsonb_build_object('organization_id',org,'lead_id',l,'conversation_id',c);
end $$;

create function public.archive_whatsapp_outbound() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.lead_id is null then return new; end if;
 -- Preparation is durably recorded; provider media retrieval starts once a receipt exists.
 perform public.archive_lead_message_snapshot(jsonb_build_object(
   'id',new.id,'organization_id',new.organization_id,'lead_id',new.lead_id,'conversation_id',new.conversation_id,
   'whatsapp_instance_id',new.whatsapp_instance_id,'provider_chat_id',new.target,'provider_message_id',new.provider_message_id,
   'direction','outbound','message_type',new.message_type,'text_content',new.text_content,'occurred_at',new.created_at,
   'payload',new.payload || jsonb_build_object('delivery_status',new.status,'delivery_source',new.source,'outbound_delivery_id',new.id)
 ),'outbound_'||new.status);
 if new.status<>'sent' then
   update public.lead_message_archive set media_status='not_media' where message_id=new.id and operation='outbound_'||new.status;
 end if;
 return new;
end $$;
create trigger archive_whatsapp_outbound_write after insert or update on public.whatsapp_outbound_deliveries for each row execute function public.archive_whatsapp_outbound();

create function public.record_whatsapp_outbound_click(p_link uuid) returns text
language plpgsql security definer set search_path=public as $$
declare link public.whatsapp_outbound_links;
begin
 update public.whatsapp_outbound_links set click_count=click_count+1,last_clicked_at=now() where id=p_link returning * into link;
 if not found then return null; end if;
 insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
 values('organization',link.organization_id,'whatsapp_outbound_link',link.id,'tracked_link.clicked','Clique em link enviado pelo WhatsApp',link.label,'organization',array['lead_tracking','whatsapp_outbound'],
   jsonb_build_object('lead_id',link.lead_id,'outbound_delivery_id',link.delivery_id,'tracking_link_id',link.id,'label',link.label));
 return link.target_url;
end $$;
revoke all on function public.prepare_whatsapp_outbound(uuid,uuid,text,text,text,text,text,jsonb),public.archive_whatsapp_outbound(),public.record_whatsapp_outbound_click(uuid) from public,anon,authenticated;
grant execute on function public.prepare_whatsapp_outbound(uuid,uuid,text,text,text,text,text,jsonb),public.record_whatsapp_outbound_click(uuid) to service_role;
