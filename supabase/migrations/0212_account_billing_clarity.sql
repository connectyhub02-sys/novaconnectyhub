-- Read totals in the database: PostgREST's row cap must not truncate account usage.
create function public.account_usage_totals(p_org uuid, p_now timestamptz default now())
returns jsonb language sql stable security definer set search_path=public as $$
  with events as (
    select feature_code, coalesce(connecty_charge_credits,0) credits,
      coalesce(occurred_at,created_at) event_at
    from public.usage_events
    where organization_id=p_org and status='completed'
      and coalesce(occurred_at,created_at)>=p_now-interval '30 days'
      and coalesce(occurred_at,created_at)<=p_now
  ), features as (
    select feature_code, sum(credits) credits, count(*) events from events group by feature_code
  )
  select jsonb_build_object(
    'totalChargeCredits30d',coalesce(sum(credits),0),
    'todayChargeCredits',coalesce(sum(credits) filter(where event_at >=
      (date_trunc('day',p_now at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')),0),
    'eventCount30d',count(*),'lastEventAt',max(event_at),
    'features',coalesce((select jsonb_agg(jsonb_build_object('featureCode',feature_code,'chargeCredits',credits,'events',events)) from features),'[]'::jsonb),
    'referenceCredits',(select reference_credits from public.wallet_alert_state where organization_id=p_org)
  ) from events;
$$;
revoke all on function public.account_usage_totals(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.account_usage_totals(uuid,timestamptz) to service_role;

-- Remove only an unused saved card from future selection. Preserve financial history.
create function public.remove_saved_billing_card(p_org uuid,p_actor uuid,p_subscription uuid,p_method uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare card public.billing_asaas_card_vault;
begin
  perform 1 from public.organizations where id=p_org for update;
  if not exists(select 1 from public.organizations where id=p_org and owner_id=p_actor)
    and not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_actor and role in ('owner','admin')) then
    raise exception 'CARD_FORBIDDEN';
  end if;
  perform 1 from public.organization_subscriptions where id=p_subscription and organization_id=p_org for update;
  if not found then raise exception 'CARD_NOT_FOUND'; end if;
  select * into card from public.billing_asaas_card_vault
    where id=p_method and subscription_id=p_subscription and organization_id=p_org for update;
  if not found then raise exception 'CARD_NOT_FOUND'; end if;
  if card.status<>'inactive' then raise exception 'CARD_IN_USE'; end if;
  if exists(select 1 from public.credit_topup_policies where organization_id=p_org and card_method_id=p_method and enabled) then
    raise exception 'CARD_IN_USE';
  end if;
  if exists(select 1 from public.billing_card_attempts where organization_id=p_org and state in ('processing','unknown','pending')) then
    raise exception 'CARD_PAYMENT_BUSY';
  end if;
  if not card.selectable then return jsonb_build_object('removed',true); end if;
  update public.billing_asaas_card_vault set selectable=false where id=p_method;
  insert into public.platform_customer_journey(user_id,event_key,event_type,source_id,payload)
    values(p_actor,'billing_card_removed:'||p_method,'billing_card_removed',p_method,
      jsonb_build_object('organization_id',p_org,'subscription_id',p_subscription,'charged',false));
  return jsonb_build_object('removed',true);
end $$;
revoke all on function public.remove_saved_billing_card(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.remove_saved_billing_card(uuid,uuid,uuid,uuid) to service_role;
