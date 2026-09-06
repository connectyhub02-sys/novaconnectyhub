create table public.platform_customer_identities (
  user_id uuid primary key references auth.users(id), lead_id uuid not null unique references public.leads(id),
  verified_phone text not null, updated_at timestamptz not null default now()
);
create table public.platform_customer_journey (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  event_key text not null unique, event_type text not null, source_id uuid,
  payload jsonb not null default '{}', created_at timestamptz not null default now(), archived_at timestamptz
);
create index platform_customer_journey_archive on public.platform_customer_journey(created_at) where archived_at is null;
alter table public.platform_customer_identities enable row level security;
alter table public.platform_customer_journey enable row level security;
revoke all on public.platform_customer_identities,public.platform_customer_journey from anon,authenticated;
grant all on public.platform_customer_identities,public.platform_customer_journey to service_role;

create or replace function public.archive_platform_financial_change() returns trigger
language plpgsql security definer set search_path=public as $$
declare buyer uuid; body jsonb; kind text; key text;
begin
  if tg_table_name='platform_product_entitlements' then
    buyer:=new.buyer_user_id; kind:='product_access';
    body:=jsonb_build_object('product_id',new.product_id,'title',new.title,'billing_cycle',new.billing_cycle,'state',new.state,'payment_id',new.payment_id,'ends_at',new.ends_at);
  else
    select owner_id into buyer from public.organizations where id=new.organization_id;
    kind:=case tg_table_name when 'billing_payments' then 'payment' when 'organization_subscriptions' then 'subscription' else 'billing_notice' end;
    body:=public.lead_archive_safe_json(to_jsonb(new)-'payload'-'metadata');
    if tg_table_name='billing_payments' then
      body:=body||public.lead_archive_safe_json(jsonb_build_object('commercial_terms',new.payload->'commercial_terms','selected_bumps',new.payload->'selected_bumps','purchase_kind',new.payload->'purchase_kind'));
    elsif tg_table_name='organization_subscriptions' then
      body:=body||public.lead_archive_safe_json(jsonb_build_object('commercial_terms',new.metadata->'commercial_terms','manual_activation',new.metadata->'manual_activation','reason',new.metadata->'reason','source',new.metadata->'source','actor_id',new.metadata->'actor_id'));
    end if;
    if tg_table_name='billing_notification_events' then
      body:=body||jsonb_build_object('message',coalesce(new.metadata->>'sent_message_body',new.metadata->>'message_body',new.message_preview));
    end if;
  end if;
  if buyer is null then return new; end if;
  key:=tg_table_name||':'||new.id||':'||md5((body-'updated_at')::text);
  insert into public.platform_customer_journey(user_id,event_key,event_type,source_id,payload)
    values(buyer,key,kind,new.id,body) on conflict do nothing;
  return new;
end $$;
create trigger platform_payment_journey after insert or update of status,payload on public.billing_payments for each row execute function public.archive_platform_financial_change();
create trigger platform_subscription_journey after insert or update of status,current_period_end on public.organization_subscriptions for each row execute function public.archive_platform_financial_change();
create trigger platform_notice_journey after insert or update of status on public.billing_notification_events for each row execute function public.archive_platform_financial_change();
create trigger platform_product_journey after insert or update of state,buyer_user_id on public.platform_product_entitlements for each row execute function public.archive_platform_financial_change();

create or replace function public.archive_platform_customer_journey(p_limit integer default 100) returns integer
language plpgsql security definer set search_path=public as $$
declare j public.platform_customer_journey; p public.profiles; inst public.whatsapp_instances; lead uuid; conv uuid; count integer:=0; notice public.billing_notification_events;
begin
  for j in select journey.* from public.platform_customer_journey journey join public.profiles profile on profile.id=journey.user_id where journey.archived_at is null and profile.phone_verified_at is not null and profile.phone_normalized is not null order by journey.created_at for update of journey skip locked limit least(p_limit,500) loop
    select * into p from public.profiles where id=j.user_id;
    -- Financial identity is linked only after ownership of the WhatsApp number is verified.
    if p.phone_verified_at is null or p.phone_normalized is null then continue; end if;
    select wi.* into inst from public.whatsapp_instances wi join public.platform_billing_settings bs
      on wi.metadata->>'agent_id'=bs.billing_whatsapp_agent_id::text
      where bs.setting_key='default' and wi.metadata->>'admin_whatsapp'='true' order by wi.updated_at desc limit 1;
    if inst.id is null then continue; end if;
    select id into lead from public.leads where organization_id=inst.organization_id and channel='whatsapp' and phone_number=p.phone_normalized;
    if lead is null then
      insert into public.leads(organization_id,channel,phone_number,display_name,source)
        values(inst.organization_id,'whatsapp',p.phone_normalized,coalesce(p.full_name,'Cliente ConnectyHub'),'connectyhub_account')
        on conflict(organization_id,channel,phone_number) where phone_number is not null do update set updated_at=now() returning id into lead;
    end if;
    insert into public.platform_customer_identities(user_id,lead_id,verified_phone) values(p.id,lead,p.phone_normalized)
      on conflict(user_id) do update set lead_id=excluded.lead_id,verified_phone=excluded.verified_phone,updated_at=now();
    insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
      values('organization',inst.organization_id,'platform_customer',j.id,'lead.connectyhub_'||j.event_type,
        'Conta ConnectyHub: '||j.event_type,'Atualização registrada na jornada financeira do cliente.','organization',array['lead_tracking','billing'],
        public.lead_archive_safe_json(j.payload)||jsonb_build_object('lead_id',lead,'customer_user_id',p.id,'journey_id',j.id));
    if j.event_type='partial_refund_review' then
      insert into public.sales_catalog_payment_reviews(organization_id,lead_id,notification_payload)
        values(inst.organization_id,lead,jsonb_build_object('reason','platform_partial_refund','billing_payment_id',j.source_id,'message','Reembolso parcial informado pelo provedor. Conferir os itens antes de alterar acessos.'))
        on conflict do nothing;
    end if;
    if j.event_type='billing_notice' and j.payload->>'status'='sent' then
      select * into notice from public.billing_notification_events where id=j.source_id;
      if regexp_replace(coalesce(notice.recipient_phone,''),'[^0-9]','','g')=p.phone_normalized then
        select wi.* into inst from public.whatsapp_instances wi where wi.metadata->>'agent_id'=notice.selected_agent_id::text and wi.metadata->>'admin_whatsapp'='true' and wi.organization_id=(select organization_id from public.leads where id=lead) order by wi.updated_at desc limit 1;
        if inst.id is not null then
          select id into conv from public.conversations where organization_id=inst.organization_id and lead_id=lead and whatsapp_instance_id=inst.id order by updated_at desc limit 1;
          if conv is null then
            insert into public.conversations(organization_id,lead_id,whatsapp_instance_id,provider,provider_chat_id)
              values(inst.organization_id,lead,inst.id,'uazapi',p.phone_normalized||'@s.whatsapp.net')
              on conflict(organization_id,whatsapp_instance_id,provider,provider_chat_id) where provider_chat_id is not null and whatsapp_instance_id is not null do update set updated_at=now() returning id into conv;
          end if;
          insert into public.conversation_messages(organization_id,conversation_id,lead_id,whatsapp_instance_id,provider,provider_message_id,provider_chat_id,direction,message_type,text_content,occurred_at,payload)
            values(inst.organization_id,conv,lead,inst.id,'uazapi',coalesce(notice.provider_message_id,'billing_notice:'||notice.id),p.phone_normalized||'@s.whatsapp.net','outbound','text',
              public.lead_archive_safe_json(to_jsonb(coalesce(notice.metadata->>'sent_message_body',notice.metadata->>'message_body',notice.message_preview)))#>>'{}',coalesce(notice.sent_at,notice.created_at),jsonb_build_object('billing_notification_id',notice.id,'source','platform_billing','agent_id',notice.selected_agent_id))
            on conflict(provider,provider_message_id) where provider_message_id is not null do nothing;
        end if;
      end if;
    end if;
    update public.platform_customer_journey set archived_at=now() where id=j.id; count:=count+1;
  end loop;
  return count;
end $$;
revoke all on function public.archive_platform_customer_journey(integer) from public,anon,authenticated;
grant execute on function public.archive_platform_customer_journey(integer) to service_role;

create or replace function public.link_verified_platform_customer(p_lead uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare l public.leads; p public.profiles;
begin
  select * into l from public.leads where id=p_lead;
  if not found or not exists(select 1 from public.whatsapp_instances where organization_id=l.organization_id and metadata->>'admin_whatsapp'='true') then return false; end if;
  select * into p from public.profiles where phone_normalized=l.phone_number and phone_verified_at is not null;
  if not found then return false; end if;
  insert into public.platform_customer_identities(user_id,lead_id,verified_phone) values(p.id,l.id,p.phone_normalized)
    on conflict(user_id) do update set lead_id=excluded.lead_id,verified_phone=excluded.verified_phone,updated_at=now();
  return true;
end $$;
revoke all on function public.link_verified_platform_customer(uuid) from public,anon,authenticated;
grant execute on function public.link_verified_platform_customer(uuid) to service_role;
