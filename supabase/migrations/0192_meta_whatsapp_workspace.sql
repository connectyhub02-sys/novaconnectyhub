-- Multiple official senders, inbox state and a durable, consented campaign queue.
alter table public.meta_whatsapp_connections drop constraint meta_whatsapp_connections_pkey;
alter table public.meta_whatsapp_connections add primary key(phone_number_id);
alter table public.meta_whatsapp_connections add column label text;
create index meta_whatsapp_connections_org on public.meta_whatsapp_connections(organization_id,status);
alter table public.meta_whatsapp_messages add column content jsonb not null default '{}';
create index meta_whatsapp_messages_sender_chat on public.meta_whatsapp_messages(organization_id,phone_number_id,phone,occurred_at desc,id desc);

create table public.meta_whatsapp_threads (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 phone_number_id text not null, phone text not null,
 display_name text, status text not null default 'open' check(status in ('open','resolved')),
 assigned_to uuid references auth.users(id), last_message_at timestamptz not null default now(),
 last_message_preview text not null default '', last_inbound_at timestamptz,
 last_read_at timestamptz, unread_count integer not null default 0,
 primary key(organization_id,phone_number_id,phone)
);
create index meta_whatsapp_threads_inbox on public.meta_whatsapp_threads(organization_id,last_message_at desc);
create table public.meta_whatsapp_notes (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 phone_number_id text not null, phone text not null, body text not null check(length(body) between 1 and 4000),
 created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table public.meta_whatsapp_media (
 id text primary key, organization_id uuid not null references public.organizations(id),
 phone_number_id text not null, mime_type text not null, filename text not null,
 media_type text not null, created_at timestamptz not null default now()
);
create index meta_whatsapp_notes_thread on public.meta_whatsapp_notes(organization_id,phone_number_id,phone,created_at desc);
create table public.meta_whatsapp_campaigns (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 phone_number_id text not null, name text not null check(length(name) between 1 and 120),
 template_name text not null, language text not null, template_snapshot jsonb not null,
 parameters jsonb not null default '[]', consent_note text not null check(length(consent_note) between 5 and 500),
 status text not null default 'draft' check(status in ('draft','running','paused','cancelled','completed')),
 scheduled_at timestamptz not null default now(), created_by uuid references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 request_key uuid not null, request_fingerprint text not null, unique(organization_id,request_key)
);
create table public.meta_whatsapp_campaign_recipients (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.meta_whatsapp_campaigns(id),
 organization_id uuid not null references public.organizations(id), phone text not null check(phone ~ '^[1-9][0-9]{7,14}$'),
 status text not null default 'pending' check(status in ('pending','processing','sent','failed','skipped','uncertain','cancelled')),
 request_key uuid not null default gen_random_uuid(), message_id uuid references public.meta_whatsapp_messages(id),
 detail text, updated_at timestamptz not null default now(), unique(campaign_id,phone), unique(request_key)
);
create index meta_whatsapp_campaign_queue on public.meta_whatsapp_campaign_recipients(status,updated_at);

create function public.upsert_meta_whatsapp_thread() returns trigger language plpgsql security definer set search_path=public as $$
declare destination text;
begin
 destination := coalesce((select a.input_phone from meta_whatsapp_recipient_aliases a where a.organization_id=new.organization_id and a.phone_number_id=new.phone_number_id and a.wa_id=new.phone and a.input_phone<>a.wa_id order by confirmed_at desc limit 1),new.phone);
 insert into meta_whatsapp_threads(organization_id,phone_number_id,phone,last_message_at,last_message_preview,last_inbound_at,unread_count)
 values(new.organization_id,new.phone_number_id,destination,new.occurred_at,new.text_content,
 case when new.direction='inbound' then least(new.occurred_at,now()) end,case when new.direction='inbound' then 1 else 0 end)
 on conflict(organization_id,phone_number_id,phone) do update set
 last_message_preview=case when excluded.last_message_at>=meta_whatsapp_threads.last_message_at then excluded.last_message_preview else meta_whatsapp_threads.last_message_preview end,
 last_message_at=greatest(meta_whatsapp_threads.last_message_at,excluded.last_message_at),
 last_inbound_at=greatest(meta_whatsapp_threads.last_inbound_at,excluded.last_inbound_at),
 unread_count=meta_whatsapp_threads.unread_count+case when new.direction='inbound' and (meta_whatsapp_threads.last_read_at is null or new.occurred_at>meta_whatsapp_threads.last_read_at) then 1 else 0 end,
 status=case when new.direction='inbound' then 'open' else meta_whatsapp_threads.status end;
 return new;
end $$;
create trigger meta_whatsapp_inbox_insert after insert on public.meta_whatsapp_messages for each row execute function public.upsert_meta_whatsapp_thread();
insert into public.meta_whatsapp_threads(organization_id,phone_number_id,phone,last_message_at,last_message_preview,last_inbound_at)
select organization_id,phone_number_id,phone,max(occurred_at),(array_agg(text_content order by occurred_at desc))[1],max(occurred_at) filter(where direction='inbound')
from (select m.organization_id,m.phone_number_id,coalesce((select a.input_phone from public.meta_whatsapp_recipient_aliases a where a.organization_id=m.organization_id and a.phone_number_id=m.phone_number_id and a.wa_id=m.phone and a.input_phone<>a.wa_id order by a.confirmed_at desc limit 1),m.phone) phone,m.occurred_at,m.text_content,m.direction from public.meta_whatsapp_messages m) history
group by organization_id,phone_number_id,phone on conflict do nothing;

create function public.connect_meta_whatsapp_sender(p_org uuid,p_sender text,p_waba text,p_phone text,p_name text,p_token text,p_permissions text[],p_actor uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 insert into meta_whatsapp_connections(organization_id,phone_number_id,waba_id,display_phone,verified_name,encrypted_token,permissions,connected_by,status,webhook_subscribed)
 values(p_org,p_sender,p_waba,p_phone,p_name,p_token,p_permissions,p_actor,'connected',false)
 on conflict(phone_number_id) do update set waba_id=excluded.waba_id,display_phone=excluded.display_phone,verified_name=excluded.verified_name,encrypted_token=excluded.encrypted_token,permissions=excluded.permissions,connected_by=excluded.connected_by,status='connected',webhook_subscribed=false,connected_at=now()
 where meta_whatsapp_connections.organization_id=excluded.organization_id;
 if not found then raise exception 'SENDER_ALREADY_OWNED'; end if;
end $$;

create function public.create_meta_whatsapp_campaign(p_org uuid,p_actor uuid,p_key uuid,p_sender text,p_name text,p_template jsonb,p_parameters jsonb,p_consent text,p_phones jsonb,p_scheduled timestamptz) returns uuid
language plpgsql security definer set search_path=public as $$
declare campaign uuid; fingerprint text; existing_fingerprint text;
begin
 if jsonb_typeof(p_phones)<>'array' or jsonb_array_length(p_phones) not between 1 and 10000 then raise exception 'INVALID_AUDIENCE'; end if;
 if not exists(select 1 from meta_whatsapp_connections where organization_id=p_org and phone_number_id=p_sender and status='connected' and webhook_subscribed) then raise exception 'INVALID_SENDER'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||p_key::text,0));
 fingerprint:=md5(jsonb_build_array(p_sender,p_name,p_template,p_parameters,p_consent,p_phones,p_scheduled)::text);
 select id,request_fingerprint into campaign,existing_fingerprint from meta_whatsapp_campaigns where organization_id=p_org and request_key=p_key;
 if campaign is not null then
 if existing_fingerprint<>fingerprint then raise exception 'CAMPAIGN_KEY_CONFLICT'; end if;
 return campaign; end if;
 insert into meta_whatsapp_campaigns(organization_id,phone_number_id,name,template_name,language,template_snapshot,parameters,consent_note,scheduled_at,created_by,request_key,request_fingerprint)
 values(p_org,p_sender,p_name,p_template->>'name',p_template->>'language',p_template,p_parameters,p_consent,coalesce(p_scheduled,now()),p_actor,p_key,fingerprint) returning id into campaign;
 insert into meta_whatsapp_campaign_recipients(campaign_id,organization_id,phone)
 select campaign,p_org,coalesce((select a.input_phone from meta_whatsapp_recipient_aliases a where a.organization_id=p_org and a.phone_number_id=p_sender and a.wa_id=v and a.input_phone<>a.wa_id order by confirmed_at desc limit 1),v)
 from jsonb_array_elements_text(p_phones) v on conflict(campaign_id,phone) do nothing;
 return campaign;
end $$;

create function public.claim_meta_whatsapp_campaign_batch(p_limit integer default 20) returns setof public.meta_whatsapp_campaign_recipients
language plpgsql security definer set search_path=public as $$
begin
 -- A crashed sender is never blindly retried after reserving an external message.
 update meta_whatsapp_campaign_recipients r set status=case when m.status in ('accepted','sent','delivered','read') then 'sent' when m.status='failed' then 'failed' else 'uncertain' end,message_id=m.id,detail='Recuperado após interrupção',updated_at=now()
 from meta_whatsapp_messages m where r.status='processing' and r.updated_at<now()-interval '10 minutes' and m.organization_id=r.organization_id and m.request_key=r.request_key;
 update meta_whatsapp_campaign_recipients r set status='pending',updated_at=now() where r.status='processing' and r.updated_at<now()-interval '10 minutes' and not exists(select 1 from meta_whatsapp_messages m where m.organization_id=r.organization_id and m.request_key=r.request_key);
 update meta_whatsapp_campaign_recipients r set status='cancelled',updated_at=now() from meta_whatsapp_campaigns c where c.id=r.campaign_id and c.organization_id=r.organization_id and c.status='cancelled' and r.status='pending';
 return query with candidates as (
 select r.id from meta_whatsapp_campaign_recipients r join meta_whatsapp_campaigns c on c.id=r.campaign_id and c.organization_id=r.organization_id
 where r.status='pending' and c.status='running' and c.scheduled_at<=now() order by r.updated_at,r.id limit least(greatest(p_limit,1),30) for update of r skip locked
 ) update meta_whatsapp_campaign_recipients r set status='processing',updated_at=now() from candidates q where r.id=q.id returning r.*;
end $$;

do $$ declare t text; begin
 foreach t in array array['meta_whatsapp_threads','meta_whatsapp_notes','meta_whatsapp_media','meta_whatsapp_campaigns','meta_whatsapp_campaign_recipients'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
revoke all on function public.upsert_meta_whatsapp_thread(),public.connect_meta_whatsapp_sender(uuid,text,text,text,text,text,text[],uuid),public.create_meta_whatsapp_campaign(uuid,uuid,uuid,text,text,jsonb,jsonb,text,jsonb,timestamptz),public.claim_meta_whatsapp_campaign_batch(integer) from public,anon,authenticated;
grant execute on function public.connect_meta_whatsapp_sender(uuid,text,text,text,text,text,text[],uuid),public.create_meta_whatsapp_campaign(uuid,uuid,uuid,text,text,jsonb,jsonb,text,jsonb,timestamptz),public.claim_meta_whatsapp_campaign_batch(integer) to service_role;

create function public.meta_whatsapp_campaign_summaries(p_org uuid) returns setof jsonb
language sql security definer set search_path=public stable as $$
 select to_jsonb(c)||jsonb_build_object('total',(select count(*) from meta_whatsapp_campaign_recipients r where r.campaign_id=c.id and r.organization_id=p_org),'counts',coalesce((
 select jsonb_object_agg(s,n) from (
 select case when m.status in ('delivered','read','failed') then m.status else r.status end s,count(*) n
 from meta_whatsapp_campaign_recipients r left join meta_whatsapp_messages m on m.id=r.message_id and m.organization_id=r.organization_id
 where r.campaign_id=c.id and r.organization_id=p_org group by 1) counted),'{}'::jsonb))
 from meta_whatsapp_campaigns c where c.organization_id=p_org order by c.created_at desc limit 50;
$$;
revoke all on function public.meta_whatsapp_campaign_summaries(uuid) from public,anon,authenticated;
grant execute on function public.meta_whatsapp_campaign_summaries(uuid) to service_role;
