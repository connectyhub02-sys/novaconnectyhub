-- Card replacement is credential maintenance, never a payment attempt.
-- Extends 0152: reuse the existing selectable cards and last_digits columns.

create table public.billing_card_replacements (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  actor_id uuid not null references auth.users(id),
  -- Keep a denied cross-org target as audit evidence without revealing its existence.
  subscription_id uuid not null,
  old_method_id uuid references public.billing_asaas_card_vault(id),
  new_method_id uuid references public.billing_asaas_card_vault(id),
  state text not null check (state in ('processing','succeeded','failed')),
  result_code text,
  consent_version text not null default 'connectyhub-card-replacement-v1',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index billing_card_replacements_org_time on public.billing_card_replacements(organization_id,created_at desc);
alter table public.billing_card_replacements enable row level security;
revoke all on public.billing_card_replacements from public,anon,authenticated;
grant all on public.billing_card_replacements to service_role;

-- Callers hold the organization then subscription lock when committing a change,
-- matching managed renewal and credit top-up lock ordering.
create function public.billing_card_replacement_block(p_org uuid,p_actor uuid,p_subscription uuid) returns text
language plpgsql security definer set search_path=public as $$
declare s public.organization_subscriptions;
begin
  if not exists(select 1 from public.organizations where id=p_org and owner_id=p_actor)
    and not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and role in ('owner','admin')) then return 'forbidden'; end if;
  select * into s from public.organization_subscriptions where id=p_subscription and organization_id=p_org;
  if not found then return 'not_found'; end if;
  if s.status is distinct from 'active' or s.subscription_kind is distinct from 'plan' or s.plan_code in ('trial','internal')
    or s.current_period_end is null or s.current_period_end<=now() then return 'inactive_plan'; end if;
  if s.billing_provider is distinct from 'asaas' or s.provider_subscription_id is not null then return 'unsupported_provider'; end if;
  if s.metadata#>>'{commercial_terms,billing_cycle}'='one_time' or s.canceled_at is not null
    or exists(select 1 from public.commercial_agreements where platform_subscription_id=s.id and (cancel_at_period_end or state in ('ended','canceled','cancelled')))
    or not exists(select 1 from public.billing_asaas_card_vault where organization_id=p_org and subscription_id=s.id and status='active') then return 'automatic_renewal_required'; end if;
  -- Includes automatic top-ups that may be using the same card in another purchase.
  if exists(select 1 from public.billing_card_attempts where organization_id=p_org and state in ('processing','unknown','pending')) then return 'billing_busy'; end if;
  return null;
end $$;

create function public.begin_billing_card_replacement(p_org uuid,p_actor uuid,p_subscription uuid,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r public.billing_card_replacements; v public.billing_asaas_card_vault; blocked text;
begin
  perform 1 from public.organizations where id=p_org for update;
  select * into r from public.billing_card_replacements where id=p_request;
  if found then
    if r.organization_id<>p_org or r.actor_id<>p_actor or r.subscription_id<>p_subscription then return jsonb_build_object('state','failed','result_code','request_conflict'); end if;
    return jsonb_build_object('state',r.state,'result_code',r.result_code,'claimed',false);
  end if;
  perform 1 from public.organization_subscriptions where id=p_subscription and organization_id=p_org for update;
  blocked:=public.billing_card_replacement_block(p_org,p_actor,p_subscription);
  if blocked is null and (select count(*) from public.billing_card_replacements where organization_id=p_org and created_at>now()-interval '1 minute')>=5 then blocked:='rate_limited'; end if;
  select * into v from public.billing_asaas_card_vault where organization_id=p_org and subscription_id=p_subscription and status='active';
  insert into public.billing_card_replacements(id,organization_id,actor_id,subscription_id,old_method_id,state,result_code,completed_at)
    values(p_request,p_org,p_actor,p_subscription,case when blocked is null then v.id end,case when blocked is null then 'processing' else 'failed' end,blocked,case when blocked is not null then now() end);
  return jsonb_build_object('claimed',blocked is null,'state',case when blocked is null then 'processing' else 'failed' end,'result_code',blocked,'customer_id',case when blocked is null then v.customer_id end);
end $$;

create function public.finish_billing_card_replacement(p_org uuid,p_actor uuid,p_subscription uuid,p_request uuid,p_token_encrypted text default null,p_last_four text default null,p_failure text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r public.billing_card_replacements; v public.billing_asaas_card_vault; blocked text; new_id uuid;
begin
  perform 1 from public.organizations where id=p_org for update;
  perform 1 from public.organization_subscriptions where id=p_subscription and organization_id=p_org for update;
  select * into r from public.billing_card_replacements where id=p_request and organization_id=p_org and actor_id=p_actor and subscription_id=p_subscription for update;
  if not found then return jsonb_build_object('state','failed','result_code','not_found'); end if;
  if r.state<>'processing' then return jsonb_build_object('state',r.state,'result_code',r.result_code); end if;
  blocked:=public.billing_card_replacement_block(p_org,p_actor,p_subscription);
  if blocked is null and p_failure is not null then
    blocked:=case when p_failure in ('invalid_input','tokenization_rejected','gateway_unavailable','gateway_configuration','pix_automatic_unavailable') then p_failure else 'internal_error' end;
  end if;
  select * into v from public.billing_asaas_card_vault where id=r.old_method_id and organization_id=p_org and subscription_id=p_subscription and status='active' for update;
  if blocked is null and not found then blocked:='card_changed'; end if;
  if blocked is null and (p_token_encrypted is null or length(p_token_encrypted)<20 or p_last_four is null or p_last_four !~ '^[0-9]{4}$') then blocked:='invalid_input'; end if;
  if blocked is null then
    update public.billing_asaas_card_vault set status='inactive' where id=v.id;
    insert into public.billing_asaas_card_vault(organization_id,subscription_id,customer_id,token_encrypted,consent_version,status,last_digits,selectable)
      values(p_org,p_subscription,v.customer_id,p_token_encrypted,v.consent_version,'active',p_last_four,true) returning id into new_id;
    -- Preserve enabled state, amounts, caps and authorization. No top-up is dispatched.
    update public.credit_topup_policies set card_method_id=new_id,updated_at=now() where organization_id=p_org and card_method_id=v.id;
  end if;
  update public.billing_card_replacements set state=case when blocked is null then 'succeeded' else 'failed' end,
    result_code=coalesce(blocked,'replaced'),new_method_id=new_id,completed_at=now() where id=r.id;
  return jsonb_build_object('state',case when blocked is null then 'succeeded' else 'failed' end,'result_code',coalesce(blocked,'replaced'));
end $$;

revoke all on function public.billing_card_replacement_block(uuid,uuid,uuid),public.begin_billing_card_replacement(uuid,uuid,uuid,uuid),public.finish_billing_card_replacement(uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.billing_card_replacement_block(uuid,uuid,uuid),public.begin_billing_card_replacement(uuid,uuid,uuid,uuid),public.finish_billing_card_replacement(uuid,uuid,uuid,uuid,text,text,text) to service_role;
