-- Tenant-owned campaigns. Financial APIs use service-only functions; browsers cannot set prices.
create table public.commercial_campaigns (
 id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id),
 owner_type text not null check(owner_type in ('platform','store')), revision integer not null default 1,
 configuration jsonb not null, created_by uuid references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((owner_type='platform' and organization_id is null) or (owner_type='store' and organization_id is not null))
);
create table public.commercial_campaign_versions (
 campaign_id uuid references public.commercial_campaigns(id), revision integer not null, configuration jsonb not null,
 actor_id uuid, created_at timestamptz not null default now(), primary key(campaign_id,revision)
);
create table public.commercial_agreements (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 owner_type text not null check(owner_type in ('platform','store')), buyer_key text not null,
 lead_id uuid references public.leads(id), buyer_user_id uuid references auth.users(id),
 campaign_id uuid references public.commercial_campaigns(id), campaign_revision integer,
 configuration jsonb not null, option_id text not null, target_id text not null,
 platform_subscription_id uuid references public.organization_subscriptions(id), origin_order_id uuid references public.sales_catalog_orders(id),
 state text not null default 'reserved' check(state in ('reserved','active','past_due','cancelled','ended')),
 paid_cycles integer not null default 0 check(paid_cycles>=0), consumed_at timestamptz,
 last_renewal_checked_at timestamptz, period_start timestamptz, period_end timestamptz, cancel_at_period_end boolean not null default false,
 reservation_expires_at timestamptz not null default (now()+interval '24 hours'),
 metadata jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index commercial_store_origin on public.commercial_agreements(origin_order_id);
create index commercial_agreement_buyer on public.commercial_agreements(campaign_id,buyer_key);
create index commercial_agreement_platform on public.commercial_agreements(platform_subscription_id,state);
create table public.commercial_agreement_periods (
 id uuid primary key default gen_random_uuid(), agreement_id uuid not null references public.commercial_agreements(id),
 cycle integer not null check(cycle>=0), platform_payment_id uuid unique references public.billing_payments(id),
 order_id uuid unique references public.sales_catalog_orders(id), pricing jsonb not null,
 paid_at timestamptz, created_at timestamptz not null default now(), unique(agreement_id,cycle),
 check(num_nonnulls(platform_payment_id,order_id)=1)
);
create table public.commercial_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 buyer_user_id uuid references auth.users(id), lead_id uuid references public.leads(id),
 campaign_id uuid references public.commercial_campaigns(id), agreement_id uuid references public.commercial_agreements(id),
 event_key text not null unique, event_type text not null, payload jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.commercial_card_vault (
 id uuid primary key default gen_random_uuid(), agreement_id uuid not null references public.commercial_agreements(id),
 organization_id uuid not null references public.organizations(id), activation_attempt_id uuid not null unique,
 customer_id text not null, token_encrypted text not null, connection_fingerprint text not null,
 consent_version text not null, status text not null default 'pending' check(status in ('pending','active','revoked')),
 created_at timestamptz not null default now()
);
create unique index commercial_card_active on public.commercial_card_vault(agreement_id) where status='active';
do $$ declare t text; begin
 foreach t in array array['commercial_campaigns','commercial_campaign_versions','commercial_agreements','commercial_agreement_periods','commercial_events','commercial_card_vault'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create or replace function public.version_commercial_campaign() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' then
  if new.organization_id is distinct from old.organization_id or new.owner_type<>old.owner_type then raise exception 'CAMPAIGN_OWNER_FIXED'; end if;
  new.revision:=old.revision+1; new.updated_at:=now();
 end if;
 return new;
end $$;
create trigger version_commercial_campaign before update on public.commercial_campaigns for each row execute function public.version_commercial_campaign();
create or replace function public.archive_commercial_campaign() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.commercial_campaign_versions(campaign_id,revision,configuration,actor_id) values(new.id,new.revision,new.configuration,new.created_by);
 return new;
end $$;
create trigger archive_commercial_campaign after insert or update on public.commercial_campaigns for each row execute function public.archive_commercial_campaign();

-- The server and PostgreSQL calculate the same cent-rounded price for each billed period.
create or replace function public.commercial_program_price(p_config jsonb,p_option text,p_cycle integer) returns jsonb
language plpgsql immutable set search_path=public as $$
declare o jsonb; st jsonb; total_cycles integer:=0; base numeric; regular numeric; amount numeric; next_amount numeric; j integer;
begin
 if p_cycle<0 then raise exception 'CAMPAIGN_CYCLE_INVALID'; end if;
 select value into o from jsonb_array_elements(p_config->'options') where value->>'id'=p_option;
 if o is null then raise exception 'CAMPAIGN_OPTION_INVALID'; end if;
 base:=round((o->>'price')::numeric*100); regular:=base-round(base*coalesce((o->>'permanentDiscount')::numeric,0)/100);
 for j in p_cycle..p_cycle+1 loop
  amount:=regular; total_cycles:=0;
  for st in select value from jsonb_array_elements(p_config->'stages') loop
   total_cycles:=total_cycles+(st->>'cycles')::integer;
   if j<total_cycles then
    amount:=least(regular,case when st->>'kind'='price' then round((st->>'value')::numeric*100) else base-round(base*(st->>'value')::numeric/100) end); exit;
   end if;
  end loop;
  if amount<=0 or amount>base then raise exception 'CAMPAIGN_AMOUNT_INVALID'; end if;
  if j=p_cycle then next_amount:=amount; end if;
 end loop;
 select coalesce(sum((value->>'cycles')::integer),0) into total_cycles from jsonb_array_elements(p_config->'stages');
 return jsonb_build_object('version',1,'name',p_config->>'name','option_id',p_option,'interval',o->>'interval','cycle',p_cycle,
  'list_price_brl',base/100,'price_brl',next_amount/100,'next_price_brl',amount/100,'renewal_price_brl',regular/100,
  'discount_brl',(base-next_amount)/100,'remaining_cycles',greatest(0,total_cycles-p_cycle-1),'stages',p_config->'stages');
end $$;

create or replace function public.archive_commercial_event() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.buyer_user_id is not null then
  insert into public.platform_customer_journey(user_id,event_key,event_type,source_id,payload)
   values(new.buyer_user_id,'commercial:'||new.event_key,new.event_type,new.id,new.payload) on conflict(event_key) do nothing;
 elsif new.lead_id is not null then
  insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
   values('organization',new.organization_id,'lead',new.lead_id,'commerce.'||new.event_type,'Condição comercial do lead',
    coalesce(new.payload->>'notice','Campanha e condições de cobrança registradas.'),'organization',array['lead','commerce','campaign'],
    new.payload||jsonb_build_object('lead_id',new.lead_id,'campaign_id',new.campaign_id,'agreement_id',new.agreement_id));
 end if;
 return new;
end $$;
create trigger archive_commercial_event after insert on public.commercial_events for each row execute function public.archive_commercial_event();

-- Serialize campaign adoption per buyer and re-check scope/window/limits inside the transaction.
create or replace function public.reserve_commercial_agreement(p_campaign uuid,p_revision integer,p_org uuid,p_buyer text,p_user uuid,p_lead uuid,
 p_target text,p_option text,p_subscription uuid,p_order uuid,p_operation text,p_previous boolean,p_inactive boolean,p_origin text) returns uuid
language plpgsql security definer set search_path=public as $$
declare c public.commercial_campaigns; cfg jsonb; a public.commercial_agreements; aid uuid; n integer;
begin
 select * into c from public.commercial_campaigns where id=p_campaign for share;
 if not found or c.revision<>p_revision or (c.owner_type='store' and c.organization_id<>p_org) then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
 cfg:=c.configuration;
 if c.owner_type='platform' then
  if p_user is null or p_buyer<>p_user::text or not exists(select 1 from public.organizations where id=p_org and owner_id=p_user)
    or not exists(select 1 from public.organization_subscriptions where id=p_subscription and organization_id=p_org) then raise exception 'CAMPAIGN_BUYER_INVALID'; end if;
 else
  if p_lead is null or p_user is not null or p_buyer is distinct from p_lead::text or not exists(select 1 from public.leads where id=p_lead and organization_id=p_org)
    or not exists(select 1 from public.sales_catalog_orders where id=p_order and organization_id=p_org and lead_id=p_lead) then raise exception 'CAMPAIGN_BUYER_INVALID'; end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('campaign:'||c.id||':'||p_buyer,0));
 select * into a from public.commercial_agreements where campaign_id=c.id and buyer_key=p_buyer
  and ((p_order is not null and origin_order_id=p_order) or (p_subscription is not null and platform_subscription_id=p_subscription and state='reserved')) order by created_at desc limit 1 for update;
 if found then
  if a.option_id<>p_option or a.target_id<>p_target then raise exception 'CAMPAIGN_CHECKOUT_ALREADY_RESERVED'; end if;
  return a.id;
 end if;
 if cfg->>'status'<>'active' or now()<(cfg->>'startsAt')::timestamptz or now()>=(cfg->>'endsAt')::timestamptz
  or not (cfg->'targetIds' ? p_target) or not (cfg->'operations' ? p_operation)
  or (jsonb_array_length(cfg->'originIds')>0 and not(cfg->'originIds' ? coalesce(p_origin,''))) then raise exception 'CAMPAIGN_NOT_ELIGIBLE'; end if;
 if (cfg->>'audience'='new' and p_previous) or (cfg->>'audience'='existing' and not p_previous) or (cfg->>'audience'='inactive' and not p_inactive)
   or (cfg->>'audience'='selected' and not(cfg->'buyerIds' ? coalesce(p_user::text,p_lead::text))) then raise exception 'CAMPAIGN_NOT_ELIGIBLE'; end if;
 select count(*) into n from public.commercial_agreements where campaign_id=c.id and buyer_key=p_buyer
   and (consumed_at is not null or state='reserved' and reservation_expires_at>now());
 if n>=coalesce((cfg->>'maxUses')::integer,1) then raise exception 'CAMPAIGN_LIMIT_REACHED'; end if;
 perform public.commercial_program_price(cfg,p_option,0);
 if p_order is not null then
  select * into a from public.commercial_agreements where origin_order_id=p_order for update;
  if found then
   if a.campaign_id is not null or a.consumed_at is not null or a.state<>'reserved' then raise exception 'CAMPAIGN_CHECKOUT_ALREADY_RESERVED'; end if;
   update public.commercial_agreements set campaign_id=c.id,campaign_revision=c.revision,configuration=cfg,option_id=p_option,target_id=p_target,
    reservation_expires_at=least(now()+interval '24 hours',(cfg->>'endsAt')::timestamptz) where id=a.id;
   return a.id;
  end if;
 end if;
 insert into public.commercial_agreements(organization_id,owner_type,buyer_key,buyer_user_id,lead_id,campaign_id,campaign_revision,configuration,option_id,target_id,platform_subscription_id,origin_order_id,reservation_expires_at)
  values(p_org,c.owner_type,p_buyer,p_user,p_lead,c.id,c.revision,cfg,p_option,p_target,p_subscription,p_order,least(now()+interval '24 hours',(cfg->>'endsAt')::timestamptz)) returning id into aid;
 return aid;
end $$;

create or replace function public.apply_platform_campaign_period(p_agreement uuid,p_payment uuid,p_cycle integer) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a public.commercial_agreements; p public.billing_payments; pricing jsonb; terms jsonb; extras numeric; total numeric;
begin
 perform 1 from public.organizations where id=(select organization_id from public.commercial_agreements where id=p_agreement) for update;
 perform 1 from public.organization_subscriptions where id=(select platform_subscription_id from public.commercial_agreements where id=p_agreement) for update;
 select * into a from public.commercial_agreements where id=p_agreement for update;
 if not found or a.owner_type<>'platform' or a.state in ('cancelled','ended') then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
 perform 1 from public.organization_subscriptions where id=a.platform_subscription_id for update;
 select * into p from public.billing_payments where id=p_payment and organization_id=a.organization_id and subscription_id=a.platform_subscription_id for update;
 if not found then raise exception 'CAMPAIGN_PAYMENT_NOT_FOUND'; end if;
 if exists(select 1 from public.commercial_agreement_periods where platform_payment_id=p.id) then
  if not exists(select 1 from public.commercial_agreement_periods where platform_payment_id=p.id and agreement_id=a.id and cycle=p_cycle) then raise exception 'CAMPAIGN_PAYMENT_ALREADY_BOUND'; end if;
  return p.payload->'campaign_pricing'; end if;
 if p_cycle<>a.paid_cycles or (a.state='reserved' and now()>a.reservation_expires_at) then raise exception 'CAMPAIGN_PERIOD_INVALID'; end if;
 if p.status not in ('pending','rejected') or p.provider_payment_id is not null or p.payload->>'pix_creation_pending'='true'
   or exists(select 1 from public.billing_card_attempts where payment_id=p.id) then raise exception 'CAMPAIGN_PAYMENT_BUSY'; end if;
 pricing:=public.commercial_program_price(a.configuration,a.option_id,p_cycle)||jsonb_build_object('campaign_id',a.campaign_id,'campaign_revision',a.campaign_revision,'agreement_id',a.id,'recurring',true);
 if p.payload#>>'{commercial_terms,billing_cycle}'='one_time' then pricing:=pricing||jsonb_build_object('recurring',false,'next_price_brl',0,'remaining_cycles',0); end if;
 terms:=coalesce(p.payload->'commercial_terms','{}')||jsonb_build_object('billing_interval',pricing->>'interval','price_brl',pricing->'renewal_price_brl','list_price_brl',pricing->'list_price_brl');
 extras:=coalesce((select sum(total_brl) from public.billing_invoice_items where invoice_id=p.invoice_id and item_type<>'plan'),0);
 total:=(pricing->>'price_brl')::numeric+extras;
 insert into public.commercial_agreement_periods(agreement_id,cycle,platform_payment_id,pricing) values(a.id,p_cycle,p.id,pricing);
 update public.billing_invoice_items set unit_price_brl=(pricing->>'list_price_brl')::numeric,total_brl=(pricing->>'list_price_brl')::numeric where invoice_id=p.invoice_id and item_type='plan';
 update public.billing_invoices set subtotal_brl=(pricing->>'list_price_brl')::numeric+extras,discount_brl=(pricing->>'discount_brl')::numeric,total_brl=total,
  metadata=coalesce(metadata,'{}')||jsonb_build_object('campaign_pricing',pricing,'commercial_terms',terms) where id=p.invoice_id;
 update public.billing_payments set amount_brl=total,checkout_revision=checkout_revision+1,payload=(case when p_cycle>0 and payload->>'campaign_requires_authorization'='true' then payload-'auto_charge_disabled'-'campaign_requires_authorization' else coalesce(payload,'{}') end)||jsonb_build_object('campaign_pricing',pricing,'commercial_terms',terms,'plan_amount_brl',pricing->'price_brl','checkout_total_brl',total)||case when p_cycle=0 then jsonb_build_object('auto_charge_disabled',true,'campaign_requires_authorization',true) else '{}'::jsonb end where id=p.id;
 insert into public.commercial_events(organization_id,buyer_user_id,campaign_id,agreement_id,event_key,event_type,payload)
  values(a.organization_id,a.buyer_user_id,a.campaign_id,a.id,'period:'||p.id,'campaign_applied',pricing) on conflict(event_key) do nothing;
 return pricing;
end $$;

create or replace function public.confirm_commercial_period() returns trigger language plpgsql security definer set search_path=public as $$
declare period public.commercial_agreement_periods; a public.commercial_agreements;
begin
 if tg_table_name='billing_payments' then
  if new.status::text<>'approved' or old.status::text='approved' then return new; end if;
  select * into period from public.commercial_agreement_periods where platform_payment_id=new.id for update;
 else
  if new.payment_status::text<>'confirmed' or old.payment_status::text='confirmed' then return new; end if;
  select * into period from public.commercial_agreement_periods where order_id=new.id for update;
 end if;
 if period.id is null or period.paid_at is not null then return new; end if;
 update public.commercial_agreement_periods set paid_at=now() where id=period.id;
 update public.commercial_agreements set paid_cycles=greatest(paid_cycles,period.cycle+1),consumed_at=coalesce(consumed_at,now()),state=case when cancel_at_period_end then 'cancelled' else 'active' end,updated_at=now()
  where id=period.agreement_id returning * into a;
 if a.owner_type='platform' and period.cycle=0 and not exists(select 1 from public.billing_asaas_card_vault v join public.billing_card_attempts ca on ca.id=v.activation_attempt_id where v.subscription_id=a.platform_subscription_id and ca.payment_id=period.platform_payment_id and ca.state='approved' and v.status='active') then
  update public.billing_asaas_card_vault set status='inactive' where subscription_id=a.platform_subscription_id and status='active';
 end if;
 if period.pricing->>'recurring'='false' then update public.commercial_agreements set state='ended' where id=a.id; end if;
 insert into public.commercial_events(organization_id,buyer_user_id,lead_id,campaign_id,agreement_id,event_key,event_type,payload)
  values(a.organization_id,a.buyer_user_id,a.lead_id,a.campaign_id,a.id,'paid:'||period.id,'campaign_payment_confirmed',period.pricing) on conflict(event_key) do nothing;
 if a.campaign_id is not null and period.pricing->>'recurring'='true'
  and a.paid_cycles=(select coalesce(sum((stage->>'cycles')::integer),0) from jsonb_array_elements(a.configuration->'stages') stage) then
  insert into public.commercial_events(organization_id,buyer_user_id,lead_id,campaign_id,agreement_id,event_key,event_type,payload)
  values(a.organization_id,a.buyer_user_id,a.lead_id,a.campaign_id,a.id,'benefit-complete:'||a.id,'campaign_benefit_completed',
   public.commercial_program_price(a.configuration,a.option_id,a.paid_cycles)||jsonb_build_object('notice','Último período promocional confirmado. A próxima renovação segue o preço regular contratado.')) on conflict(event_key) do nothing;
 end if;
 return new;
end $$;
create trigger confirm_platform_commercial_period after update of status on public.billing_payments for each row execute function public.confirm_commercial_period();
create trigger confirm_store_commercial_period after update of payment_status on public.sales_catalog_orders for each row execute function public.confirm_commercial_period();

do $$ declare f record; begin
 for f in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname in ('version_commercial_campaign','archive_commercial_campaign','commercial_program_price','archive_commercial_event','reserve_commercial_agreement','apply_platform_campaign_period','confirm_commercial_period') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);
  execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
