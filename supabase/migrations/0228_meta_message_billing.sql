-- Official WhatsApp (Meta Cloud API) message billing.
-- A BRL wallet, fully separate from AI credits (credit_wallets). Only numbers whose
-- WhatsApp account is billed through the ConnectyHub credit line are charged here:
-- every message Meta charges costs the customer twice the Meta rate; what Meta does
-- not charge is free. Charging happens once, on delivery, from Meta's pricing data.

-- Who pays Meta for each sender. Default: the customer's own payment method at Meta.
alter table public.meta_whatsapp_connections
  add column billing_mode text not null default 'customer_meta'
    check (billing_mode in ('customer_meta','connectyhub_credit_line')),
  add column billing_mode_changed_at timestamptz,
  add column billing_mode_changed_by uuid references auth.users(id);

-- Recipient market by country calling code (longest prefix wins).
create table public.meta_message_markets (
  prefix text primary key check (prefix ~ '^[1-9][0-9]{0,3}$'),
  market text not null check (market ~ '^[A-Z]{2}$'),
  label text not null
);
insert into public.meta_message_markets(prefix,market,label) values ('55','BR','Brasil');

-- Meta rate card per market/category with history. customer_price = cost x multiplier.
create table public.meta_message_rates (
  id uuid primary key default gen_random_uuid(),
  market text not null check (market ~ '^[A-Z]{2}$'),
  category text not null check (category in ('marketing','marketing_lite','utility','authentication','authentication-international','service')),
  provider_cost_brl numeric(12,6) not null check (provider_cost_brl >= 0),
  multiplier numeric(6,3) not null default 2 check (multiplier >= 1),
  customer_price_brl numeric(12,4) generated always as (round(provider_cost_brl * multiplier, 4)) stored,
  effective_from timestamptz not null,
  effective_to timestamptz,
  source text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from),
  unique (market, category, effective_from)
);
-- Brazil, BRL rate card in force since 01/10/2026 (Meta: marketing R$ 0,3217;
-- utility/authentication/service R$ 0,035). Confirm against the official card.
insert into public.meta_message_rates(market,category,provider_cost_brl,multiplier,effective_from,source) values
 ('BR','marketing',0.3217,2,'2026-10-01T03:00:00Z','Tabela Meta BRL de 01/10/2026'),
 ('BR','utility',0.035,2,'2026-10-01T03:00:00Z','Tabela Meta BRL de 01/10/2026'),
 ('BR','authentication',0.035,2,'2026-10-01T03:00:00Z','Tabela Meta BRL de 01/10/2026'),
 ('BR','service',0.035,2,'2026-10-01T03:00:00Z','Tabela Meta BRL de 01/10/2026');

-- One wallet per responsible billing organization, in BRL.
create table public.meta_message_wallets (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  balance_brl numeric(14,4) not null default 0 check (balance_brl >= 0),
  reserved_brl numeric(14,4) not null default 0 check (reserved_brl >= 0),
  debt_brl numeric(14,4) not null default 0 check (debt_brl >= 0),
  lifetime_topup_brl numeric(14,4) not null default 0,
  lifetime_charged_brl numeric(14,4) not null default 0,
  updated_at timestamptz not null default now(),
  check (reserved_brl <= balance_brl)
);

-- Money movements. Reservations are not movements; they appear as reserved_brl.
create table public.meta_message_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_organization_id uuid not null references public.organizations(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  entry_type text not null check (entry_type in ('topup','charge','debt','adjustment')),
  amount_brl numeric(14,4) not null check (amount_brl <> 0),
  balance_after_brl numeric(14,4) not null,
  debt_after_brl numeric(14,4) not null,
  charge_id uuid,
  external_reference text not null unique,
  description text not null,
  metadata jsonb not null default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index meta_message_ledger_wallet on public.meta_message_ledger(wallet_organization_id, created_at desc);

-- One row per billable send. Reserved before the Meta call, settled once.
create table public.meta_message_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  wallet_organization_id uuid not null references public.organizations(id) on delete cascade,
  phone_number_id text not null,
  request_key uuid not null,
  message_id uuid unique references public.meta_whatsapp_messages(id) on delete set null,
  campaign_id uuid references public.meta_whatsapp_campaigns(id) on delete set null,
  market text not null,
  expected_category text not null,
  reserved_brl numeric(12,4) not null check (reserved_brl >= 0),
  pricing_category text,
  pricing_type text,
  pricing_model text,
  delivered_at timestamptz,
  rate_id uuid references public.meta_message_rates(id),
  provider_cost_brl numeric(12,6),
  customer_price_brl numeric(12,4),
  charged_brl numeric(12,4),
  shortfall_brl numeric(12,4) not null default 0,
  status text not null default 'reserved' check (status in ('reserved','charged','free','released','rate_missing')),
  status_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (organization_id, request_key)
);
create index meta_message_charges_open on public.meta_message_charges(status, created_at) where status in ('reserved','rate_missing');
create index meta_message_charges_wallet on public.meta_message_charges(wallet_organization_id, created_at desc);

do $$ declare t text; begin
 foreach t in array array['meta_message_markets','meta_message_rates','meta_message_wallets','meta_message_ledger','meta_message_charges'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create function public.meta_message_wallet_owner(p_org uuid) returns uuid
language sql security definer set search_path=public stable as $$
 select coalesce(nullif(public.resolve_organization_contract_access(p_org)->>'billing_organization_id','')::uuid, p_org);
$$;

create function public.meta_message_market(p_phone text) returns text
language sql security definer set search_path=public stable as $$
 select market from meta_message_markets where regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') like prefix||'%' order by length(prefix) desc limit 1;
$$;

create function public.meta_message_rate(p_market text, p_category text, p_at timestamptz default now()) returns public.meta_message_rates
language sql security definer set search_path=public stable as $$
 select * from meta_message_rates where market=p_market and category=p_category and effective_from<=p_at and (effective_to is null or effective_to>p_at)
 order by effective_from desc limit 1;
$$;

create function public.meta_message_category(p_value text) returns text
language sql immutable set search_path=public as $$
 select case lower(coalesce(p_value,'')) when 'marketing' then 'marketing' when 'marketing_lite' then 'marketing_lite' when 'utility' then 'utility'
  when 'authentication' then 'authentication' when 'authentication-international' then 'authentication-international' when 'authentication_international' then 'authentication-international'
  when 'service' then 'service' else null end;
$$;

-- Reserve the price of the expected category before sending. Idempotent per request key.
-- Raises META_MESSAGE_RATE_MISSING / META_MESSAGE_DEBT / META_MESSAGE_BALANCE_INSUFFICIENT.
create function public.reserve_meta_message_charge(p_org uuid, p_phone_number_id text, p_request_key uuid, p_phone text, p_category text, p_campaign uuid default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare conn meta_whatsapp_connections; owner uuid; existing meta_message_charges; mkt text; cat text; rate meta_message_rates; w meta_message_wallets; charge uuid;
begin
 select * into conn from meta_whatsapp_connections where organization_id=p_org and phone_number_id=p_phone_number_id;
 if conn.phone_number_id is null then raise exception 'META_MESSAGE_SENDER_NOT_FOUND'; end if;
 if conn.billing_mode<>'connectyhub_credit_line' then return jsonb_build_object('billing','customer_meta'); end if;
 select * into existing from meta_message_charges where organization_id=p_org and request_key=p_request_key;
 if existing.id is not null then return jsonb_build_object('billing','connectyhub','charge_id',existing.id,'reserved_brl',existing.reserved_brl,'existing',true); end if;
 cat:=coalesce(public.meta_message_category(p_category),'service');
 mkt:=public.meta_message_market(p_phone);
 if mkt is null then raise exception 'META_MESSAGE_RATE_MISSING'; end if;
 rate:=public.meta_message_rate(mkt,cat);
 if rate.id is null then raise exception 'META_MESSAGE_RATE_MISSING'; end if;
 owner:=public.meta_message_wallet_owner(p_org);
 insert into meta_message_wallets(organization_id) values(owner) on conflict do nothing;
 select * into w from meta_message_wallets where organization_id=owner for update;
 if w.debt_brl>0 then raise exception 'META_MESSAGE_DEBT'; end if;
 if w.balance_brl-w.reserved_brl<rate.customer_price_brl then raise exception 'META_MESSAGE_BALANCE_INSUFFICIENT'; end if;
 update meta_message_wallets set reserved_brl=reserved_brl+rate.customer_price_brl,updated_at=now() where organization_id=owner;
 insert into meta_message_charges(organization_id,wallet_organization_id,phone_number_id,request_key,campaign_id,market,expected_category,reserved_brl)
 values(p_org,owner,p_phone_number_id,p_request_key,p_campaign,mkt,cat,rate.customer_price_brl) returning id into charge;
 return jsonb_build_object('billing','connectyhub','charge_id',charge,'reserved_brl',rate.customer_price_brl,'available_brl',w.balance_brl-w.reserved_brl-rate.customer_price_brl);
end $$;

create function public.link_meta_message_charge(p_org uuid, p_request_key uuid, p_message uuid) returns void
language sql security definer set search_path=public as $$
 update meta_message_charges set message_id=p_message,updated_at=now() where organization_id=p_org and request_key=p_request_key and message_id is null;
$$;

-- Return the reservation of an unsent/undelivered message. Never touches a settled charge.
create function public.release_meta_message_charge(p_org uuid, p_request_key uuid, p_detail text) returns void
language plpgsql security definer set search_path=public as $$
declare c meta_message_charges;
begin
 select * into c from meta_message_charges where organization_id=p_org and request_key=p_request_key for update;
 if c.id is null or c.status not in ('reserved','rate_missing') then return; end if;
 update meta_message_wallets set reserved_brl=greatest(0,reserved_brl-c.reserved_brl),updated_at=now() where organization_id=c.wallet_organization_id;
 update meta_message_charges set status='released',status_detail=left(p_detail,300),settled_at=now(),updated_at=now() where id=c.id;
end $$;

-- Settle a reserved charge once Meta reported delivery and pricing.
create function public.settle_meta_message_charge(p_charge uuid) returns text
language plpgsql security definer set search_path=public as $$
declare c meta_message_charges; w meta_message_wallets; rate meta_message_rates; price numeric; payable numeric; shortfall numeric; others numeric;
begin
 select * into c from meta_message_charges where id=p_charge for update;
 if c.id is null or c.status not in ('reserved','rate_missing') or c.delivered_at is null or c.pricing_type is null then return coalesce(c.status,'missing'); end if;
 select * into w from meta_message_wallets where organization_id=c.wallet_organization_id for update;
 if c.pricing_type<>'regular' then
  update meta_message_wallets set reserved_brl=greatest(0,reserved_brl-c.reserved_brl),updated_at=now() where organization_id=w.organization_id;
  update meta_message_charges set status='free',charged_brl=0,settled_at=now(),updated_at=now() where id=c.id;
  return 'free';
 end if;
 rate:=public.meta_message_rate(c.market,coalesce(c.pricing_category,c.expected_category),c.delivered_at);
 if rate.id is null then
  update meta_message_charges set status='rate_missing',status_detail='Categoria cobrada pela Meta sem tarifa cadastrada.',updated_at=now() where id=c.id;
  return 'rate_missing';
 end if;
 price:=rate.customer_price_brl;
 others:=greatest(0,w.reserved_brl-c.reserved_brl);
 payable:=least(price,greatest(0,w.balance_brl-others));
 shortfall:=price-payable;
 update meta_message_wallets set reserved_brl=others,balance_brl=balance_brl-payable,debt_brl=debt_brl+shortfall,
  lifetime_charged_brl=lifetime_charged_brl+price,updated_at=now() where organization_id=w.organization_id returning * into w;
 if payable>0 then
  insert into meta_message_ledger(wallet_organization_id,organization_id,entry_type,amount_brl,balance_after_brl,debt_after_brl,charge_id,external_reference,description,metadata)
  values(w.organization_id,c.organization_id,'charge',-payable,w.balance_brl,w.debt_brl,c.id,'meta_charge:'||c.id,'Mensagem WhatsApp oficial entregue ('||rate.category||')',
   jsonb_build_object('category',rate.category,'market',c.market,'provider_cost_brl',rate.provider_cost_brl,'multiplier',rate.multiplier));
 end if;
 if shortfall>0 then
  insert into meta_message_ledger(wallet_organization_id,organization_id,entry_type,amount_brl,balance_after_brl,debt_after_brl,charge_id,external_reference,description)
  values(w.organization_id,c.organization_id,'debt',-shortfall,w.balance_brl,w.debt_brl,c.id,'meta_debt:'||c.id,'Diferença de categoria acima do saldo disponível');
 end if;
 update meta_message_charges set status='charged',rate_id=rate.id,provider_cost_brl=rate.provider_cost_brl,customer_price_brl=price,charged_brl=price,shortfall_brl=shortfall,
  settled_at=now(),updated_at=now() where id=c.id;
 return 'charged';
end $$;

-- Receipts keep Meta's pricing object so a charge can be reconciled whatever the order
-- in which the send response and the status webhooks arrive.
alter table public.meta_whatsapp_receipts add column pricing jsonb;

-- Reconciles the charge of a message from its receipts; called by every status webhook
-- and after the send is accepted. Idempotent.
create function public.record_meta_message_pricing(p_phone_number_id text, p_provider_message_id text) returns text
language plpgsql security definer set search_path=public as $$
declare msg uuid; c meta_message_charges; pr jsonb; ptype text; pcat text; delivered timestamptz; failed boolean;
begin
 select id into msg from meta_whatsapp_messages where phone_number_id=p_phone_number_id and provider_message_id=p_provider_message_id and direction='outbound';
 if msg is null then return 'not_found'; end if;
 select * into c from meta_message_charges where message_id=msg for update;
 if c.id is null then return 'not_billed'; end if;
 if c.status not in ('reserved','rate_missing') then return c.status; end if;
 select pricing into pr from meta_whatsapp_receipts where phone_number_id=p_phone_number_id and provider_message_id=p_provider_message_id and jsonb_typeof(pricing)='object'
  order by case status when 'delivered' then 1 when 'read' then 2 else 3 end limit 1;
 select min(occurred_at) into delivered from meta_whatsapp_receipts where phone_number_id=p_phone_number_id and provider_message_id=p_provider_message_id and status in ('delivered','read');
 select exists(select 1 from meta_whatsapp_receipts where phone_number_id=p_phone_number_id and provider_message_id=p_provider_message_id and status='failed') into failed;
 if pr is not null then
  pcat:=public.meta_message_category(pr->>'category');
  ptype:=case when pr->>'type' in ('regular','free_customer_service','free_entry_point','free_group_customer_service') then pr->>'type'
   when pr->>'billable'='true' then 'regular' when pr->>'billable'='false' then 'free' else null end;
  -- Categories without a ConnectyHub tariff (e.g. group_*) keep the raw value for review.
  update meta_message_charges set pricing_category=coalesce(pcat,nullif(pr->>'category',''),pricing_category),pricing_type=coalesce(ptype,pricing_type),
   pricing_model=coalesce(nullif(pr->>'pricing_model',''),pricing_model),updated_at=now() where id=c.id;
 end if;
 if delivered is not null then
  update meta_message_charges set delivered_at=coalesce(delivered_at,least(delivered,now())),updated_at=now() where id=c.id;
 elsif failed then
  perform public.release_meta_message_charge(c.organization_id,c.request_key,'Meta informou falha na entrega.');
  return 'released';
 end if;
 return public.settle_meta_message_charge(c.id);
end $$;

-- Housekeeping: undelivered reservations expire (Meta does not charge them); a delivered
-- message whose pricing never arrived is settled by its expected category.
create function public.expire_meta_message_charges() returns jsonb
language plpgsql security definer set search_path=public as $$
declare c record; released integer:=0; settled integer:=0;
begin
 for c in select id,organization_id,request_key from meta_message_charges where status='reserved' and delivered_at is null and created_at<now()-interval '31 days' limit 200 loop
  perform public.release_meta_message_charge(c.organization_id,c.request_key,'Sem confirmação de entrega em 31 dias.'); released:=released+1;
 end loop;
 for c in select id from meta_message_charges where status='reserved' and delivered_at is not null and pricing_type is null and delivered_at<now()-interval '2 days' limit 200 loop
  update meta_message_charges set pricing_type='regular',pricing_category=expected_category,status_detail='Entregue sem dados de cobrança da Meta; cobrado pela categoria do envio.',updated_at=now() where id=c.id;
  perform public.settle_meta_message_charge(c.id); settled:=settled+1;
 end loop;
 return jsonb_build_object('released',released,'settled',settled);
end $$;

-- Credit the wallet (purchase, admin adjustment). Pays an open debt first. Idempotent.
create function public.credit_meta_message_wallet(p_org uuid, p_amount numeric, p_reference text, p_description text, p_actor uuid default null, p_type text default 'topup', p_metadata jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare owner uuid; w meta_message_wallets; debt_paid numeric; prior meta_message_ledger;
begin
 if p_amount is null or p_amount<=0 or p_amount>1000000 then raise exception 'META_MESSAGE_INVALID_AMOUNT'; end if;
 if p_type not in ('topup','adjustment') or coalesce(p_reference,'')='' then raise exception 'META_MESSAGE_INVALID_CREDIT'; end if;
 owner:=public.meta_message_wallet_owner(p_org);
 insert into meta_message_wallets(organization_id) values(owner) on conflict do nothing;
 select * into w from meta_message_wallets where organization_id=owner for update;
 select * into prior from meta_message_ledger where external_reference=p_reference;
 if prior.id is not null then return jsonb_build_object('already_applied',true,'ledger_id',prior.id); end if;
 debt_paid:=least(w.debt_brl,p_amount);
 update meta_message_wallets set balance_brl=balance_brl+p_amount-debt_paid,debt_brl=debt_brl-debt_paid,
  lifetime_topup_brl=lifetime_topup_brl+case when p_type='topup' then p_amount else 0 end,updated_at=now() where organization_id=owner returning * into w;
 insert into meta_message_ledger(wallet_organization_id,organization_id,entry_type,amount_brl,balance_after_brl,debt_after_brl,external_reference,description,metadata,created_by)
 values(owner,p_org,p_type,p_amount,w.balance_brl,w.debt_brl,p_reference,left(p_description,200),coalesce(p_metadata,'{}')||jsonb_build_object('debt_paid_brl',debt_paid),p_actor)
 returning * into prior;
 return jsonb_build_object('ledger_id',prior.id,'balance_brl',w.balance_brl,'debt_brl',w.debt_brl,'debt_paid_brl',debt_paid);
end $$;

-- Confirmed purchases of "Saldo WhatsApp oficial" products credit this wallet (not AI credits).
create function public.fulfill_meta_message_balance_purchase() returns trigger
language plpgsql security definer set search_path=public as $$
declare p billing_payments; amount numeric;
begin
 select * into p from billing_payments where id=new.payment_id;
 if p.id is null then return new; end if;
 select coalesce(sum((pp.metadata->>'meta_message_balance_brl')::numeric*greatest(coalesce(i.quantity,1),1)),0) into amount
 from billing_invoice_items i join platform_products pp on pp.id::text=i.metadata->>'platform_product_id'
 where i.invoice_id=p.invoice_id and i.organization_id=p.organization_id
  and pp.metadata->>'product_kind'='meta_message_balance' and pp.metadata->>'meta_message_balance_brl' ~ '^[0-9]+([.][0-9]+)?$';
 if amount>0 then
  perform public.credit_meta_message_wallet(p.organization_id,amount,'billing_payment:'||p.id||':meta_messages','Recarga de saldo WhatsApp oficial',null,'topup',jsonb_build_object('payment_id',p.id));
 end if;
 return new;
end $$;
create trigger fulfill_meta_message_balance_purchase after insert on public.billing_payment_fulfillments
 for each row execute function public.fulfill_meta_message_balance_purchase();

-- Top-up packages (hidden from the marketplace; bought from "Saldo e créditos").
insert into public.platform_products(product_code,slug,name,short_description,commercial_description,category,status,marketplace_status,price,offer,fulfillment,agent_tag,
 owner_type,sales_channel_type,billing_cycle,billing_interval,metadata)
select 'CH_SALDO_WA_'||v,'connectyhub-saldo-whatsapp-'||v,'Saldo WhatsApp oficial R$ '||v,
 'Recarga em reais para mensagens da API oficial do WhatsApp',
 'Saldo em reais usado somente nas mensagens enviadas pela API oficial do WhatsApp (Meta) quando o faturamento é feito pela ConnectyHub. Não inclui créditos de IA.',
 'Saldo WhatsApp oficial','active','hidden','R$ '||v||',00',jsonb_build_object('sale_price','R$ '||v||',00'),
 jsonb_build_object('mode','digital','scheduling_required',false),'{{produto_connectyhub_saldo_whatsapp_'||v||'}}',
 'connectyhub','direct','one_time','month',jsonb_build_object('product_kind','meta_message_balance','meta_message_balance_brl',v::numeric,'source','migration_0228')
from unnest(array['50','100','250','500']) v
on conflict do nothing;

-- Customer view: wallet, current rates, this month's usage and recent movements.
create function public.meta_message_wallet_summary(p_org uuid) returns jsonb
language plpgsql security definer set search_path=public stable as $$
declare owner uuid:=public.meta_message_wallet_owner(p_org); month_start timestamptz:=date_trunc('month',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
 return jsonb_build_object(
  'wallet',(select to_jsonb(w) from meta_message_wallets w where organization_id=owner),
  'shared_wallet',owner<>p_org,
  'senders',coalesce((select jsonb_agg(jsonb_build_object('phone_number_id',phone_number_id,'display_phone',display_phone,'verified_name',verified_name,'billing_mode',billing_mode,'status',status) order by connected_at)
    from meta_whatsapp_connections where organization_id=p_org and status='connected'),'[]'),
  'rates',coalesce((select jsonb_agg(jsonb_build_object('market',r.market,'category',r.category,'customer_price_brl',r.customer_price_brl,'effective_from',r.effective_from) order by r.market,r.customer_price_brl desc)
    from meta_message_rates r where r.effective_from<=now() and (r.effective_to is null or r.effective_to>now())),'[]'),
  'month',coalesce((select jsonb_agg(x) from (select coalesce(pricing_category,expected_category) category,status,count(*) messages,coalesce(sum(charged_brl),0) charged_brl
    from meta_message_charges where wallet_organization_id=owner and created_at>=month_start group by 1,2) x),'[]'),
  'ledger',coalesce((select jsonb_agg(l order by l.created_at desc) from (select id,entry_type,amount_brl,balance_after_brl,debt_after_brl,description,created_at,metadata->>'category' category
    from meta_message_ledger where wallet_organization_id=owner order by created_at desc limit 40) l),'[]'),
  'packages',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'amount_brl',(metadata->>'meta_message_balance_brl')::numeric) order by (metadata->>'meta_message_balance_brl')::numeric)
    from platform_products where status='active' and owner_type='connectyhub' and sales_channel_type='direct' and metadata->>'product_kind'='meta_message_balance'),'[]'));
end $$;

-- Admin view: revenue, Meta cost and margin per category; balances held for customers.
create function public.meta_message_billing_report(p_from timestamptz, p_to timestamptz) returns jsonb
language sql security definer set search_path=public stable as $$
 select jsonb_build_object(
  'by_category',coalesce((select jsonb_agg(x) from (select coalesce(pricing_category,expected_category) category,
     count(*) filter(where status='charged') charged_messages,count(*) filter(where status='free') free_messages,
     coalesce(sum(charged_brl) filter(where status='charged'),0) revenue_brl,coalesce(sum(provider_cost_brl) filter(where status='charged'),0) meta_cost_brl,
     coalesce(sum(shortfall_brl),0) shortfall_brl
    from meta_message_charges where settled_at>=p_from and settled_at<p_to and status in ('charged','free') group by 1 order by 1) x),'[]'),
  'by_organization',coalesce((select jsonb_agg(x) from (select c.wallet_organization_id organization_id,o.name,count(*) filter(where c.status='charged') charged_messages,
     coalesce(sum(c.charged_brl) filter(where c.status='charged'),0) revenue_brl,coalesce(sum(c.provider_cost_brl) filter(where c.status='charged'),0) meta_cost_brl
    from meta_message_charges c join organizations o on o.id=c.wallet_organization_id where c.settled_at>=p_from and c.settled_at<p_to group by 1,2 order by 4 desc limit 30) x),'[]'),
  'topups_brl',coalesce((select sum(amount_brl) from meta_message_ledger where entry_type='topup' and created_at>=p_from and created_at<p_to),0),
  'adjustments_brl',coalesce((select sum(amount_brl) from meta_message_ledger where entry_type='adjustment' and created_at>=p_from and created_at<p_to),0),
  'wallets',(select jsonb_build_object('balance_brl',coalesce(sum(balance_brl),0),'reserved_brl',coalesce(sum(reserved_brl),0),'debt_brl',coalesce(sum(debt_brl),0),'wallets',count(*)) from meta_message_wallets),
  'open',(select jsonb_build_object('reserved',count(*) filter(where status='reserved'),'reserved_old',count(*) filter(where status='reserved' and created_at<now()-interval '3 days'),
     'rate_missing',count(*) filter(where status='rate_missing')) from meta_message_charges where status in ('reserved','rate_missing')),
  'senders',coalesce((select jsonb_agg(jsonb_build_object('organization_id',c.organization_id,'organization',o.name,'phone_number_id',c.phone_number_id,'display_phone',c.display_phone,
     'verified_name',c.verified_name,'waba_id',c.waba_id,'billing_mode',c.billing_mode,'billing_mode_changed_at',c.billing_mode_changed_at,'coexistence',c.coexistence) order by o.name)
    from meta_whatsapp_connections c join organizations o on o.id=c.organization_id where c.status='connected'),'[]'),
  'rates',coalesce((select jsonb_agg(to_jsonb(r) order by r.market,r.category,r.effective_from desc) from meta_message_rates r where r.effective_to is null or r.effective_to>now()-interval '120 days'),'[]'));
$$;

-- Admin: register a new rate (closes the previous one for the same market/category).
create function public.set_meta_message_rate(p_market text, p_category text, p_cost numeric, p_multiplier numeric, p_from timestamptz, p_source text, p_actor uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if p_category is distinct from public.meta_message_category(p_category) then raise exception 'META_MESSAGE_INVALID_CATEGORY'; end if;
 if p_cost is null or p_cost<0 or p_cost>100 or p_multiplier is null or p_multiplier<1 or p_multiplier>20 then raise exception 'META_MESSAGE_INVALID_RATE'; end if;
 perform pg_advisory_xact_lock(hashtextextended('meta_rate:'||p_market||':'||p_category,0));
 if exists(select 1 from meta_message_rates where market=p_market and category=p_category and effective_from>=p_from) then raise exception 'META_MESSAGE_RATE_NOT_LATEST'; end if;
 update meta_message_rates set effective_to=p_from where market=p_market and category=p_category and (effective_to is null or effective_to>p_from);
 insert into meta_message_rates(market,category,provider_cost_brl,multiplier,effective_from,source,created_by) values(upper(p_market),p_category,p_cost,p_multiplier,p_from,left(p_source,200),p_actor) returning meta_message_rates.id into v_id;
 return v_id;
end $$;

create function public.set_meta_whatsapp_billing_mode(p_phone_number_id text, p_mode text, p_actor uuid) returns void
language plpgsql security definer set search_path=public as $$
declare conn meta_whatsapp_connections;
begin
 if p_mode not in ('customer_meta','connectyhub_credit_line') then raise exception 'META_MESSAGE_INVALID_MODE'; end if;
 update meta_whatsapp_connections set billing_mode=p_mode,billing_mode_changed_at=now(),billing_mode_changed_by=p_actor where phone_number_id=p_phone_number_id returning * into conn;
 if conn.phone_number_id is null then raise exception 'META_MESSAGE_SENDER_NOT_FOUND'; end if;
 insert into maintenance_audit_logs(actor_id,event_type,target_table,target_id,metadata)
 values(p_actor,'meta.whatsapp.billing_mode','meta_whatsapp_connections',conn.organization_id,jsonb_build_object('phone_number_id',p_phone_number_id,'waba_id',conn.waba_id,'billing_mode',p_mode));
end $$;

do $$ declare f text; begin
 foreach f in array array[
  'public.meta_message_wallet_owner(uuid)','public.meta_message_market(text)','public.meta_message_rate(text,text,timestamptz)','public.meta_message_category(text)',
  'public.reserve_meta_message_charge(uuid,text,uuid,text,text,uuid)','public.link_meta_message_charge(uuid,uuid,uuid)','public.release_meta_message_charge(uuid,uuid,text)',
  'public.settle_meta_message_charge(uuid)','public.record_meta_message_pricing(text,text)','public.expire_meta_message_charges()',
  'public.credit_meta_message_wallet(uuid,numeric,text,text,uuid,text,jsonb)','public.fulfill_meta_message_balance_purchase()','public.meta_message_wallet_summary(uuid)',
  'public.meta_message_billing_report(timestamptz,timestamptz)','public.set_meta_message_rate(text,text,numeric,numeric,timestamptz,text,uuid)',
  'public.set_meta_whatsapp_billing_mode(text,text,uuid)'] loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  execute format('grant execute on function %s to service_role',f);
 end loop;
end $$;
