-- Voice has its own operation receipts, but uses the existing customer wallet.
-- No agent is required and no tariff is created or changed by this migration.
create table public.voice_projects (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 name text not null check(length(name) between 1 and 100), status text not null default 'active' check(status in ('active','paused')),
 monthly_credit_limit numeric(18,6) check(monthly_credit_limit>0), created_at timestamptz not null default now()
);
create table public.voice_api_keys (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.voice_projects(id),
 name text not null check(length(name) between 1 and 100), key_hash text not null unique, key_prefix text not null,
 status text not null default 'active' check(status in ('active','revoked')), expires_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.voice_generations (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.voice_projects(id),
 organization_id uuid not null references public.organizations(id), billing_organization_id uuid not null references public.organizations(id),
 key_id uuid references public.voice_api_keys(id), idempotency_key text not null check(length(idempotency_key) between 1 and 128),
 input_hash text not null, operation text not null default 'text_to_speech' check(operation in ('text_to_speech','voice_clone','voice_clone_preview')),
 voice_id text not null, model_id text not null, characters integer not null check(characters between 1 and 4800),
 status text not null default 'reserved' check(status in ('reserved','processing','uncertain','completed','failed')),
 reserved_credits numeric(18,6) not null check(reserved_credits>=0), quoted_credits numeric(18,6) not null check(quoted_credits>=0),
 charged_credits numeric(18,6) not null default 0, estimated_provider_cost numeric(18,8) not null check(estimated_provider_cost>=0),
 effective_provider_cost numeric(18,8), rate_snapshot jsonb not null, provider_history_id text,
 object_path text, bytes_size integer check(bytes_size between 1 and 12582912), usage_event_id uuid references public.usage_events(id),
 error_code text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(project_id,idempotency_key)
);
create index voice_generations_org_date on public.voice_generations(organization_id,created_at desc);
create index voice_generations_wallet_date on public.voice_generations(billing_organization_id,created_at desc);
create table public.voice_clones (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 project_id uuid not null references public.voice_projects(id), provider_voice_id text unique,
 name text not null check(length(name) between 2 and 80), status text not null check(status in ('creating','ready','verification_required','uncertain','deleting','deleted','failed')),
 consent_text text not null, consent_accepted_at timestamptz not null default now(), created_by uuid,
 idempotency_key text not null, input_hash text not null, error_code text, generation_id uuid references public.voice_generations(id),
 origin text not null default 'api' check(origin in ('api','verified_import')), ownership_evidence jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(project_id,idempotency_key),
 check ((origin='api' and generation_id is not null) or (origin='verified_import' and generation_id is null and provider_voice_id is not null and ownership_evidence is not null and coalesce(ownership_evidence->>'consent_confirmed','false')='true' and ownership_evidence->>'provider_verified_at' is not null and ownership_evidence->>'source_project' is not null))
);
alter table public.voice_clones enable row level security;
revoke all on public.voice_clones from public,anon,authenticated;
grant all on public.voice_clones to service_role;
alter table public.voice_projects enable row level security;
alter table public.voice_api_keys enable row level security;
alter table public.voice_generations enable row level security;
revoke all on public.voice_projects,public.voice_api_keys,public.voice_generations from public,anon,authenticated;
grant all on public.voice_projects,public.voice_api_keys,public.voice_generations to service_role;

create function public.reserve_voice_generation(p_project uuid,p_key uuid,p_idempotency text,p_hash text,p_voice text,p_model text,p_characters integer,p_charge numeric,p_cost numeric,p_rates jsonb,p_operation text default 'text_to_speech')
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.voice_projects; r public.voice_generations; w public.credit_wallets; access jsonb; used numeric;
begin
 -- Bound provider concurrency across all accounts. Other billing operations use
 -- the same wallet row lock; holds cannot spend another operation's credits.
 perform pg_advisory_xact_lock(147,1);
 select * into p from public.voice_projects where id=p_project;
 if p.id is null or p.status<>'active' then raise exception 'voice_project_inactive'; end if;
 if p_key is not null and not exists(select 1 from public.voice_api_keys where id=p_key and project_id=p.id and status='active' and (expires_at is null or expires_at>now())) then raise exception 'voice_key_inactive'; end if;
 select * into r from public.voice_generations where project_id=p.id and idempotency_key=p_idempotency;
 if r.id is not null then
  if r.input_hash<>p_hash then raise exception 'voice_idempotency_conflict'; end if;
  return to_jsonb(r)||'{"claimed":false}'::jsonb;
 end if;
 access:=public.resolve_organization_contract_access(p.organization_id);
 if not coalesce((access->>'allowed')::boolean,false) then raise exception 'voice_contract_inactive'; end if;
 if p_operation not in ('text_to_speech','voice_clone','voice_clone_preview') or p_charge is null or p_charge<0 or (p_operation='text_to_speech' and p_charge=0) or p_charge::text in ('NaN','Infinity','-Infinity') or p_cost is null or p_cost<0 or p_cost::text in ('NaN','Infinity','-Infinity') then raise exception 'voice_price_invalid'; end if;
 perform public.ensure_credit_wallet((access->>'billing_organization_id')::uuid);
 select * into w from public.credit_wallets where organization_id=(access->>'billing_organization_id')::uuid for update;
 if w.status<>'active' or w.balance_credits-w.reserved_credits<p_charge then raise exception 'voice_insufficient_credits'; end if;
 if (select count(*) from public.voice_generations where billing_organization_id=w.organization_id and created_at>now()-interval '1 minute')>=10 then raise exception 'voice_rate_limit'; end if;
 if (select count(*) from public.voice_generations where billing_organization_id=w.organization_id and status in ('reserved','processing','uncertain'))>=2
 or (select count(*) from public.voice_generations where status in ('reserved','processing'))>=8 then raise exception 'voice_concurrency_limit'; end if;
 select coalesce(sum(charged_credits+reserved_credits),0) into used from public.voice_generations where project_id=p.id and created_at>=date_trunc('month',now());
 if p.monthly_credit_limit is not null and used+p_charge>p.monthly_credit_limit then raise exception 'voice_project_limit'; end if;
 insert into public.voice_generations(project_id,organization_id,billing_organization_id,key_id,idempotency_key,input_hash,voice_id,model_id,characters,reserved_credits,quoted_credits,estimated_provider_cost,rate_snapshot,operation)
 values(p.id,p.organization_id,w.organization_id,p_key,p_idempotency,p_hash,p_voice,p_model,p_characters,p_charge,p_charge,p_cost,p_rates,p_operation) returning * into r;
 update public.credit_wallets set reserved_credits=reserved_credits+p_charge,updated_at=now() where id=w.id;
 return to_jsonb(r)||'{"claimed":true}'::jsonb;
end $$;

create function public.finish_voice_generation(p_id uuid,p_status text,p_error text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.voice_generations; w public.credit_wallets; charge numeric; event_id uuid;
begin
 select * into r from public.voice_generations where id=p_id;
 if r.id is null then raise exception 'voice_not_found'; end if;
 select * into w from public.credit_wallets where organization_id=r.billing_organization_id for update;
 select * into r from public.voice_generations where id=p_id for update;
 if r.status in ('completed','failed') then return to_jsonb(r); end if;
 if p_status='uncertain' then
  update public.voice_generations set status='uncertain',error_code=p_error,updated_at=now() where id=r.id returning * into r;
  return to_jsonb(r);
 end if;
 if p_status not in ('completed','failed') then raise exception 'voice_finish_invalid'; end if;
 if p_status='completed' and r.operation<>'voice_clone' and (r.object_path is null or r.bytes_size is null) then raise exception 'voice_audio_missing'; end if;
 if p_status='completed' and r.operation='voice_clone' and not exists(select 1 from public.voice_clones where generation_id=r.id and provider_voice_id is not null and status in ('ready','verification_required')) then raise exception 'voice_clone_missing'; end if;
 charge:=case when p_status='completed' then r.quoted_credits else 0 end;
 if charge>w.balance_credits-(w.reserved_credits-r.reserved_credits) then raise exception 'voice_settlement_pending'; end if;
 if p_status='completed' and r.operation<>'voice_clone' then
  perform public.record_organization_storage_usage(r.organization_id,r.bytes_size::bigint,1,'generated_media',jsonb_build_object('voice_request_id',r.id));
 end if;
 insert into public.usage_events(organization_id,provider,feature_code,model_id,status,input_units,output_units,input_tokens,output_tokens,total_tokens,provider_cost,connecty_charge_credits,request_id,billing_mode,metadata,error_message,connecty_revenue_estimate,gross_margin_estimate)
 values(r.billing_organization_id,'elevenlabs',case when r.operation='voice_clone' then 'voice_clone' else 'text_to_speech' end,r.model_id,p_status::public.usage_event_status,r.characters,0,0,0,0,case when p_status='completed' then r.estimated_provider_cost else 0 end,charge,'voice:'||r.id,case when r.operation='voice_clone_preview' then 'platform_absorbed' else 'customer_billable' end,
 jsonb_build_object('source','voice_api','organization_id',r.organization_id,'project_id',r.project_id,'voice_id',r.voice_id,'characters',r.characters,'rate_snapshot',r.rate_snapshot,'provider_cost_basis','tariff_estimate'),p_error,round(charge*.01,8),case when p_status='completed' then round(charge*.01-r.estimated_provider_cost,8) else 0 end) returning id into event_id;
 update public.credit_wallets set reserved_credits=reserved_credits-r.reserved_credits,balance_credits=balance_credits-charge,lifetime_used_credits=lifetime_used_credits+charge,updated_at=now() where id=w.id;
 if charge>0 then
  insert into public.credit_transactions(organization_id,wallet_id,transaction_type,amount_credits,balance_after_credits,provider,usage_event_id,description,metadata)
  values(r.billing_organization_id,w.id,'debit',-charge,w.balance_credits-charge,'elevenlabs',event_id,'ConnectyHub Voz',jsonb_build_object('request_id',r.id,'project_id',r.project_id));
  update public.billing_cycles set used_credits=used_credits+charge,updated_at=now() where id=(select id from public.billing_cycles where organization_id=r.billing_organization_id and status='open' and cycle_start<=r.created_at and cycle_end>r.created_at order by cycle_end limit 1);
 end if;
 update public.voice_generations set status=p_status,reserved_credits=0,charged_credits=charge,usage_event_id=event_id,error_code=p_error,updated_at=now() where id=r.id returning * into r;
 return to_jsonb(r);
end $$;
revoke all on function public.reserve_voice_generation(uuid,uuid,text,text,text,text,integer,numeric,numeric,jsonb,text),public.finish_voice_generation(uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_voice_generation(uuid,uuid,text,text,text,text,integer,numeric,numeric,jsonb,text),public.finish_voice_generation(uuid,text,text) to service_role;

create function public.start_voice_generation(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare r public.voice_generations; access jsonb;
begin
 select * into r from public.voice_generations where id=p_id for update;
 if r.id is null or r.status<>'reserved' then raise exception 'voice_dispatch_state'; end if;
 access:=public.resolve_organization_contract_access(r.organization_id);
 if not coalesce((access->>'allowed')::boolean,false) or (access->>'billing_organization_id')::uuid<>r.billing_organization_id then raise exception 'voice_contract_inactive'; end if;
 if not exists(select 1 from public.voice_projects where id=r.project_id and status='active') or (r.key_id is not null and not exists(select 1 from public.voice_api_keys where id=r.key_id and status='active' and (expires_at is null or expires_at>now()))) then raise exception 'voice_key_inactive'; end if;
 update public.voice_generations set status='processing',updated_at=now() where id=r.id;
end $$;
revoke all on function public.start_voice_generation(uuid) from public,anon,authenticated;
grant execute on function public.start_voice_generation(uuid) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('connectyhub-voice','connectyhub-voice',false,12582912,array['audio/mpeg']) on conflict(id) do nothing;

create function public.voice_usage_summary(p_org uuid,p_days integer default 30,p_admin boolean default false,p_project uuid default null)
returns jsonb language sql stable security definer set search_path=public as $$
 with f as (
  select * from public.voice_generations where (organization_id=p_org or (p_admin and p_org is null))
  and (p_project is null or project_id=p_project) and created_at>=now()-make_interval(days=>least(90,greatest(1,p_days)))
 ), daily as (
  select to_char(created_at at time zone 'UTC','YYYY-MM-DD') as "day",count(*) requests,sum(charged_credits) credits from f group by 1 order by 1
 ), models as (
  select model_id,count(*) requests,sum(charged_credits) credits from f group by 1
 ), voices as (
  select voice_id,count(*) requests,sum(charged_credits) credits from f group by 1
 ), operations as (
  select operation,count(*) requests,sum(charged_credits) credits from f group by 1
 ), accounts as (
  select f.organization_id,o.name,count(*) requests,sum(f.charged_credits) credits,
  sum(case when f.status='completed' then f.estimated_provider_cost else 0 end) estimated_cost,
  count(*) filter(where f.status in ('failed','uncertain')) errors
  from f join public.organizations o on o.id=f.organization_id group by 1,2
 )
 select jsonb_build_object('requests',count(*),'completed',count(*) filter(where status='completed'),'failed',count(*) filter(where status='failed'),
  'pending',count(*) filter(where status in ('reserved','processing','uncertain')),'credits',coalesce(sum(charged_credits),0),'reserved_credits',coalesce(sum(reserved_credits),0),
  'characters',coalesce(sum(characters) filter(where operation<>'voice_clone'),0),'days',p_days,'timezone','UTC',
  'daily',coalesce((select jsonb_agg(to_jsonb(daily)) from daily),'[]'),
  'models',coalesce((select jsonb_agg(to_jsonb(models)) from models),'[]'),
  'voices',coalesce((select jsonb_agg(to_jsonb(voices)) from voices),'[]'),
  'operations',coalesce((select jsonb_agg(to_jsonb(operations)) from operations),'[]'))
  ||case when p_admin then jsonb_build_object('accounts',coalesce((select jsonb_agg(to_jsonb(accounts)) from accounts),'[]'),
    'estimated_provider_cost',coalesce(sum(estimated_provider_cost) filter(where status='completed'),0),
    'effective_provider_cost',sum(effective_provider_cost) filter(where status='completed'),
    'cost_reconciled_requests',count(effective_provider_cost) filter(where status='completed'),
    'credit_value_brl',coalesce(sum(charged_credits),0)*.01,
    'estimated_margin_brl',coalesce(sum(charged_credits),0)*.01-coalesce(sum(estimated_provider_cost) filter(where status='completed'),0)) else '{}'::jsonb end from f;
$$;
revoke all on function public.voice_usage_summary(uuid,integer,boolean,uuid) from public,anon,authenticated;
grant execute on function public.voice_usage_summary(uuid,integer,boolean,uuid) to service_role;
