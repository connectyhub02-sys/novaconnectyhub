create table public.wallet_alert_queue(organization_id uuid primary key references public.organizations(id),updated_at timestamptz not null default now());
create table public.wallet_alert_state(organization_id uuid primary key references public.organizations(id),episode uuid not null default gen_random_uuid(),reference_credits numeric not null default 0,last_level integer not null default 100,absolute_low_credits numeric,absolute_critical_credits numeric,claimed_until timestamptz,updated_at timestamptz not null default now());
alter table public.wallet_alert_state add column last_notice_at timestamptz;
alter table public.wallet_alert_queue enable row level security;
alter table public.wallet_alert_state enable row level security;
revoke all on public.wallet_alert_queue,public.wallet_alert_state from anon,authenticated;
grant all on public.wallet_alert_queue,public.wallet_alert_state to service_role;
create function public.queue_wallet_alert() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' or new.balance_credits is distinct from old.balance_credits then
    insert into public.wallet_alert_queue(organization_id) values(new.organization_id) on conflict(organization_id) do update set updated_at=now();
    insert into public.wallet_alert_state(organization_id,reference_credits) values(new.organization_id,greatest(new.balance_credits,0)) on conflict(organization_id) do nothing;
    if tg_op='UPDATE' and new.balance_credits>old.balance_credits then
      update public.wallet_alert_state set reference_credits=greatest(reference_credits,new.balance_credits),
        episode=case when new.balance_credits>coalesce(absolute_low_credits,reference_credits*0.2) then gen_random_uuid() else episode end,
        last_level=case when new.balance_credits>coalesce(absolute_low_credits,reference_credits*0.2) then 100 else last_level end,updated_at=now()
        where organization_id=new.organization_id;
    end if;
  end if;
  return new;
end $$;
create trigger queue_wallet_alert after insert or update of balance_credits on public.credit_wallets for each row execute function public.queue_wallet_alert();
insert into public.wallet_alert_queue(organization_id) select organization_id from public.credit_wallets on conflict do nothing;
create function public.claim_wallet_alert(p_org uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare w public.credit_wallets;s public.wallet_alert_state;sub public.organization_subscriptions;ref numeric;level integer;access jsonb;
begin
 select * into w from public.credit_wallets where organization_id=p_org for update;
 access:=public.resolve_organization_contract_access(p_org);
 if not coalesce((access->>'allowed')::boolean,false) or access->>'plan_code' in ('trial','internal') then return null; end if;
 select * into sub from public.organization_subscriptions where id=(access->>'subscription_id')::uuid;
 if sub.id is null then return null; end if;
 ref:=coalesce((sub.metadata#>>'{commercial_terms,included_credits}')::numeric,sub.included_credits_granted,0);
 if ref<=0 then select coalesce(max(balance_after_credits),w.balance_credits,0) into ref from public.credit_transactions where organization_id=p_org and amount_credits>0; end if;
 insert into public.wallet_alert_state(organization_id,reference_credits) values(p_org,ref) on conflict do nothing;
 select * into s from public.wallet_alert_state where organization_id=p_org for update;
 ref:=greatest(ref,s.reference_credits);
 level:=case when w.balance_credits<=0 then 0 when w.balance_credits<=coalesce(s.absolute_critical_credits,ref*0.1) then 10 when w.balance_credits<=coalesce(s.absolute_low_credits,ref*0.2) then 20 else 100 end;
 if level>=s.last_level or level=100 then return null; end if;
 if s.last_notice_at>now()-interval '15 minutes' then return jsonb_build_object('deferred',true,'available_at',s.last_notice_at+interval '15 minutes');end if;
 update public.wallet_alert_state set claimed_until=now()+interval '2 minutes',reference_credits=ref where organization_id=p_org;
 return jsonb_build_object('organization_id',p_org,'subscription_id',sub.id,'episode',s.episode,'level',level,'reference_credits',ref,'balance_credits',w.balance_credits,'plan_code',sub.plan_code,'plan_name',coalesce(sub.metadata#>>'{commercial_terms,name}',sub.plan_code),'amount_brl',coalesce(sub.metadata#>>'{commercial_terms,price_brl}','0'));
end $$;
create function public.finish_wallet_alert(p_org uuid,p_episode uuid,p_level integer) returns void language plpgsql security definer set search_path=public as $$
begin update public.wallet_alert_state set last_level=least(last_level,p_level),last_notice_at=now(),claimed_until=null,updated_at=now() where organization_id=p_org and episode=p_episode; end $$;
revoke all on function public.queue_wallet_alert(),public.claim_wallet_alert(uuid),public.finish_wallet_alert(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_wallet_alert(uuid),public.finish_wallet_alert(uuid,uuid,integer) to service_role;
