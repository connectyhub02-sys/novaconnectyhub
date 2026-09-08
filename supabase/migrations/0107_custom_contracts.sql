create table public.organization_custom_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  version integer not null,
  name text not null check (length(name) between 1 and 120),
  base_plan_code text not null check (base_plan_code in ('starter','pro','scale')),
  monthly_price_brl numeric(12,2) not null check (monthly_price_brl>0),
  included_credits numeric(18,6) not null check (included_credits>=0),
  resource_limits jsonb not null default '{}',
  features jsonb not null default '{}',
  effective_at timestamptz not null,
  first_period_end timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(organization_id,version),
  check (first_period_end>effective_at)
);
alter table public.organization_custom_contracts enable row level security;
revoke all on public.organization_custom_contracts from anon,authenticated;
grant select,insert on public.organization_custom_contracts to service_role;

create function public.save_custom_contract(p_organization uuid,p_actor uuid,p_terms jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c public.organization_custom_contracts; access jsonb; org uuid;
begin
  if not exists(select 1 from public.profiles where id=p_actor and is_platform_admin) then raise exception 'ADMIN_REQUIRED'; end if;
  access:=public.resolve_organization_contract_access(p_organization);
  org:=coalesce((access->>'billing_organization_id')::uuid,p_organization);
  perform 1 from public.organizations where id=org for update;
  if not found then raise exception 'ORGANIZATION_NOT_FOUND'; end if;
  insert into public.organization_custom_contracts(organization_id,version,name,base_plan_code,monthly_price_brl,included_credits,resource_limits,features,effective_at,first_period_end,created_by)
    values(org,(select coalesce(max(version),0)+1 from public.organization_custom_contracts where organization_id=org),p_terms->>'name',p_terms->>'base_plan_code',(p_terms->>'monthly_price_brl')::numeric,(p_terms->>'included_credits')::numeric,coalesce(p_terms->'resource_limits','{}'),coalesce(p_terms->'features','{}'),(p_terms->>'effective_at')::timestamptz,(p_terms->>'first_period_end')::timestamptz,p_actor) returning * into c;
  insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
    values('organization',org,'custom_contract',c.id,'billing.custom_contract_version_created','Condições personalizadas cadastradas','Nova versão registrada. Faturas emitidas e saldos permanecem preservados.','organization',array['billing','custom_contract'],to_jsonb(c));
  return to_jsonb(c);
end $$;

-- A snapshot travels with every newly issued invoice. Issued invoices are never
-- repriced when an administrator edits a future contract version.
create function public.stamp_custom_contract_payment() returns trigger
language plpgsql security definer set search_path=public as $$
declare c public.organization_custom_contracts; m jsonb; terms jsonb; base numeric; additions numeric; starts timestamptz; plan text;
begin
  m:=coalesce(new.payload,'{}');
  if coalesce(m->>'purchase_kind','plan')<>'plan' or new.subscription_id is null then return new; end if;
  plan:=coalesce(m->>'target_plan_code',m->>'requested_plan_code',(select plan_code from public.organization_subscriptions where id=new.subscription_id));
  starts:=coalesce((m->>'cycle_start_at')::timestamptz,now());
  select * into c from public.organization_custom_contracts where organization_id=new.organization_id and base_plan_code=plan and effective_at<=starts order by effective_at desc,version desc limit 1;
  if c.id is null then return new; end if;
  additions:=coalesce((select sum((b->>'price_brl')::numeric) from jsonb_array_elements(coalesce(m->'selected_bumps','[]')) b),0);
  base:=c.monthly_price_brl;
  terms:=jsonb_build_object('billing_cycle','recurring','billing_interval','month','access_duration_days',null,'price_brl',base,'list_price_brl',base,'annual_discount_percent',0,'first_purchase_discount_percent',0,'included_credits',c.included_credits,'custom_contract_id',c.id,'custom_contract_version',c.version,'name',c.name,'resource_limits',c.resource_limits,'features',c.features);
  new.amount_brl:=base+additions;
  new.payload:=(m-'campaign_pricing'-'campaign_selection'-'plan_pricing')||jsonb_build_object('commercial_terms',terms,'plan_amount_brl',base,'checkout_total_brl',base+additions,'cycle_start_at',starts,'cycle_end_at',case when m->>'checkout_kind'='initial' and c.first_period_end>starts then c.first_period_end else starts+interval '1 month' end);
  return new;
end $$;
create trigger stamp_custom_contract_payment before insert on public.billing_payments for each row execute function public.stamp_custom_contract_payment();
create function public.sync_custom_contract_invoice() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.payload#>>'{commercial_terms,custom_contract_id}' is not null then
    update public.billing_invoices set subtotal_brl=new.amount_brl,total_brl=new.amount_brl,metadata=new.payload where id=new.invoice_id;
    update public.billing_invoice_items set description=new.payload#>>'{commercial_terms,name}',unit_price_brl=(new.payload#>>'{commercial_terms,price_brl}')::numeric,total_brl=(new.payload#>>'{commercial_terms,price_brl}')::numeric,credit_amount=(new.payload#>>'{commercial_terms,included_credits}')::numeric where invoice_id=new.invoice_id and item_type='plan';
  end if;
  return new;
end $$;
create trigger sync_custom_contract_invoice after insert on public.billing_payments for each row execute function public.sync_custom_contract_invoice();

-- Do not stack public campaign prices over individually negotiated terms.
create function public.protect_custom_contract_terms() returns trigger language plpgsql set search_path=public as $$
begin
  if old.payload#>>'{commercial_terms,custom_contract_id}' is not null and
    (new.payload->'commercial_terms' is distinct from old.payload->'commercial_terms' or new.payload->'campaign_pricing' is distinct from old.payload->'campaign_pricing') then
    raise exception 'CUSTOM_CONTRACT_TERMS_IMMUTABLE';
  end if;
  return new;
end $$;
create trigger protect_custom_contract_terms before update on public.billing_payments for each row execute function public.protect_custom_contract_terms();

revoke all on function public.save_custom_contract(uuid,uuid,jsonb),public.stamp_custom_contract_payment(),public.sync_custom_contract_invoice(),public.protect_custom_contract_terms() from public,anon,authenticated;
grant execute on function public.save_custom_contract(uuid,uuid,jsonb) to service_role;

create or replace function public.prepare_contract_renewal(p_subscription uuid,p_expected_end timestamptz,p_start timestamptz,p_end timestamptz,p_provider text,p_metadata jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb; a public.commercial_agreements;
begin
 result:=public.prepare_contract_renewal_before_campaigns(p_subscription,p_expected_end,p_start,p_end,p_provider,p_metadata);
 if exists(select 1 from public.billing_payments where id=(result->>'payment_id')::uuid and payload#>>'{commercial_terms,custom_contract_id}' is not null) then return result; end if;
 select * into a from public.commercial_agreements where platform_subscription_id=p_subscription and state='active'
  and target_id=(select coalesce(metadata->>'purchase_product_id',plan_code) from public.organization_subscriptions where id=p_subscription) order by created_at desc limit 1;
 if a.id is not null and not exists(select 1 from public.commercial_agreement_periods where platform_payment_id=(result->>'payment_id')::uuid) then
  update public.billing_payments set payload=payload-'campaign_pricing'-'campaign_selection'-'plan_pricing' where id=(result->>'payment_id')::uuid;
  perform public.apply_platform_campaign_period(a.id,(result->>'payment_id')::uuid,a.paid_cycles);
 end if;
 return result;
end $$;

-- Legacy manual contracts may lack a price snapshot. A negotiated version supplies
-- the next invoice without rewriting their already paid subscription metadata.
create or replace function public.prepare_contract_renewal_before_campaigns(p_subscription uuid,p_expected_end timestamptz,p_start timestamptz,p_end timestamptz,p_provider text,p_metadata jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.organization_subscriptions; p public.billing_payments; inv uuid:=gen_random_uuid(); pay uuid:=gen_random_uuid();
  m jsonb; bumps jsonb; selected_item jsonb; amount numeric; base numeric; ref text;
begin
  perform 1 from public.organizations where id=(select organization_id from public.organization_subscriptions where id=p_subscription) for update;
  select * into s from public.organization_subscriptions where id=p_subscription for update;
  if not found or s.status not in ('active','past_due') or s.current_period_end is distinct from p_expected_end
    or s.metadata#>>'{commercial_terms,billing_cycle}'='one_time' or p_end<=p_start then raise exception 'BILLING_CYCLE_CHANGED'; end if;
  if s.provider_subscription_id like 'sub_%' then raise exception 'BILLING_PROVIDER_CYCLE_REQUIRED'; end if;
  select * into p from public.billing_payments where subscription_id=s.id and payload->>'checkout_kind'='renewal'
    and (payload->>'previous_current_period_end')::timestamptz=p_expected_end and status in ('pending','in_process','rejected') order by created_at desc limit 1;
  if found then return jsonb_build_object('invoice_id',p.invoice_id,'payment_id',p.id,'reused',true); end if;
  base:=coalesce((select c.monthly_price_brl from public.organization_custom_contracts c where c.organization_id=s.organization_id and c.base_plan_code=s.plan_code and c.effective_at<=p_start and s.subscription_kind='plan' order by c.effective_at desc,c.version desc limit 1),(s.metadata#>>'{commercial_terms,price_brl}')::numeric);
  if base is null or base<=0 then raise exception 'BILLING_PRICE_REVIEW_REQUIRED'; end if;
  select coalesce(jsonb_agg(b),'[]') into bumps from jsonb_array_elements(coalesce(s.metadata->'selected_bumps','[]')) b where b->>'recurrence' in ('weekly','monthly','quarterly','yearly');
  amount:=base+coalesce((select sum((b->>'price_brl')::numeric) from jsonb_array_elements(bumps) b),0);
  ref:='connectyhub_subscription:'||s.organization_id||':'||s.id||':'||inv||':'||pay;
  m:=coalesce(s.metadata,'{}')||p_metadata||jsonb_build_object('external_reference',ref,'subscription_id',s.id,'invoice_id',inv,'payment_id',pay,
    'commercial_terms',s.metadata->'commercial_terms','purchase_kind',s.subscription_kind,'purchase_product_id',s.metadata->'purchase_product_id',
    'selected_bumps',bumps,'selected_bump_codes',(select coalesce(jsonb_agg(b->>'code'),'[]') from jsonb_array_elements(bumps) b),
    'plan_amount_brl',base,'checkout_total_brl',amount,'checkout_kind','renewal','cycle_start_at',p_start,'cycle_end_at',p_end,'previous_current_period_end',p_expected_end);
  insert into public.billing_invoices(id,organization_id,subscription_id,status,subtotal_brl,total_brl,provider,metadata)
    values(inv,s.organization_id,s.id,'open',amount,amount,p_provider,m);
  insert into public.billing_invoice_items(invoice_id,organization_id,item_type,description,quantity,unit_price_brl,total_brl,metadata)
    values(inv,s.organization_id,'plan','Renovação ConnectyHub',1,base,base,jsonb_build_object('platform_product_id',m->'purchase_product_id','recurrence','recurring'));
  for selected_item in select * from jsonb_array_elements(bumps) loop
    insert into public.billing_invoice_items(invoice_id,organization_id,item_type,description,quantity,unit_price_brl,total_brl,credit_amount,metadata)
      values(inv,s.organization_id,coalesce(selected_item->>'item_type','adjustment'),selected_item->>'title',1,(selected_item->>'price_brl')::numeric,(selected_item->>'price_brl')::numeric,coalesce((selected_item->>'credit_amount')::numeric,0),
        jsonb_build_object('source','dashboard_plan_checkout_bump','platform_product_id',selected_item->'platform_product_id','recurrence',selected_item->'recurrence','bump',selected_item));
  end loop;
  insert into public.billing_payments(id,organization_id,subscription_id,invoice_id,status,provider,amount_brl,payload)
    values(pay,s.organization_id,s.id,inv,'pending',p_provider,amount,m);
  -- Keep the current contract immutable until this invoice is actually paid.
  update public.organization_subscriptions set metadata=metadata||jsonb_build_object('pending_checkout_invoice_id',inv,'pending_checkout_payment_id',pay),updated_at=now() where id=s.id;
  return jsonb_build_object('invoice_id',inv,'payment_id',pay,'reused',false);
end $$;
