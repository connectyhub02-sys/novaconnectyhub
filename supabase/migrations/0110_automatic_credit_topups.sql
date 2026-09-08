-- Existing credit packs can describe their franchise in the offer text. Use
-- the same parsing contract as the storefront until explicit metadata is set.
create function public.platform_product_credit_amount(p public.platform_products) returns numeric
language plpgsql immutable set search_path=public as $$
declare explicit text;description text;match text[];amount numeric;
begin
 explicit:=coalesce(p.metadata->>'billing_credit_amount',p.metadata->>'order_bump_credit_amount',p.metadata->>'credit_amount');
 if explicit ~ '^[0-9]+([.][0-9]+)?$' and explicit::numeric>0 then return explicit::numeric;end if;
 description:=translate(lower(p.name||' '||coalesce(p.short_description,p.commercial_description,'')),'áàâãéêíóôõúç','aaaaeeiooouc');
 if position('credito' in description)=0 then return 0;end if;
 match:=regexp_match(description,'([0-9]{1,3}([.[:space:]][0-9]{3})+|[0-9]+)[[:space:]]*(mil|k)?[[:space:]]*credit');
 if match is null then
  match:=regexp_match(description,'([0-9]+)[[:space:]]*(mil|k)');
  return coalesce(match[1]::numeric*1000,0);
 end if;
 amount:=regexp_replace(match[1],'[.[:space:]]','','g')::numeric;
 return case when match[3] is not null and amount<1000 then amount*1000 else amount end;
end $$;
revoke all on function public.platform_product_credit_amount(public.platform_products) from public,anon,authenticated;
grant execute on function public.platform_product_credit_amount(public.platform_products) to service_role;

create table public.credit_topup_policies(
 organization_id uuid primary key references public.organizations(id),
 enabled boolean not null default false,
 product_id uuid references public.platform_products(id),
 card_method_id uuid references public.billing_asaas_card_vault(id),
 threshold_credits numeric(18,6) not null default 0 check(threshold_credits>=0),
 agreed_amount_brl numeric(12,2) not null default 0,
 agreed_credits numeric(18,6) not null default 0,
 monthly_cap_brl numeric(12,2) not null default 0,
 authorized_by uuid references auth.users(id),
 consent_version text,
 authorized_at timestamptz,
 last_checked_at timestamptz,
 updated_at timestamptz not null default now()
);
create table public.credit_topup_runs(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 payment_id uuid not null unique references public.billing_payments(id),attempt_id uuid not null unique references public.billing_card_attempts(id),
 amount_brl numeric(12,2) not null,credits numeric(18,6) not null,policy_snapshot jsonb not null,
 created_at timestamptz not null default now()
);
create index credit_topup_runs_account_time on public.credit_topup_runs(organization_id,created_at desc);
alter table public.credit_topup_policies enable row level security;
alter table public.credit_topup_runs enable row level security;
revoke all on public.credit_topup_policies,public.credit_topup_runs from anon,authenticated;
grant all on public.credit_topup_policies,public.credit_topup_runs to service_role;

create function public.save_credit_topup_policy(p_org uuid,p_actor uuid,p_terms jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare o public.organizations;p public.platform_products;amount numeric;credits numeric;threshold numeric;cap numeric;enabled boolean;result public.credit_topup_policies;
begin
 select * into o from public.organizations where id=p_org and owner_id=p_actor for update;
 if o.id is null then raise exception 'TOPUP_OWNER_REQUIRED';end if;
 enabled:=coalesce((p_terms->>'enabled')::boolean,false);
 if not enabled then
  update public.credit_topup_policies set enabled=false,updated_at=now() where organization_id=p_org returning * into result;
 else
  if p_terms->>'consent_version' is distinct from 'credit_topup_v1' then raise exception 'TOPUP_CONSENT_REQUIRED';end if;
  if not coalesce((public.resolve_organization_contract_access(p_org)->>'allowed')::boolean,false) then raise exception 'TOPUP_CONTRACT_REQUIRED';end if;
  select * into p from public.platform_products where id=(p_terms->>'product_id')::uuid and owner_type='connectyhub' and sales_channel_type='direct' and status='active' and billing_cycle='one_time';
  amount:=public.checkout_money(coalesce(p.offer->>'sale_price',p.offer->>'salePrice',p.price::text));credits:=public.platform_product_credit_amount(p);
  threshold:=(p_terms->>'threshold_credits')::numeric;cap:=(p_terms->>'monthly_cap_brl')::numeric;
  if p.id is null or amount<=0 or credits<=0 or threshold<0 or threshold>=credits or cap<amount or cap>100000 then raise exception 'TOPUP_TERMS_INVALID';end if;
  if amount is distinct from (p_terms->>'amount_brl')::numeric or credits is distinct from (p_terms->>'credits')::numeric then raise exception 'TOPUP_PRICE_CHANGED';end if;
  if not exists(select 1 from public.billing_asaas_card_vault where id=(p_terms->>'card_method_id')::uuid and organization_id=p_org and status='active') then raise exception 'TOPUP_CARD_REQUIRED';end if;
  insert into public.credit_topup_policies(organization_id,enabled,product_id,card_method_id,threshold_credits,agreed_amount_brl,agreed_credits,monthly_cap_brl,authorized_by,consent_version,authorized_at)
  values(p_org,true,p.id,(p_terms->>'card_method_id')::uuid,threshold,amount,credits,cap,p_actor,'credit_topup_v1',now())
  on conflict(organization_id) do update set enabled=true,product_id=excluded.product_id,card_method_id=excluded.card_method_id,threshold_credits=excluded.threshold_credits,agreed_amount_brl=excluded.agreed_amount_brl,agreed_credits=excluded.agreed_credits,monthly_cap_brl=excluded.monthly_cap_brl,authorized_by=p_actor,consent_version='credit_topup_v1',authorized_at=now(),updated_at=now() returning * into result;
 end if;
 insert into public.platform_customer_journey(user_id,event_key,event_type,payload) values(p_actor,'topup_policy:'||gen_random_uuid(),'credit_topup_policy_changed',jsonb_build_object('organization_id',p_org,'enabled',enabled,'conditions',to_jsonb(result)-'authorized_by'));
 return to_jsonb(result);
end $$;

create function public.claim_credit_topup(p_org uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare policy public.credit_topup_policies;product public.platform_products;owner_user uuid;balance numeric;spent numeric;sub uuid;p public.billing_payments;attempt uuid:=gen_random_uuid();result jsonb;reference text;amount numeric;
begin
 select owner_id into owner_user from public.organizations where id=p_org for update;
 select * into policy from public.credit_topup_policies where organization_id=p_org for update;
 if policy.organization_id is null or not policy.enabled then return null;end if;
 if not coalesce((public.resolve_organization_contract_access(p_org)->>'allowed')::boolean,false) then return null;end if;
 select balance_credits into balance from public.credit_wallets where organization_id=p_org for update;
 if balance is null or balance>policy.threshold_credits then return null;end if;
 if not exists(select 1 from public.billing_asaas_card_vault where id=policy.card_method_id and organization_id=p_org and status='active') then return null;end if;
 if exists(select 1 from public.credit_topup_runs r join public.billing_card_attempts a on a.id=r.attempt_id where r.organization_id=p_org and (a.state in ('processing','unknown','pending') or r.created_at>now()-interval '1 hour')) then return null;end if;
 select coalesce(sum(r.amount_brl),0) into spent from public.credit_topup_runs r join public.billing_card_attempts a on a.id=r.attempt_id where r.organization_id=p_org and r.created_at>=date_trunc('month',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' and a.state not in ('rejected','error','cancelled');
 if spent+policy.agreed_amount_brl>policy.monthly_cap_brl then return null;end if;
 select * into product from public.platform_products where id=policy.product_id and status='active' and owner_type='connectyhub' and sales_channel_type='direct' and billing_cycle='one_time';
 amount:=public.checkout_money(coalesce(product.offer->>'sale_price',product.offer->>'salePrice',product.price::text));
 if product.id is null or amount is distinct from policy.agreed_amount_brl or public.platform_product_credit_amount(product)<>policy.agreed_credits then
  update public.credit_topup_policies set enabled=false,updated_at=now() where organization_id=p_org;
  insert into public.platform_customer_journey(user_id,event_key,event_type,payload) values(owner_user,'topup_offer_changed:'||gen_random_uuid(),'credit_topup_reauthorization_required',jsonb_build_object('organization_id',p_org));
  return null;
 end if;
 -- A pending manual checkout is never silently converted into an automatic charge.
 if exists(select 1 from public.organization_subscriptions where organization_id=p_org and subscription_kind='product' and plan_code='product_'||product.id and status in ('pending','incomplete')) then return null;end if;
 sub:=public.create_product_purchase_intent(p_org,owner_user,product.id,amount,jsonb_build_object('billing_cycle','one_time','billing_interval',product.billing_interval,'price_brl',amount,'included_credits',policy.agreed_credits,'access_duration_days',null));
 select * into p from public.billing_payments where subscription_id=sub order by created_at desc limit 1;
 reference:='billing_topup:'||p.id;
 result:=public.claim_native_billing_card(p_org,p.id,attempt,p.checkout_revision,amount,0,reference);
 if not coalesce((result->>'claimed')::boolean,false) then raise exception 'TOPUP_CLAIM_FAILED';end if;
 update public.billing_payments set payload=payload||jsonb_build_object('automatic_topup',true,'topup_policy',to_jsonb(policy),'managed_external_reference',reference) where id=p.id;
 insert into public.credit_topup_runs(organization_id,payment_id,attempt_id,amount_brl,credits,policy_snapshot) values(p_org,p.id,attempt,amount,policy.agreed_credits,to_jsonb(policy));
 insert into public.platform_customer_journey(user_id,event_key,event_type,source_id,payload) values(owner_user,'topup_attempt:'||attempt,'credit_topup_started',p.id,jsonb_build_object('amount_brl',amount,'credits',policy.agreed_credits,'subscription_id',sub));
 return result||jsonb_build_object('method_id',policy.card_method_id);
end $$;
revoke all on function public.save_credit_topup_policy(uuid,uuid,jsonb),public.claim_credit_topup(uuid) from public,anon,authenticated;
grant execute on function public.save_credit_topup_policy(uuid,uuid,jsonb),public.claim_credit_topup(uuid) to service_role;
