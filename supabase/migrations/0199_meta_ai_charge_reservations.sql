create table public.meta_ai_charges (
 id uuid primary key, organization_id uuid not null references public.organizations(id),
 billing_organization_id uuid not null references public.organizations(id), user_id uuid not null references auth.users(id),
 feature_code text not null, input_hash text not null, brief jsonb not null, model text not null, prices jsonb not null,
 status text not null default 'preparing' check(status in ('preparing','processing','generated','completed','failed','uncertain')),
 reserved_credits numeric not null default 0 check(reserved_credits>=0), charge_credits numeric,
 provider_response jsonb, result jsonb, settlement jsonb, usage_event_id uuid, error_message text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index meta_ai_org_time on public.meta_ai_charges(organization_id,created_at desc);
create unique index meta_ai_one_running on public.meta_ai_charges(organization_id) where status in ('preparing','processing','generated','uncertain');
alter table public.meta_ai_charges enable row level security;
revoke all on public.meta_ai_charges from public,anon,authenticated;
grant all on public.meta_ai_charges to service_role;

create function public.reserve_meta_ai(p_id uuid,p_amount numeric) returns void language plpgsql security definer set search_path=public as $$
declare r meta_ai_charges; w credit_wallets; a jsonb; limits organization_billing_limits; spent numeric;
begin
 select * into r from meta_ai_charges where id=p_id;
 perform ensure_credit_wallet(r.billing_organization_id);
 select * into w from credit_wallets where organization_id=r.billing_organization_id for update;
 select * into r from meta_ai_charges where id=p_id for update;
 a:=resolve_organization_contract_access(r.organization_id);
 if r.id is null or r.status<>'preparing' or not coalesce((a->>'allowed')::boolean,false) or (a->>'billing_organization_id')::uuid<>r.billing_organization_id then raise exception 'meta_ai_access'; end if;
 if p_amount is null or p_amount<0 or p_amount::text in ('NaN','Infinity','-Infinity') or w.status<>'active' then raise exception 'meta_ai_reservation'; end if;
 if a->>'plan_code'='internal' then p_amount:=0; end if;
 if w.balance_credits-w.reserved_credits<p_amount then raise exception 'meta_ai_insufficient_credits'; end if;
 select * into limits from organization_billing_limits where organization_id=r.billing_organization_id;
 select coalesce(sum(connecty_charge_credits),0) into spent from usage_events where organization_id=r.billing_organization_id and occurred_at>=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
 if limits.daily_credit_limit is not null and spent+w.reserved_credits+p_amount>limits.daily_credit_limit then raise exception 'meta_ai_daily_limit'; end if;
 select coalesce(sum(connecty_charge_credits),0) into spent from usage_events where organization_id=r.billing_organization_id and occurred_at>=date_trunc('month',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
 if limits.monthly_credit_limit is not null and spent+w.reserved_credits+p_amount>limits.monthly_credit_limit then raise exception 'meta_ai_monthly_limit'; end if;
 update credit_wallets set reserved_credits=reserved_credits+p_amount where id=w.id;
 update meta_ai_charges set reserved_credits=p_amount,status='processing',updated_at=now() where id=p_id;
end $$;

-- Completion and debit are a single transaction. Uncertain dispatch keeps its reservation.
create function public.finish_meta_ai(p_id uuid,p_failed boolean default false) returns void language plpgsql security definer set search_path=public as $$
declare r meta_ai_charges; w credit_wallets; charge numeric; cost numeric; event_id uuid; u jsonb;
begin
 select * into r from meta_ai_charges where id=p_id;
 select * into w from credit_wallets where organization_id=r.billing_organization_id for update;
 select * into r from meta_ai_charges where id=p_id for update;
 if r.id is null then raise exception 'meta_ai_missing'; end if;
 if r.status in ('completed','failed') then return; end if;
 if p_failed then
   if r.status not in ('preparing','processing') or r.provider_response is not null then raise exception 'meta_ai_failure_state'; end if;
   update credit_wallets set reserved_credits=reserved_credits-r.reserved_credits where id=w.id;
   update meta_ai_charges set status='failed',reserved_credits=0,updated_at=now() where id=p_id;
   return;
 end if;
 u:=r.settlement;
 if u is null or r.provider_response is null or r.status not in ('generated','uncertain') then raise exception 'meta_ai_settlement_missing'; end if;
 charge:=(u->>'charge')::numeric; cost:=(u->>'cost')::numeric;
 if charge is null or cost is null or charge<0 or cost<0 or charge::text in ('NaN','Infinity','-Infinity') or cost::text in ('NaN','Infinity','-Infinity') then raise exception 'meta_ai_usage_invalid'; end if;
 if w.id is null or w.balance_credits-(w.reserved_credits-r.reserved_credits)<charge then raise exception 'meta_ai_insufficient_credits'; end if;
 update credit_wallets set reserved_credits=reserved_credits-r.reserved_credits where id=w.id;
 insert into usage_events(organization_id,user_id,provider,feature_code,model_id,status,input_tokens,output_tokens,total_tokens,input_units,output_units,provider_cost,connecty_charge_credits,request_id,billing_mode,metadata,connecty_revenue_estimate,gross_margin_estimate)
 values(r.billing_organization_id,r.user_id,'gemini',r.feature_code,r.model,'completed',(u->>'input')::bigint,(u->>'output')::bigint,(u->>'input')::bigint+(u->>'output')::bigint,(u->>'input')::numeric,(u->>'output')::numeric,cost,charge,r.id::text,u->>'billingMode',jsonb_build_object('source','meta_ai_generation','execution_organization_id',r.organization_id,'metering',u->'metering'),charge*.01,charge*.01-cost) returning id into event_id;
 if charge>0 then perform debit_credit_wallet(r.billing_organization_id,charge,'gemini',event_id,'Consumo de IA Meta',jsonb_build_object('job_id',r.id)); end if;
 update meta_ai_charges set status='completed',reserved_credits=0,charge_credits=charge,usage_event_id=event_id,updated_at=now() where id=p_id;
end $$;
revoke all on function public.reserve_meta_ai(uuid,numeric),public.finish_meta_ai(uuid,boolean) from public,anon,authenticated;
grant execute on function public.reserve_meta_ai(uuid,numeric),public.finish_meta_ai(uuid,boolean) to service_role;
