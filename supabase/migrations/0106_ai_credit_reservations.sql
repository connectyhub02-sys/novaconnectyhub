-- External AI shares the account wallet. All mutation RPCs are server-only.
create table public.ai_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (length(name) between 1 and 100),
  status text not null default 'active' check (status in ('active','paused')),
  monthly_credit_limit numeric(18,6) check (monthly_credit_limit > 0),
  requests_per_minute integer not null default 30 check (requests_per_minute between 1 and 300),
  max_output_tokens integer not null default 2048 check (max_output_tokens between 1 and 8192),
  created_at timestamptz not null default now()
);
create table public.ai_api_keys (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.ai_projects(id),
  key_hash text not null unique,
  key_prefix text not null,
  name text not null,
  status text not null default 'active' check (status in ('active','revoked')),
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null references public.ai_projects(id),
  key_id uuid not null references public.ai_api_keys(id),
  idempotency_key text not null check (length(idempotency_key) between 1 and 128),
  request_hash text not null,
  status text not null default 'preparing' check (status in ('preparing','reserved','processing','completed','failed','uncertain')),
  model_id text,
  reserved_credits numeric(18,6) not null default 0 check (reserved_credits >= 0),
  charged_credits numeric(18,6) not null default 0,
  rate_snapshot jsonb not null default '[]',
  response jsonb,
  result_snapshot jsonb,
  error_code text,
  usage_event_id uuid references public.usage_events(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,idempotency_key)
);
create index ai_requests_account_time on public.ai_requests(organization_id,created_at desc);
create index ai_requests_project_time on public.ai_requests(project_id,created_at desc);
alter table public.ai_projects enable row level security;
alter table public.ai_api_keys enable row level security;
alter table public.ai_requests enable row level security;
revoke all on public.ai_projects, public.ai_api_keys, public.ai_requests from anon, authenticated;
grant all on public.ai_projects, public.ai_api_keys, public.ai_requests to service_role;

-- Every old debit also respects reservations. Never make a second spendable wallet.
alter function public.debit_credit_wallet(uuid,numeric,public.billing_provider,uuid,text,jsonb) rename to debit_credit_wallet_before_ai;
revoke all on function public.debit_credit_wallet_before_ai(uuid,numeric,public.billing_provider,uuid,text,jsonb) from public,anon,authenticated;
create function public.debit_credit_wallet(p_organization_id uuid,p_amount_credits numeric,p_provider public.billing_provider default null,p_usage_event_id uuid default null,p_description text default null,p_metadata jsonb default '{}') returns uuid
language plpgsql security definer set search_path=public as $$
declare w public.credit_wallets;
begin
  perform public.ensure_credit_wallet(p_organization_id);
  select * into w from public.credit_wallets where organization_id=p_organization_id for update;
  if w.reserved_credits > 0 and w.balance_credits-w.reserved_credits < p_amount_credits then
    raise exception 'Insufficient available ConnectyHub credits (active reservations).';
  end if;
  return public.debit_credit_wallet_before_ai(p_organization_id,p_amount_credits,p_provider,p_usage_event_id,p_description,p_metadata);
end $$;
revoke all on function public.debit_credit_wallet(uuid,numeric,public.billing_provider,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.debit_credit_wallet(uuid,numeric,public.billing_provider,uuid,text,jsonb) to service_role;

create function public.claim_ai_request(p_key uuid,p_idempotency text,p_hash text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare k public.ai_api_keys; p public.ai_projects; r public.ai_requests; access jsonb;
begin
  select * into k from public.ai_api_keys where id=p_key;
  select * into p from public.ai_projects where id=k.project_id for update;
  if k.id is null or k.status<>'active' or p.status<>'active' then raise exception 'ai_key_inactive'; end if;
  access := public.resolve_organization_contract_access(p.organization_id);
  if not coalesce((access->>'allowed')::boolean,false) then raise exception 'ai_contract_inactive'; end if;
  select * into r from public.ai_requests where project_id=p.id and idempotency_key=p_idempotency;
  if r.id is not null then
    if r.request_hash<>p_hash then raise exception 'ai_idempotency_conflict'; end if;
    return to_jsonb(r)||jsonb_build_object('claimed',false);
  end if;
  if (select count(*) from public.ai_requests where project_id=p.id and created_at>now()-interval '1 minute') >= p.requests_per_minute then raise exception 'ai_rate_limit'; end if;
  insert into public.ai_requests(organization_id,project_id,key_id,idempotency_key,request_hash)
    values((access->>'billing_organization_id')::uuid,p.id,k.id,p_idempotency,p_hash) returning * into r;
  update public.ai_api_keys set last_used_at=now() where id=k.id;
  return to_jsonb(r)||jsonb_build_object('claimed',true);
end $$;

create function public.reserve_ai_credits(p_request uuid,p_amount numeric,p_model text,p_rates jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare r public.ai_requests; w public.credit_wallets; p public.ai_projects; limits public.organization_billing_limits; spent numeric;
begin
  select * into r from public.ai_requests where id=p_request;
  perform public.ensure_credit_wallet(r.organization_id);
  select * into w from public.credit_wallets where organization_id=r.organization_id for update;
  select * into r from public.ai_requests where id=p_request for update;
  if r.status<>'preparing' then raise exception 'ai_request_state'; end if;
  if p_amount<0 or p_amount is null or w.status<>'active' then raise exception 'ai_reservation_invalid'; end if;
  if w.balance_credits-w.reserved_credits < p_amount then raise exception 'ai_insufficient_credits'; end if;
  select * into p from public.ai_projects where id=r.project_id;
  if p.status<>'active' or not exists(select 1 from public.ai_api_keys where id=r.key_id and status='active') then raise exception 'ai_key_inactive'; end if;
  select coalesce(sum(charged_credits+reserved_credits),0) into spent from public.ai_requests where project_id=r.project_id and created_at>=date_trunc('month',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  if p.monthly_credit_limit is not null and spent+p_amount>p.monthly_credit_limit then raise exception 'ai_project_budget'; end if;
  select * into limits from public.organization_billing_limits where organization_id=r.organization_id;
  select coalesce(sum(connecty_charge_credits),0) into spent from public.usage_events where organization_id=r.organization_id and occurred_at>=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  if limits.daily_credit_limit is not null and spent+w.reserved_credits+p_amount>limits.daily_credit_limit then raise exception 'ai_daily_budget'; end if;
  select coalesce(sum(connecty_charge_credits),0) into spent from public.usage_events where organization_id=r.organization_id and occurred_at>=date_trunc('month',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  if limits.monthly_credit_limit is not null and spent+w.reserved_credits+p_amount>limits.monthly_credit_limit then raise exception 'ai_monthly_budget'; end if;
  update public.credit_wallets set reserved_credits=reserved_credits+p_amount,updated_at=now() where id=w.id;
  update public.ai_requests set status='reserved',reserved_credits=p_amount,model_id=p_model,rate_snapshot=p_rates,updated_at=now() where id=r.id;
end $$;

create function public.finish_ai_request(p_request uuid,p_status text,p_usage jsonb default '{}',p_response jsonb default null,p_error text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r public.ai_requests; w public.credit_wallets; event_id uuid; charge numeric; cost numeric; tx uuid;
begin
  select * into r from public.ai_requests where id=p_request;
  select * into w from public.credit_wallets where organization_id=r.organization_id for update;
  select * into r from public.ai_requests where id=p_request for update;
  if r.id is null then raise exception 'ai_request_missing'; end if;
  if r.status in ('completed','failed') then return to_jsonb(r); end if;
  if p_status='uncertain' then
    update public.ai_requests set status='uncertain',error_code=p_error,updated_at=now() where id=r.id returning * into r;
    return to_jsonb(r);
  end if;
  if p_status not in ('completed','failed') then raise exception 'ai_finish_state'; end if;
  charge:=case when p_status='completed' then coalesce((p_usage->>'charge')::numeric,0) else 0 end;
  cost:=coalesce((p_usage->>'cost')::numeric,0);
  if charge<0 or charge>r.reserved_credits then raise exception 'ai_charge_exceeds_reservation'; end if;
  -- A refund or administrator correction can remove wallet funds while a call
  -- runs. Absorb any shortfall; do not overdraw or consume another reservation.
  if charge>greatest(0,w.balance_credits-(w.reserved_credits-r.reserved_credits)) then
    p_usage:=jsonb_set(p_usage,'{metering}',coalesce(p_usage->'metering','{}')||jsonb_build_object('wallet_shortfall_absorbed',charge-greatest(0,w.balance_credits-(w.reserved_credits-r.reserved_credits))));
    charge:=greatest(0,w.balance_credits-(w.reserved_credits-r.reserved_credits));
  end if;
  if p_response is not null then p_response:=jsonb_set(p_response,'{connectyhub,credits}',to_jsonb(charge)); end if;
  update public.credit_wallets set reserved_credits=greatest(0,reserved_credits-r.reserved_credits),updated_at=now() where id=w.id;
  insert into public.usage_events(organization_id,provider,feature_code,model_id,status,input_units,output_units,input_tokens,output_tokens,total_tokens,provider_cost,connecty_charge_credits,request_id,billing_mode,metadata,error_message,connecty_revenue_estimate,gross_margin_estimate)
    values(r.organization_id,'gemini','external_ai',r.model_id,p_status::public.usage_event_status,coalesce((p_usage->>'input')::numeric,0),coalesce((p_usage->>'output')::numeric,0),coalesce((p_usage->>'input')::bigint,0),coalesce((p_usage->>'output')::bigint,0),coalesce((p_usage->>'input')::bigint,0)+coalesce((p_usage->>'output')::bigint,0),cost,charge,r.id::text,coalesce(p_usage->>'billingMode','customer_billable'),jsonb_build_object('source','external_ai','project_id',r.project_id,'request_id',r.id,'metering',p_usage->'metering','provider_response_id',p_usage->>'providerResponseId'),p_error,round(charge*coalesce((p_usage->>'creditUnitBrl')::numeric,0),8),round(charge*coalesce((p_usage->>'creditUnitBrl')::numeric,0)-cost,8))
    returning id into event_id;
  if charge>0 then
    -- Settlement may occur after expiry. Consumption was authorized while active;
    -- debit directly under the same wallet lock, without granting any access.
    update public.credit_wallets set balance_credits=balance_credits-charge,lifetime_used_credits=lifetime_used_credits+charge,updated_at=now() where id=w.id;
    insert into public.credit_transactions(organization_id,wallet_id,transaction_type,amount_credits,balance_after_credits,provider,usage_event_id,description,metadata)
      values(r.organization_id,w.id,'debit',-charge,w.balance_credits-charge,'gemini',event_id,'Uso da API de IA ConnectyHub',jsonb_build_object('request_id',r.id,'project_id',r.project_id)) returning id into tx;
    update public.billing_cycles set used_credits=used_credits+charge,updated_at=now() where id=(select id from public.billing_cycles where organization_id=r.organization_id and status='open' and cycle_start<=r.created_at and cycle_end>r.created_at order by cycle_end limit 1);
  end if;
  update public.ai_requests set status=p_status,reserved_credits=0,charged_credits=charge,response=p_response,usage_event_id=event_id,error_code=p_error,updated_at=now() where id=r.id returning * into r;
  return to_jsonb(r);
end $$;
revoke all on function public.claim_ai_request(uuid,text,text),public.reserve_ai_credits(uuid,numeric,text,jsonb),public.finish_ai_request(uuid,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.claim_ai_request(uuid,text,text),public.reserve_ai_credits(uuid,numeric,text,jsonb),public.finish_ai_request(uuid,text,jsonb,jsonb,text) to service_role;

create function public.start_ai_request(p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r public.ai_requests; access jsonb;
begin
  select * into r from public.ai_requests where id=p_request for update;
  if r.status<>'reserved' or r.updated_at<now()-interval '2 minutes' then raise exception 'ai_request_state'; end if;
  if not exists(select 1 from public.ai_api_keys k join public.ai_projects p on p.id=k.project_id where k.id=r.key_id and k.status='active' and p.status='active') then raise exception 'ai_key_inactive'; end if;
  access:=public.resolve_organization_contract_access(r.organization_id);
  if not coalesce((access->>'allowed')::boolean,false) then raise exception 'ai_contract_inactive'; end if;
  update public.ai_requests set status='processing',updated_at=now() where id=r.id returning * into r;
  return to_jsonb(r);
end $$;
revoke all on function public.start_ai_request(uuid) from public,anon,authenticated;
grant execute on function public.start_ai_request(uuid) to service_role;

create function public.expire_unstarted_ai_request(p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r public.ai_requests;
begin
 select * into r from public.ai_requests where id=p_request;
 perform 1 from public.credit_wallets where organization_id=r.organization_id for update;
 select * into r from public.ai_requests where id=p_request for update;
 if r.status in ('preparing','reserved') and r.updated_at<now()-interval '5 minutes' then
   return public.finish_ai_request(r.id,'failed','{}',null,'expired_before_dispatch');
 end if;
 return to_jsonb(r);
end $$;
create function public.release_uncertain_ai_request(p_request uuid,p_actor uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r public.ai_requests; result jsonb;
begin
 if not exists(select 1 from public.profiles where id=p_actor and is_platform_admin) then raise exception 'ADMIN_REQUIRED'; end if;
 if length(trim(p_reason))<15 then raise exception 'RECONCILIATION_REASON_REQUIRED'; end if;
 select * into r from public.ai_requests where id=p_request;
 perform 1 from public.credit_wallets where organization_id=r.organization_id for update;
 select * into r from public.ai_requests where id=p_request for update;
 if r.status<>'uncertain' or r.result_snapshot is not null then raise exception 'RECONCILIATION_STATE_CHANGED'; end if;
 result:=public.finish_ai_request(r.id,'failed','{}',null,'operator_absorbed_unknown_usage');
 insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
 values('organization',r.organization_id,'ai_request',r.id,'ai.reconciled','Reserva liberada pelo administrador',p_reason,'private',array['ai','reconciliation'],jsonb_build_object('actor_id',p_actor,'request_id',r.id,'reserved_credits',r.reserved_credits,'customer_charged',0));
 return result;
end $$;
revoke all on function public.expire_unstarted_ai_request(uuid),public.release_uncertain_ai_request(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.expire_unstarted_ai_request(uuid),public.release_uncertain_ai_request(uuid,uuid,text) to service_role;
