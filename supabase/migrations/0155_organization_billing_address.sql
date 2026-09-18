-- Private billing profile. No payment, subscription or universal signup changes.
create table public.organization_billing_addresses (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  address jsonb not null check (jsonb_typeof(address) = 'object'),
  contact jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.organization_billing_addresses enable row level security;
revoke all on public.organization_billing_addresses from public, anon, authenticated;
grant select, insert, update on public.organization_billing_addresses to service_role;
comment on table public.organization_billing_addresses is 'Organization billing address, scoped by authenticated owner/admin server routes; no card data.';


-- Platform checkout owner is ConnectyHub. Resolve the buyer from the organization;
-- the existing verified-phone journey links/creates the platform commercial lead.
create function public.record_billing_lead_context(p_org uuid, p_subscription uuid, p_kind text, p_method text default null, p_actor uuid default null)
returns text language plpgsql security definer set search_path=public as $$
declare s public.organization_subscriptions; b public.organization_billing_addresses;
 buyer uuid; facts jsonb; holder jsonb; doc text; payment_state text; amount numeric; outcome text;
begin
 if p_kind not in ('address_confirmed','method_selected') then raise exception 'INVALID_EVENT'; end if;
 if p_method is not null and p_method not in ('card','pix','pix_automatic') then raise exception 'INVALID_METHOD'; end if;
 select owner_id into buyer from organizations where id=p_org;
 if buyer is null then raise exception 'BUYER_REQUIRED'; end if;
 if p_subscription is not null then
  select * into s from organization_subscriptions where id=p_subscription and organization_id=p_org;
  if s.id is null then raise exception 'CHECKOUT_SCOPE'; end if;
 end if;
 select * into b from organization_billing_addresses where organization_id=p_org;
 holder := coalesce(nullif(b.contact,'{}'::jsonb),s.metadata->'billing_card_holder','{}'::jsonb);
 doc := regexp_replace(coalesce(holder->>'cpfCnpj',''),'[^0-9]','','g');
 select status,amount_brl into payment_state,amount from billing_payments where subscription_id=p_subscription and organization_id=p_org order by created_at desc limit 1;
 facts := jsonb_strip_nulls(jsonb_build_object('source','checkout_billing','recorded_at',now(),
  'name',nullif(holder->>'name',''),'email',coalesce(nullif(holder->>'email',''),s.payer_email),'phone',nullif(holder->>'phone',''),
  'document_preview',case when length(doc) in (11,14) then '***' || right(doc,4) else holder->>'documentPreview' end,
  'billing_address',b.address,'payment_method',p_method,'payment_status',payment_state,'subscription_status',s.status,
  'amount_brl',amount,'plan',s.plan_code,'period_end',s.current_period_end,'next_billing_at',s.next_billing_at));
 insert into platform_customer_journey(user_id,event_key,event_type,source_id,payload)
 values(buyer,'checkout_billing:'||gen_random_uuid(),'billing_'||p_kind,p_subscription,facts);
 outcome := case when not exists(select 1 from profiles where id=buyer and phone_verified_at is not null and phone_normalized is not null) then 'queued_awaiting_verified_phone_no_lead_updated' when not exists(select 1 from platform_customer_identities where user_id=buyer) then 'queued_awaiting_platform_lead' else 'queued_for_verified_platform_lead' end;
 insert into maintenance_audit_logs(actor_id,event_type,target_table,target_id,metadata)
 values(p_actor,'billing.lead_context.'||p_kind,'organizations',p_org,jsonb_build_object('source','checkout_billing','result',outcome,'subscription_id',p_subscription));
 return outcome;
end $$;
revoke all on function public.record_billing_lead_context(uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.record_billing_lead_context(uuid,uuid,text,text,uuid) to service_role;

create function public.save_organization_billing_address(p_org uuid,p_actor uuid,p_address jsonb,p_contact jsonb,p_subscription uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result text; old_address jsonb;
begin
 if p_subscription is not null and not exists(select 1 from organization_subscriptions where id=p_subscription and organization_id=p_org) then raise exception 'CHECKOUT_SCOPE'; end if;
 select address into old_address from organization_billing_addresses where organization_id=p_org for update;
 insert into organization_billing_addresses(organization_id,address,contact,updated_by) values(p_org,p_address,p_contact,p_actor)
 on conflict(organization_id) do update set address=excluded.address,
 contact=case when p_actor is null then excluded.contact else coalesce(nullif(organization_billing_addresses.contact,'{}'::jsonb),excluded.contact) end,
 updated_by=excluded.updated_by,updated_at=now();
 -- Address history stays in the financial audit, never in payment/card payloads.
 insert into maintenance_audit_logs(actor_id,event_type,target_table,target_id,metadata)
 values(p_actor,'billing.address.confirmed','organization_billing_addresses',p_org,jsonb_build_object('source','checkout_billing','previous_address',old_address,'address',p_address));
 result := record_billing_lead_context(p_org,p_subscription,'address_confirmed',null,p_actor);
 return jsonb_build_object('address',p_address,'leadResult',result);
end $$;
revoke all on function public.save_organization_billing_address(uuid,uuid,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.save_organization_billing_address(uuid,uuid,jsonb,jsonb,uuid) to service_role;

-- Only an event from the existing verified platform archive can enrich a lead.
-- Its original payload remains the immutable history; conflicting facts survive.
create function public.enrich_platform_billing_lead() returns trigger
language plpgsql security definer set search_path=public as $$
declare l public.leads; j public.platform_customer_journey; p public.profiles;
 facts jsonb; prior jsonb; k text; v jsonb; address_text text;
begin
 if new.source_type<>'platform_customer' or new.event_type not in ('lead.connectyhub_billing_address_confirmed','lead.connectyhub_billing_method_selected') then return new; end if;
 select * into j from platform_customer_journey where id=new.source_id::uuid;
 select * into p from profiles where id=j.user_id and phone_verified_at is not null;
 select lead.* into l from leads lead join platform_customer_identities i on i.lead_id=lead.id and i.user_id=p.id and i.verified_phone=p.phone_normalized
 where lead.id::text=new.payload->>'lead_id' and lead.organization_id=new.organization_id and lead.phone_number=p.phone_normalized;
 if l.id is null or not exists(select 1 from whatsapp_instances wi join platform_billing_settings bs on wi.metadata->>'agent_id'=bs.billing_whatsapp_agent_id::text where bs.setting_key='default' and wi.organization_id=l.organization_id and wi.metadata->>'admin_whatsapp'='true') then raise exception 'PLATFORM_LEAD_SCOPE'; end if;
 select metadata into prior from leads where id=l.id for update;
 facts := jsonb_build_object('name',j.payload->'name','email',j.payload->'email','phone',j.payload->'phone','document_preview',j.payload->'document_preview','billing_address',j.payload->'billing_address');
 for k,v in select key,value from jsonb_each(jsonb_strip_nulls(facts)) loop
  if prior->k is null or prior->k in ('null'::jsonb,'""'::jsonb,'{}'::jsonb) then prior := jsonb_set(prior,array[k],v); end if;
 end loop;
 if jsonb_typeof(j.payload->'billing_address')='object' then
  facts := j.payload->'billing_address';
  address_text := concat(facts->>'street',', ',facts->>'number',case when coalesce(facts->>'complement','')<>'' then ' · '||(facts->>'complement') else '' end,' · ',facts->>'neighborhood',' · ',facts->>'city','/',facts->>'state',' · CEP ',facts->>'postalCode',' · Brasil');
  if nullif(prior->>'address','') is null then prior := jsonb_set(prior,'{address}',to_jsonb(address_text)); end if;
 end if;
 update leads set metadata=prior,display_name=coalesce(nullif(display_name,''),j.payload->>'name'),updated_at=now() where id=l.id and organization_id=new.organization_id;
 return new;
end $$;
revoke all on function public.enrich_platform_billing_lead() from public,anon,authenticated;
create trigger enrich_platform_billing_lead after insert on public.intelligence_events for each row execute function public.enrich_platform_billing_lead();

-- Public lead facts are an allowlist. Financial identifiers stay in billing.
create function public.platform_lead_billing_facts(p_kind text,p_payload jsonb) returns jsonb
language plpgsql immutable set search_path=public as $$
declare result jsonb; methods text;
begin
 if p_kind in ('billing_address_confirmed','billing_method_selected') then
  select coalesce(jsonb_object_agg(key,value),'{}') into result from jsonb_each(p_payload)
  where key in ('source','recorded_at','name','email','phone','document_preview','billing_address','payment_method','payment_status','subscription_status','amount_brl','plan','period_end','next_billing_at');
 elsif p_kind in ('payment','subscription') then
  select coalesce(jsonb_object_agg(key,value),'{}') into result from jsonb_each(p_payload)
  where key in ('status','amount_brl','paid_at','created_at','plan_code','current_period_start','current_period_end','next_billing_at','canceled_at','subscription_kind','commercial_terms','selected_bumps','purchase_kind','payment_method');
  result := result || jsonb_build_object('source','platform_billing');
 else return lead_archive_safe_json(p_payload);
 end if;
 return lead_archive_safe_json(result);
end $$;
revoke all on function public.platform_lead_billing_facts(text,jsonb) from public,anon,authenticated;

-- Preserve the existing journal/verified-identity algorithm and notice delivery
-- archive; change only its projection of facts into the commercial lead file.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.archive_platform_customer_journey(integer)'::regprocedure) into definition;
 if position('public.lead_archive_safe_json(j.payload)||jsonb_build_object' in definition)=0 then raise exception 'ARCHIVE_ANCHOR_MISSING'; end if;
 definition := replace(definition,'public.lead_archive_safe_json(j.payload)||jsonb_build_object','public.platform_lead_billing_facts(j.event_type,j.payload)||jsonb_build_object');
 if position($old$'Conta ConnectyHub: '||j.event_type$old$ in definition)=0 then raise exception 'JOURNEY_TITLE_ANCHOR_MISSING'; end if;
 definition := replace(definition,$old$'Conta ConnectyHub: '||j.event_type$old$,$new$case j.event_type when 'billing_address_confirmed' then 'Dados de faturamento informados no checkout' when 'billing_method_selected' then 'Forma de pagamento escolhida' when 'payment' then 'Pagamento da ConnectyHub atualizado' when 'subscription' then 'Assinatura da ConnectyHub atualizada' else 'Conta ConnectyHub: '||j.event_type end$new$);
 execute definition;
 select pg_get_functiondef('public.archive_platform_financial_change()'::regprocedure) into definition;
 if position($old$'selected_bumps',new.payload->'selected_bumps'$old$ in definition)=0 then raise exception 'PAYMENT_JOURNEY_ANCHOR_MISSING'; end if;
 definition := replace(definition,$old$'selected_bumps',new.payload->'selected_bumps'$old$,$new$'selected_bumps',new.payload->'selected_bumps','payment_method',case when new.payload ? 'pix_automatic_authorization_id' then 'pix_automatic' when coalesce(new.payload->>'billing_payment_method',new.payload->>'payment_method') in ('card','credit_card') then 'card' when coalesce(new.payload->>'billing_payment_method',new.payload->>'payment_method')='pix' then 'pix' else null end$new$);
 execute definition;
end $migration$;
