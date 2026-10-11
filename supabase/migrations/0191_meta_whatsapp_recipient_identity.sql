-- Only provider-confirmed input/wa_id pairs, never inferred from phone digits.
create table public.meta_whatsapp_recipient_aliases (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 phone_number_id text not null,
 input_phone text not null check(input_phone ~ '^[0-9]{8,15}$'),
 wa_id text not null check(wa_id ~ '^[0-9]{8,15}$'),
 confirmed_at timestamptz not null default now(),
 primary key(organization_id,phone_number_id,input_phone)
);
create index meta_whatsapp_recipient_identity on public.meta_whatsapp_recipient_aliases(organization_id,phone_number_id,wa_id);
alter table public.meta_whatsapp_recipient_aliases enable row level security;
revoke all on public.meta_whatsapp_recipient_aliases from public,anon,authenticated;
grant all on public.meta_whatsapp_recipient_aliases to service_role;

-- Compatibility with the existing instance-scoped partial message index.
create or replace function public.archive_meta_whatsapp_message(p_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare m meta_whatsapp_messages; l uuid; c uuid; opted boolean;
begin
 select * into m from meta_whatsapp_messages where id=p_id;
 if not found then raise exception 'MESSAGE_NOT_FOUND'; end if;
 -- Use only a provider-confirmed alias, preserving the approved send address.
 m.phone := coalesce((select a.input_phone from meta_whatsapp_recipient_aliases a
  where a.organization_id=m.organization_id and a.phone_number_id=m.phone_number_id
  and a.wa_id=m.phone and a.input_phone<>a.wa_id order by a.confirmed_at desc limit 1),m.phone);
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
 on conflict do nothing;
 update conversation_messages set payload=payload || jsonb_build_object('status',m.status)
 where organization_id=m.organization_id and provider='meta_whatsapp'
 and provider_message_id=coalesce(m.provider_message_id,m.id::text);
 update conversations set last_message_preview=m.text_content,last_message_at=m.occurred_at where id=c and (last_message_at is null or last_message_at<=m.occurred_at);
 update leads set last_message_at=m.occurred_at,last_event_summary=m.text_content where id=l and (last_message_at is null or last_message_at<=m.occurred_at);
 if m.direction='inbound' then
  update meta_whatsapp_contacts set last_inbound_at=greatest(last_inbound_at,least(m.occurred_at,now())) where organization_id=m.organization_id and phone=m.phone;
 end if;
 return l;
end $$;
