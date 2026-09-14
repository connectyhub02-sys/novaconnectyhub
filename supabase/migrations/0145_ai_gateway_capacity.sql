-- Operational guardrails, not spending caps or a change to commercial prices.
-- Review these against the provider project's quota before increasing traffic.
create table public.ai_gateway_policy (
  singleton boolean primary key default true check(singleton),
  global_requests_per_minute int not null default 120 check(global_requests_per_minute>0),
  organization_requests_per_minute int not null default 30 check(organization_requests_per_minute>0),
  global_concurrency int not null default 16 check(global_concurrency>0),
  organization_concurrency int not null default 4 check(organization_concurrency>0),
  updated_at timestamptz not null default now()
);
insert into public.ai_gateway_policy(singleton) values(true);
create table public.ai_gateway_windows (
  scope text not null, minute timestamptz not null, requests int not null,
  primary key(scope,minute)
);
alter table public.ai_gateway_policy enable row level security;
alter table public.ai_gateway_windows enable row level security;
revoke all on public.ai_gateway_policy,public.ai_gateway_windows from public,anon,authenticated;
grant all on public.ai_gateway_policy,public.ai_gateway_windows to service_role;

create function public.admit_ai_gateway_request(p_org uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare policy public.ai_gateway_policy; minute_start timestamptz:=date_trunc('minute',clock_timestamp()); n int;
begin
  if p_org is null then raise exception 'ai_key_inactive'; end if;
  -- One short lock serializes global and wallet counters, including linked projects.
  perform pg_advisory_xact_lock(1445,1);
  select * into strict policy from public.ai_gateway_policy where singleton;
  if coalesce((select requests from public.ai_gateway_windows where scope='global' and minute=minute_start),0)>=policy.global_requests_per_minute
    or coalesce((select requests from public.ai_gateway_windows where scope=p_org::text and minute=minute_start),0)>=policy.organization_requests_per_minute then
    raise exception 'ai_rate_limit_requests';
  end if;
  insert into public.ai_gateway_windows(scope,minute,requests) values('global',minute_start,1),(p_org::text,minute_start,1)
    on conflict(scope,minute) do update set requests=ai_gateway_windows.requests+1;
  delete from public.ai_gateway_windows where minute<minute_start-interval '5 minutes';
  return jsonb_build_object('requests_per_minute',policy.organization_requests_per_minute,'concurrency',policy.organization_concurrency);
end $$;
revoke all on function public.admit_ai_gateway_request(uuid) from public,anon,authenticated;
grant execute on function public.admit_ai_gateway_request(uuid) to service_role;

create function public.guard_ai_request_capacity() returns trigger
language plpgsql security definer set search_path=public as $$
declare policy public.ai_gateway_policy; total int; owned int;
begin
  perform pg_advisory_xact_lock(1445,2);
  select * into strict policy from public.ai_gateway_policy where singleton;
  -- Finished/uncertain requests hold no execution slot. Stale requests retain
  -- their wallet reservation but cannot permanently deny new work.
  select count(*),count(*) filter(where organization_id=new.organization_id) into total,owned
    from public.ai_requests where status in ('preparing','reserved','processing')
      and updated_at>clock_timestamp()-interval '3 minutes';
  if total>=policy.global_concurrency or owned>=policy.organization_concurrency then raise exception 'ai_rate_limit_concurrency'; end if;
  return new;
end $$;
revoke all on function public.guard_ai_request_capacity() from public,anon,authenticated;
grant execute on function public.guard_ai_request_capacity() to service_role;
create trigger ai_request_capacity before insert on public.ai_requests
for each row execute function public.guard_ai_request_capacity();
select public.assert_ai_financial_rpc_boundary();
