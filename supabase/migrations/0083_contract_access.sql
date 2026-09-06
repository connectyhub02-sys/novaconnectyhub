-- Contract scope is explicit; independently paid organizations remain independent.
alter table public.organizations add column if not exists billing_organization_id uuid references public.organizations(id);
create index if not exists organizations_billing_organization_idx on public.organizations(billing_organization_id);

create or replace function public.validate_billing_organization_scope() returns trigger
language plpgsql set search_path=public as $$
declare parent public.organizations;
begin
  if new.billing_organization_id is null or new.billing_organization_id=new.id then return new; end if;
  select * into parent from public.organizations where id=new.billing_organization_id;
  if not found or parent.owner_id is distinct from new.owner_id or parent.billing_organization_id is not null then
    raise exception 'INVALID_BILLING_ORGANIZATION_SCOPE';
  end if;
  return new;
end $$;
create trigger validate_billing_organization_scope before insert or update of billing_organization_id,owner_id on public.organizations
for each row execute function public.validate_billing_organization_scope();

create or replace function public.resolve_organization_contract_access(p_organization uuid,p_now timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare o public.organizations; target public.organizations; s public.organization_subscriptions;
  deadline timestamptz; period_end timestamptz; policy jsonb; grace integer:=3;
  allowed boolean:=false; reason text:='inactive';
begin
  select * into target from public.organizations where id=p_organization;
  if not found then return jsonb_build_object('allowed',false,'reason','not_found','organization_id',p_organization); end if;
  select * into o from public.organizations where id=coalesce(target.billing_organization_id,target.id);
  if lower(target.status) in ('suspended','paused','blocked','inactive','archived')
    or lower(o.status) in ('suspended','paused','blocked','inactive','archived') then
    reason:='administrative_suspension';
  elsif o.plan_code='internal' then allowed:=true; reason:='internal';
  elsif o.plan_code='trial' then
    select max(c.cycle_end) into period_end from public.billing_cycles c join public.billing_plans p on p.id=c.plan_id
      where c.organization_id=o.id and p.plan_code='trial';
    period_end:=coalesce(period_end,o.created_at+interval '7 days');
    deadline:=period_end; allowed:=o.status<>'trial_pending' and p_now<deadline;
    reason:=case when o.status='trial_pending' then 'signup_required' when allowed then 'trial_active' else 'trial_expired' end;
  else
    select * into s from public.organization_subscriptions where organization_id=o.id and plan_code=o.plan_code and subscription_kind='plan'
      and status in ('active','past_due','canceled','paused')
      order by current_period_end desc nulls last,created_at desc limit 1;
    period_end:=coalesce(s.current_period_end,s.next_billing_at);
    if period_end is null then
      select max(c.cycle_end) into period_end from public.billing_cycles c join public.billing_plans p on p.id=c.plan_id
        where c.organization_id=o.id and p.plan_code=o.plan_code;
    end if;
    select metadata->'renewal_policy' into policy from public.platform_billing_settings where setting_key='default';
    grace:=greatest(coalesce((policy->>'grace_period_days')::integer,3),coalesce((policy->>'suspend_after_days')::integer,3));
    if s.status in ('cancelled','canceled','expired') or s.metadata#>>'{commercial_terms,billing_cycle}'='one_time' then grace:=0; end if;
    deadline:=period_end+make_interval(days=>greatest(0,least(grace,30)));
    allowed:=s.status is distinct from 'paused' and deadline is not null and p_now<deadline;
    reason:=case when s.status='paused' then 'administrative_suspension' when period_end is null then 'contract_missing' when not allowed then 'paid_expired' when p_now>=period_end then 'grace_period' else 'paid_active' end;
  end if;
  return jsonb_build_object('organization_id',target.id,'billing_organization_id',o.id,'plan_code',o.plan_code,
    'allowed',allowed,'reason',reason,'period_end',period_end,'blocked_at',deadline,'subscription_id',s.id);
end $$;
revoke all on function public.resolve_organization_contract_access(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.resolve_organization_contract_access(uuid,timestamptz) to service_role;

create or replace function public.can_operate_organization(p_organization uuid) returns boolean
language plpgsql stable security definer set search_path=public as $$
begin
  if not exists(select 1 from public.organization_members where organization_id=p_organization and user_id=auth.uid()) then return false; end if;
  return coalesce((public.resolve_organization_contract_access(p_organization)->>'allowed')::boolean,false);
end $$;
revoke all on function public.can_operate_organization(uuid) from public,anon;
grant execute on function public.can_operate_organization(uuid) to authenticated,service_role;

create or replace function public.suspend_expired_platform_contract(p_subscription uuid,p_expected_end timestamptz,p_now timestamptz default now()) returns boolean
language plpgsql security definer set search_path=public as $$
declare s public.organization_subscriptions; decision jsonb;
begin
  -- Same organization-first lock order as payment activation.
  perform 1 from public.organizations where id=(select organization_id from public.organization_subscriptions where id=p_subscription) for update;
  select * into s from public.organization_subscriptions where id=p_subscription for update;
  if not found or coalesce(s.current_period_end,s.next_billing_at) is distinct from p_expected_end then return false; end if;
  decision:=public.resolve_organization_contract_access(s.organization_id,p_now);
  if decision->>'reason'<>'paid_expired' then return false; end if;
  update public.organization_subscriptions set status=case when status='canceled' or metadata#>>'{commercial_terms,billing_cycle}'='one_time' then 'canceled' else 'past_due' end,
    metadata=coalesce(metadata,'{}')||jsonb_build_object('past_due_source','paid_lifecycle_sweep','past_due_at',p_now),updated_at=p_now where id=s.id;
  update public.organizations set status='past_due',updated_at=p_now where id=s.organization_id and status in ('active','past_due');
  update public.billing_cycles set status='closed' where subscription_id=s.id and status='open' and cycle_end<=p_now;
  return true;
end $$;
revoke all on function public.suspend_expired_platform_contract(uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.suspend_expired_platform_contract(uuid,timestamptz,timestamptz) to service_role;
