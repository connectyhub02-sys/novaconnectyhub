-- Credit-based external AI: no customer-configured project or time-window caps.
-- Obsolete cap columns remain for historical schema compatibility only.
-- Preserve wallet locks, reservations, contract access and idempotent settlement.
alter table public.ai_projects alter column requests_per_minute drop not null;
alter table public.ai_projects alter column requests_per_minute set default null;
update public.ai_projects set requests_per_minute=null,monthly_credit_limit=null;
create or replace function public.claim_ai_request(p_key uuid,p_idempotency text,p_hash text) returns jsonb
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
  insert into public.ai_requests(organization_id,project_id,key_id,idempotency_key,request_hash)
    values((access->>'billing_organization_id')::uuid,p.id,k.id,p_idempotency,p_hash) returning * into r;
  update public.ai_api_keys set last_used_at=now() where id=k.id;
  return to_jsonb(r)||jsonb_build_object('claimed',true);
end $$;

create function public.create_ai_project_with_key(p_org uuid,p_name text,p_hash text,p_prefix text) returns uuid
language plpgsql security definer set search_path=public as $$
declare project_id uuid;
begin
  insert into public.ai_projects(organization_id,name) values(p_org,p_name) returning id into project_id;
  insert into public.ai_api_keys(project_id,name,key_hash,key_prefix) values(project_id,'Chave do projeto',p_hash,p_prefix);
  return project_id;
end $$;
revoke all on function public.create_ai_project_with_key(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.create_ai_project_with_key(uuid,text,text,text) to service_role;

create function public.ai_usage_summary(p_org uuid,p_days integer default 30,p_project uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare first_day date; result jsonb;
begin
  if p_days not in (7,30,90) or p_days is null then raise exception 'INVALID_PERIOD'; end if;
  if p_project is not null and not exists(select 1 from public.ai_projects where id=p_project and organization_id=p_org) then raise exception 'PROJECT_NOT_FOUND'; end if;
  first_day:=(now() at time zone 'America/Sao_Paulo')::date-(p_days-1);
  with filtered as materialized (
    select r.project_id,r.created_at,r.charged_credits,r.status from public.ai_requests r
    where r.organization_id=p_org and (p_project is null or r.project_id=p_project)
      and r.created_at >= first_day::timestamp at time zone 'America/Sao_Paulo'
      and r.created_at <= now()
  ), daily as (
    select (created_at at time zone 'America/Sao_Paulo')::date as usage_day,
      sum(charged_credits) credits,count(*) requests,
      count(*) filter(where status='completed') completed,count(*) filter(where status='failed') failed
    from filtered group by 1
  )
  select jsonb_build_object(
    'days',p_days,
    'totals',(select jsonb_build_object('credits',coalesce(sum(charged_credits),0),'requests',count(*),'completed',count(*) filter(where status='completed'),'failed',count(*) filter(where status='failed'),'pending',count(*) filter(where status in ('preparing','reserved','processing','uncertain'))) from filtered),
    'daily',(select jsonb_agg(jsonb_build_object('date',to_char(d.usage_day,'YYYY-MM-DD'),'credits',coalesce(u.credits,0),'requests',coalesce(u.requests,0),'completed',coalesce(u.completed,0),'failed',coalesce(u.failed,0)) order by d.usage_day) from generate_series(first_day::timestamp,first_day::timestamp+(p_days-1)*interval '1 day',interval '1 day') d(usage_day) left join daily u on u.usage_day=d.usage_day::date),
    'projects',coalesce((select jsonb_agg(v.item order by v.credits desc) from (select sum(f.charged_credits) credits,jsonb_build_object('id',p.id,'name',p.name,'credits',sum(f.charged_credits),'requests',count(*)) item from filtered f join public.ai_projects p on p.id=f.project_id group by p.id,p.name) v),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.ai_usage_summary(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.ai_usage_summary(uuid,integer,uuid) to service_role;

create or replace function public.reserve_ai_credits(p_request uuid,p_amount numeric,p_model text,p_rates jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare r public.ai_requests; w public.credit_wallets; p public.ai_projects;
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
  update public.credit_wallets set reserved_credits=reserved_credits+p_amount,updated_at=now() where id=w.id;
  update public.ai_requests set status='reserved',reserved_credits=p_amount,model_id=p_model,rate_snapshot=p_rates,updated_at=now() where id=r.id;
end $$;
