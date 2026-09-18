-- Preserve holder data as a reviewable suggestion, never as an implicit change
-- to confirmed organization billing details. No PAN/CVV/provider token here.
alter table public.organization_billing_addresses add column address_confirmed boolean not null default true;
alter table public.organization_billing_addresses add column suggestion jsonb;

create function public.capture_billing_holder(p_org uuid,p_actor uuid,p_subscription uuid,p_request uuid,p_source text,p_holder jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare buyer uuid; draft jsonb; contact jsonb; address jsonb;
begin
 perform 1 from organizations where id=p_org for update;
 select owner_id into buyer from organizations where id=p_org;
 if buyer is null or not exists(select 1 from organization_subscriptions where id=p_subscription and organization_id=p_org) then raise exception 'BILLING_SCOPE'; end if;
 if p_actor is not null and p_actor<>buyer and not exists(select 1 from organization_members where organization_id=p_org and user_id=p_actor and role in ('owner','admin')) then raise exception 'BILLING_FORBIDDEN'; end if;
 if p_source not in ('card_replacement','card_added','checkout','checkout_recovery') or p_request is null then raise exception 'BILLING_SOURCE'; end if;
 if exists(select 1 from platform_customer_journey where event_key='billing_holder:'||p_request) then return; end if;
 contact:=jsonb_build_object('name',left(coalesce(p_holder->>'name',''),120),'email',left(coalesce(p_holder->>'email',''),254),
   'phone',left(regexp_replace(coalesce(p_holder->>'phone',''),'[^0-9]','','g'),13),
   'cpfCnpj',left(regexp_replace(coalesce(p_holder->>'cpfCnpj',''),'[^0-9]','','g'),14));
 address:=jsonb_build_object('postalCode',left(regexp_replace(coalesce(p_holder->>'postalCode',''),'[^0-9]','','g'),8),'number',left(coalesce(p_holder->>'addressNumber',''),6),'country','BR');
 draft:=jsonb_build_object('id',p_request,'source',p_source,'subscriptionId',p_subscription,'contact',contact,'address',address,'createdAt',now());
 insert into organization_billing_addresses(organization_id,address,contact,address_confirmed,suggestion,updated_by)
 values(p_org,'{}','{}',false,draft,p_actor)
 on conflict(organization_id) do update set suggestion=draft,updated_by=p_actor,updated_at=clock_timestamp();
 insert into maintenance_audit_logs(actor_id,event_type,target_table,target_id,metadata)
 values(p_actor,'billing.holder.proposed','organization_billing_addresses',p_org,jsonb_build_object('source',p_source,'request_id',p_request,'subscription_id',p_subscription));
 insert into platform_customer_journey(user_id,event_key,event_type,source_id,payload)
 values(buyer,'billing_holder:'||p_request,'billing_holder_proposed',p_subscription,jsonb_build_object('source',p_source,'requires_confirmation',true,'document_preview','***'||right(contact->>'cpfCnpj',4)));
end $$;

-- Existing financial RPCs remain responsible for all locks, consent, busy checks,
-- default uniqueness and top-up references. Profile writes share their transaction.
create function public.finish_billing_card_replacement_profile(p_org uuid,p_actor uuid,p_subscription uuid,p_request uuid,p_token_encrypted text default null,p_last_four text default null,p_failure text default null,p_card_metadata jsonb default null,p_holder jsonb default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; was_processing boolean; method uuid;
begin
 perform 1 from organizations where id=p_org for update;
 select state='processing' into was_processing from billing_card_replacements where id=p_request and organization_id=p_org and actor_id=p_actor and subscription_id=p_subscription;
 result:=finish_billing_card_replacement(p_org,p_actor,p_subscription,p_request,p_token_encrypted,p_last_four,p_failure);
 if was_processing and result->>'state'='succeeded' then
  select new_method_id into method from billing_card_replacements where id=p_request;
  update billing_asaas_card_vault set brand=left(p_card_metadata->>'brand',32),exp_month=p_card_metadata->>'exp_month',exp_year=p_card_metadata->>'exp_year' where id=method and organization_id=p_org and subscription_id=p_subscription;
  if p_holder is not null then perform capture_billing_holder(p_org,p_actor,p_subscription,p_request,'card_replacement',p_holder); end if;
 end if;
 return result;
end $$;

create function public.set_billing_default_card_profile(p_org uuid,p_actor uuid,p_subscription uuid,p_request uuid,p_expected_default uuid,p_expected_end timestamptz,p_consent text,p_method uuid default null,p_card jsonb default null,p_holder jsonb default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 result:=set_billing_default_card(p_org,p_actor,p_subscription,p_request,p_expected_default,p_expected_end,p_consent,p_method,p_card);
 if p_method is null and p_holder is not null and not coalesce((result->>'replayed')::boolean,false) then
  perform capture_billing_holder(p_org,p_actor,p_subscription,p_request,'card_added',p_holder);
 end if;
 return result;
end $$;

create function public.confirm_organization_billing_profile(p_org uuid,p_actor uuid,p_address jsonb,p_contact jsonb,p_expected_updated_at timestamptz,p_suggestion uuid default null,p_subscription uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare prior public.organization_billing_addresses; contact jsonb; stamp timestamptz;
begin
 perform 1 from organizations where id=p_org for update;
 if not exists(select 1 from organizations where id=p_org and owner_id=p_actor) and not exists(select 1 from organization_members where organization_id=p_org and user_id=p_actor and role in ('owner','admin')) then raise exception 'BILLING_FORBIDDEN'; end if;
 if p_subscription is not null and not exists(select 1 from organization_subscriptions where id=p_subscription and organization_id=p_org) then raise exception 'BILLING_SCOPE'; end if;
 select * into prior from organization_billing_addresses where organization_id=p_org for update;
 if prior.updated_at is distinct from p_expected_updated_at then raise exception 'BILLING_PROFILE_CHANGED'; end if;
 if p_suggestion is not null and (prior.suggestion->>'id') is distinct from p_suggestion::text then raise exception 'BILLING_PROFILE_CHANGED'; end if;
 contact:=case when p_contact is null then coalesce(prior.contact,'{}') else jsonb_strip_nulls(jsonb_build_object(
  'name',p_contact->>'name','email',p_contact->>'email','phone',p_contact->>'phone','cpfCnpj',p_contact->>'cpfCnpj','documentPreview',p_contact->>'documentPreview')) end;
 insert into organization_billing_addresses(organization_id,address,contact,address_confirmed,suggestion,updated_by,updated_at)
 values(p_org,p_address,contact,true,null,p_actor,clock_timestamp())
 on conflict(organization_id) do update set address=excluded.address,contact=excluded.contact,address_confirmed=true,
 suggestion=case when p_suggestion is not null then null else organization_billing_addresses.suggestion end,updated_by=p_actor,updated_at=excluded.updated_at returning updated_at into stamp;
 insert into maintenance_audit_logs(actor_id,event_type,target_table,target_id,metadata)
 values(p_actor,'billing.profile.confirmed','organization_billing_addresses',p_org,jsonb_build_object('source','account_billing','suggestion_id',p_suggestion,'address',p_address,'previous_address',prior.address));
 perform record_billing_lead_context(p_org,p_subscription,'address_confirmed',null,p_actor);
 return jsonb_build_object('address',p_address,'contact',contact,'updatedAt',stamp);
end $$;

-- An expired paid plan may maintain its payment credential without reactivating
-- access, changing dates or creating a payment. Canceled/paused remain blocked.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.billing_card_replacement_block(uuid,uuid,uuid)'::regprocedure) into definition;
 if position('s.status is distinct from ''active''' in definition)=0 or position('or s.current_period_end<=now()' in definition)=0 then raise exception 'REPLACEMENT_ANCHOR'; end if;
 definition:=replace(replace(definition,'s.status is distinct from ''active''','s.status not in (''active'',''past_due'')'),'or s.current_period_end<=now()','');
 execute definition;
 select pg_get_functiondef('public.set_billing_default_card(uuid,uuid,uuid,uuid,uuid,timestamptz,text,uuid,jsonb)'::regprocedure) into definition;
 if position('s.status<>''active''' in definition)=0 or position('or s.current_period_end<=now()' in definition)=0 then raise exception 'DEFAULT_ANCHOR'; end if;
 definition:=replace(replace(definition,'s.status<>''active''','s.status not in (''active'',''past_due'')'),'or s.current_period_end<=now()','');
 if position('values(p_actor,''billing_card_default:''||p_request' in definition)=0 then raise exception 'CARD_JOURNEY_ANCHOR'; end if;
 definition:=replace(definition,'values(p_actor,''billing_card_default:''||p_request','values((select owner_id from public.organizations where id=p_org),''billing_card_default:''||p_request');
 execute definition;
end $migration$;

revoke all on function public.capture_billing_holder(uuid,uuid,uuid,uuid,text,jsonb),public.finish_billing_card_replacement_profile(uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb),public.set_billing_default_card_profile(uuid,uuid,uuid,uuid,uuid,timestamptz,text,uuid,jsonb,jsonb),public.confirm_organization_billing_profile(uuid,uuid,jsonb,jsonb,timestamptz,uuid,uuid) from public,anon,authenticated;
grant execute on function public.capture_billing_holder(uuid,uuid,uuid,uuid,text,jsonb),public.finish_billing_card_replacement_profile(uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb),public.set_billing_default_card_profile(uuid,uuid,uuid,uuid,uuid,timestamptz,text,uuid,jsonb,jsonb),public.confirm_organization_billing_profile(uuid,uuid,jsonb,jsonb,timestamptz,uuid,uuid) to service_role;
