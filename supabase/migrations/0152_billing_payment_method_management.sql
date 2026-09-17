-- Tokenization and default selection never create an invoice or charge.
alter table public.billing_asaas_card_vault alter column activation_attempt_id drop not null;
alter table public.billing_asaas_card_vault add column selectable boolean not null default false;
alter table public.billing_asaas_card_vault add column brand text;
alter table public.billing_asaas_card_vault add column last_digits text check(last_digits ~ '^[0-9]{4}$');
alter table public.billing_asaas_card_vault add column exp_month text check(exp_month ~ '^(0[1-9]|1[0-2])$');
alter table public.billing_asaas_card_vault add column exp_year text check(exp_year ~ '^[0-9]{4}$');
update public.billing_asaas_card_vault set selectable=true where status='active';

create table public.billing_payment_method_changes (
 id uuid primary key, organization_id uuid not null references public.organizations(id),
 subscription_id uuid not null references public.organization_subscriptions(id),
 actor_id uuid not null references auth.users(id), method_id uuid not null references public.billing_asaas_card_vault(id),
 previous_method_id uuid, topup_updated boolean not null, created_at timestamptz not null default now()
);
alter table public.billing_payment_method_changes enable row level security;
revoke all on public.billing_payment_method_changes from public,anon,authenticated;
grant all on public.billing_payment_method_changes to service_role;

create function public.set_billing_default_card(
 p_org uuid,p_actor uuid,p_subscription uuid,p_request uuid,p_expected_default uuid,
 p_expected_end timestamptz,p_consent text,p_method uuid default null,p_card jsonb default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.organization_subscriptions; previous uuid; target uuid; receipt public.billing_payment_method_changes; topup_changed boolean:=false;
begin
 -- Same lock order as managed renewals and automatic topups.
 perform 1 from public.organizations where id=p_org for update;
 if not exists(select 1 from public.organizations where id=p_org and owner_id=p_actor)
   and not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and role in ('owner','admin')) then raise exception 'CARD_FORBIDDEN';end if;
 select * into s from public.organization_subscriptions where id=p_subscription and organization_id=p_org for update;
 if not found then raise exception 'CARD_NOT_FOUND';end if;
 select * into receipt from public.billing_payment_method_changes where id=p_request;
 if found then
   if receipt.organization_id<>p_org or receipt.subscription_id<>s.id or receipt.actor_id<>p_actor then raise exception 'CARD_REQUEST_CONFLICT';end if;
   return jsonb_build_object('methodId',receipt.method_id,'topupUpdated',receipt.topup_updated,'replayed',true);
 end if;
 if s.status<>'active' or s.billing_provider<>'asaas' or s.provider_subscription_id is not null
   or s.metadata#>>'{commercial_terms,billing_cycle}'='one_time' or s.current_period_end is null or s.current_period_end<=now() then raise exception 'CARD_UNSUPPORTED';end if;
 if p_consent is distinct from 'connectyhub-card-default-v1' then raise exception 'CARD_CONSENT_REQUIRED';end if;
 if s.current_period_end is distinct from p_expected_end then raise exception 'CARD_STALE';end if;
 if exists(select 1 from public.billing_card_attempts where organization_id=p_org and state in ('processing','unknown','pending')) then raise exception 'CARD_PAYMENT_BUSY';end if;
 select id into previous from public.billing_asaas_card_vault where subscription_id=s.id and organization_id=p_org and status='active' for update;
 if previous is distinct from p_expected_default then raise exception 'CARD_STALE';end if;
 if p_method is not null then
   select id into target from public.billing_asaas_card_vault where id=p_method and subscription_id=s.id and organization_id=p_org and selectable and status in ('active','inactive') for update;
   if target is null then raise exception 'CARD_NOT_FOUND';end if;
   if exists(select 1 from public.billing_asaas_card_vault where id=target and exp_year is not null and exp_month is not null and (exp_year||exp_month)<to_char(now(),'YYYYMM')) then raise exception 'CARD_EXPIRED';end if;
 else
   if (select count(*) from public.billing_asaas_card_vault where organization_id=p_org and subscription_id=s.id and selectable)>=50 then raise exception 'CARD_LIMIT';end if;
   if p_card is null or coalesce(p_card->>'customer_id','')!~'^cus_[A-Za-z0-9]+$' or coalesce(p_card->>'token_encrypted','')!~'^v1:'
     or coalesce(p_card->>'last_digits','')!~'^[0-9]{4}$' or coalesce(p_card->>'exp_month','')!~'^(0[1-9]|1[0-2])$' or coalesce(p_card->>'exp_year','')!~'^[0-9]{4}$' then raise exception 'CARD_INVALID';end if;
   if (p_card->>'exp_year')||(p_card->>'exp_month')<to_char(now(),'YYYYMM') then raise exception 'CARD_EXPIRED';end if;
   if previous is not null and (p_card->>'customer_id') is distinct from (select customer_id from public.billing_asaas_card_vault where id=previous) then raise exception 'CARD_CUSTOMER_MISMATCH';end if;
   insert into public.billing_asaas_card_vault(organization_id,subscription_id,customer_id,token_encrypted,consent_version,status,selectable,brand,last_digits,exp_month,exp_year)
   values(p_org,s.id,p_card->>'customer_id',p_card->>'token_encrypted','connectyhub-advance-3-2-1-v1','inactive',true,left(p_card->>'brand',32),p_card->>'last_digits',p_card->>'exp_month',p_card->>'exp_year') returning id into target;
 end if;
 -- Both changes and the receipt commit together. Any failure preserves the old card.
 update public.billing_asaas_card_vault set status='inactive' where id=previous;
 update public.billing_asaas_card_vault set status='active',selectable=true,consent_at=now() where id=target;
 update public.credit_topup_policies set card_method_id=target,updated_at=now() where organization_id=p_org and card_method_id=previous;
 topup_changed:=found;
 insert into public.billing_payment_method_changes(id,organization_id,subscription_id,actor_id,method_id,previous_method_id,topup_updated)
 values(p_request,p_org,s.id,p_actor,target,previous,topup_changed);
 insert into public.platform_customer_journey(user_id,event_key,event_type,source_id,payload)
 values(p_actor,'billing_card_default:'||p_request,'billing_card_default_changed',target,
 jsonb_build_object('organization_id',p_org,'subscription_id',s.id,'previous_method_id',previous,'method_id',target,'consent_version',p_consent,'topup_updated',topup_changed,'charged',false));
 return jsonb_build_object('methodId',target,'topupUpdated',topup_changed,'replayed',false);
end $$;
revoke all on function public.set_billing_default_card(uuid,uuid,uuid,uuid,uuid,timestamptz,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.set_billing_default_card(uuid,uuid,uuid,uuid,uuid,timestamptz,text,uuid,jsonb) to service_role;

-- Cards activated by a later checkout become selectable; refunds revoke selection.
create or replace function public.activate_asaas_billing_vault() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.state='approved' and old.state is distinct from new.state then
  if exists(select 1 from billing_asaas_card_vault where activation_attempt_id=new.id and status='pending') then
   update billing_asaas_card_vault set status='inactive' where subscription_id=new.subscription_id and status='active';
   update billing_asaas_card_vault set status='active',selectable=true where activation_attempt_id=new.id and status='pending';
  end if;
 elsif new.state in ('refunded','cancelled') then
  update billing_asaas_card_vault set status='inactive',selectable=false where activation_attempt_id=new.id;
 end if;
 return new;
end $$;
