-- Official WhatsApp pilot. No UAZAPI transport or customer markup.
create table public.meta_whatsapp_connections (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 waba_id text not null,
 phone_number_id text not null unique,
 display_phone text not null,
 verified_name text,
 encrypted_token text not null,
 permissions text[] not null default '{}',
 webhook_subscribed boolean not null default false,
 status text not null default 'connected' check(status in ('connected','disconnected')),
 connected_by uuid references auth.users(id),
 connected_at timestamptz not null default now(),
 webhook_at timestamptz
);
create table public.meta_whatsapp_oauth_attempts (
 state_hash text primary key,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null,
 consumed_at timestamptz
);
create table public.meta_whatsapp_contacts (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 phone text not null,
 lead_id uuid references public.leads(id) on delete set null,
 last_inbound_at timestamptz,
 opted_out boolean not null default false,
 consent_note text,
 consent_at timestamptz,
 primary key(organization_id,phone)
);
create table public.meta_whatsapp_messages (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 phone_number_id text not null,
 phone text not null,
 direction text not null check(direction in ('inbound','outbound')),
 message_type text not null,
 text_content text not null,
 provider_message_id text,
 request_key uuid,
 request_hash text,
 status text not null check(status in ('received','sending','accepted','sent','delivered','read','failed','uncertain')),
 error_code text,
 created_by uuid references auth.users(id),
 occurred_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,request_key),
 unique(phone_number_id,provider_message_id)
);
create index meta_whatsapp_messages_chat on public.meta_whatsapp_messages(organization_id,phone,occurred_at desc);
create table public.meta_whatsapp_receipts (
 phone_number_id text not null,
 provider_message_id text not null,
 status text not null,
 occurred_at timestamptz not null,
 error_code text,
 primary key(phone_number_id,provider_message_id,status)
);
alter table public.meta_whatsapp_connections enable row level security;
alter table public.meta_whatsapp_oauth_attempts enable row level security;
alter table public.meta_whatsapp_contacts enable row level security;
alter table public.meta_whatsapp_messages enable row level security;
alter table public.meta_whatsapp_receipts enable row level security;
revoke all on public.meta_whatsapp_connections,public.meta_whatsapp_oauth_attempts,public.meta_whatsapp_contacts,public.meta_whatsapp_messages,public.meta_whatsapp_receipts from public,anon,authenticated;
grant all on public.meta_whatsapp_connections,public.meta_whatsapp_oauth_attempts,public.meta_whatsapp_contacts,public.meta_whatsapp_messages,public.meta_whatsapp_receipts to service_role;

-- Locks serialize receipt/send-response races and preserve the highest delivery state.
create function public.reconcile_meta_whatsapp_receipt(p_phone text,p_message text) returns void
language plpgsql security definer set search_path=public as $$
declare best text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_phone||':'||p_message,0));
 select status into best from meta_whatsapp_receipts where phone_number_id=p_phone and provider_message_id=p_message
 order by case status when 'read' then 5 when 'delivered' then 4 when 'failed' then 3 when 'sent' then 2 else 0 end desc limit 1;
 if best is null then return; end if;
 update meta_whatsapp_messages set status=best,updated_at=now(),error_code=(select error_code from meta_whatsapp_receipts where phone_number_id=p_phone and provider_message_id=p_message and status=best)
 where phone_number_id=p_phone and provider_message_id=p_message and direction='outbound'
 and (case best when 'read' then 5 when 'delivered' then 4 when 'failed' then 3 when 'sent' then 2 else 0 end) >=
 (case status when 'read' then 5 when 'delivered' then 4 when 'failed' then 3 when 'sent' then 2 else 0 end);
end $$;

-- Register in the existing lead archive under an independent official channel.
create function public.archive_meta_whatsapp_message(p_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare m meta_whatsapp_messages; l uuid; c uuid; opted boolean;
begin
 select * into m from meta_whatsapp_messages where id=p_id;
 if not found then raise exception 'MESSAGE_NOT_FOUND'; end if;
 perform pg_advisory_xact_lock(hashtextextended(m.organization_id::text||':'||m.phone,0));
 select lead_id into l from meta_whatsapp_contacts where organization_id=m.organization_id and phone=m.phone;
 if l is null then
  select id into l from leads where organization_id=m.organization_id and regexp_replace(coalesce(phone_number,''),'[^0-9]','','g')=m.phone order by created_at limit 1;
 end if;
 if l is null then
  insert into leads(organization_id,channel,phone_number,display_name,status,source,metadata)
  values(m.organization_id,'whatsapp',m.phone,m.phone,'active','meta_whatsapp','{"official_whatsapp":true}') returning id into l;
 end if;
 insert into meta_whatsapp_contacts(organization_id,phone,lead_id) values(m.organization_id,m.phone,l)
 on conflict(organization_id,phone) do update set lead_id=excluded.lead_id;
 select id into c from conversations where organization_id=m.organization_id and provider='meta_whatsapp' and provider_chat_id=m.phone_number_id||':'||m.phone limit 1;
 if c is null then
  insert into conversations(organization_id,lead_id,channel,provider,provider_chat_id,status,metadata)
  values(m.organization_id,l,'whatsapp','meta_whatsapp',m.phone_number_id||':'||m.phone,'open','{"official_whatsapp":true}') returning id into c;
 end if;
 insert into conversation_messages(organization_id,conversation_id,lead_id,provider,provider_message_id,provider_chat_id,direction,message_type,text_content,payload,occurred_at)
 values(m.organization_id,c,l,'meta_whatsapp',coalesce(m.provider_message_id,m.id::text),m.phone_number_id||':'||m.phone,m.direction,m.message_type,m.text_content,jsonb_build_object('official_message_id',m.id,'status',m.status),m.occurred_at)
 on conflict(provider,provider_message_id) do update set payload=excluded.payload;
 update conversations set last_message_preview=m.text_content,last_message_at=m.occurred_at where id=c and (last_message_at is null or last_message_at<=m.occurred_at);
 update leads set last_message_at=m.occurred_at,last_event_summary=m.text_content where id=l and (last_message_at is null or last_message_at<=m.occurred_at);
 if m.direction='inbound' then
  update meta_whatsapp_contacts set last_inbound_at=greatest(last_inbound_at,least(m.occurred_at,now())) where organization_id=m.organization_id and phone=m.phone;
 end if;
 return l;
end $$;
revoke all on function public.reconcile_meta_whatsapp_receipt(text,text),public.archive_meta_whatsapp_message(uuid) from public,anon,authenticated;
grant execute on function public.reconcile_meta_whatsapp_receipt(text,text),public.archive_meta_whatsapp_message(uuid) to service_role;

create function public.meta_whatsapp_contact_allowed(p_org uuid,p_phone text) returns boolean
language sql security definer set search_path=public stable as $$
 select not exists(select 1 from leads where organization_id=p_org
 and regexp_replace(coalesce(phone_number,''),'[^0-9]','','g')=p_phone
 and (status='archived' or metadata->>'whatsapp_opt_out'='true' or coalesce(metadata#>>'{opt_out,requested_at}','')<>''))
 and not exists(select 1 from meta_whatsapp_contacts where organization_id=p_org and phone=p_phone and opted_out);
$$;
revoke all on function public.meta_whatsapp_contact_allowed(uuid,text) from public,anon,authenticated;
grant execute on function public.meta_whatsapp_contact_allowed(uuid,text) to service_role;

create function public.meta_whatsapp_number_separate(p_phone text) returns boolean
language sql security definer set search_path=public stable as $$
 select not exists(select 1 from whatsapp_instances where regexp_replace(coalesce(phone_number,''),'[^0-9]','','g')=p_phone);
$$;
revoke all on function public.meta_whatsapp_number_separate(text) from public,anon,authenticated;
grant execute on function public.meta_whatsapp_number_separate(text) to service_role;
