-- A campaign's first checkout requires explicit authorization. That temporary
-- hold must not become a permanent subscription opt-out after a paid card checkout.
-- No debit, invoice creation, period change or bulk backfill is performed here.
create function public.authorize_paid_campaign_card_renewal(p_payment uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare p public.billing_payments; s public.organization_subscriptions;
  a public.commercial_agreements; origin_attempt uuid;
begin
  perform 1 from public.organizations where id=(select organization_id from public.billing_payments where id=p_payment) for update;
  select * into s from public.organization_subscriptions where id=(select subscription_id from public.billing_payments where id=p_payment) for update;
  select * into p from public.billing_payments where id=p_payment and organization_id=s.organization_id;
  if p.id is null or p.status<>'approved' or p.provider<>'asaas'
    or s.billing_provider<>'asaas' or s.provider_subscription_id is not null
    or s.status not in ('active','past_due')
    or s.metadata->>'payment_id' is distinct from p.id::text
    or s.metadata->>'auto_charge_disabled' is distinct from 'true'
    or s.metadata->>'campaign_requires_authorization' is distinct from 'true'
    or p.payload->>'campaign_requires_authorization' is distinct from 'true'
    or s.metadata#>>'{commercial_terms,billing_cycle}' is distinct from 'recurring'
    or s.metadata#>>'{commercial_terms,custom_contract_id}' is not null
    or s.metadata->>'source' like 'admin\_%' escape '\'
    or not exists(select 1 from public.billing_payment_fulfillments where payment_id=p.id and subscription_id=s.id)
    then return false; end if;

  select agreement.* into a from public.commercial_agreements agreement
    join public.commercial_agreement_periods period on period.agreement_id=agreement.id
    where agreement.organization_id=s.organization_id and agreement.platform_subscription_id=s.id
      and agreement.owner_type='platform' and agreement.state='active' and not agreement.cancel_at_period_end
      and period.platform_payment_id=p.id and period.cycle=0 and period.paid_at is not null
      and s.metadata#>>'{campaign_pricing,agreement_id}'=agreement.id::text
      and p.payload#>>'{campaign_pricing,agreement_id}'=agreement.id::text;
  if a.id is null then return false; end if;

  -- A different card saved later cannot turn an initial Pix payment into card consent.
  -- The original approved card may be inactive because the customer replaced it.
  select attempt.id into origin_attempt from public.billing_card_attempts attempt
    join public.billing_asaas_card_vault vault on vault.activation_attempt_id=attempt.id
    where attempt.payment_id=p.id and attempt.organization_id=s.organization_id
      and attempt.subscription_id=s.id and attempt.state='approved'
      and attempt.provider_payment_id=p.provider_payment_id and attempt.amount=p.amount_brl
      and vault.organization_id=s.organization_id and vault.subscription_id=s.id
      and vault.consent_version='connectyhub-advance-3-2-1-v1'
      and vault.status in ('active','inactive') limit 1;
  if origin_attempt is null or not exists(select 1 from public.billing_asaas_card_vault
    where organization_id=s.organization_id and subscription_id=s.id and status='active'
      and consent_version='connectyhub-advance-3-2-1-v1') then return false; end if;

  update public.organization_subscriptions
    set metadata=(metadata-'auto_charge_disabled'-'campaign_requires_authorization')
      ||jsonb_build_object('campaign_card_renewal_authorization',jsonb_build_object(
        'payment_id',p.id,'attempt_id',origin_attempt,'consent_version','connectyhub-advance-3-2-1-v1')),
      updated_at=now() where id=s.id;
  insert into public.commercial_events(organization_id,buyer_user_id,campaign_id,agreement_id,event_key,event_type,payload)
    values(s.organization_id,a.buyer_user_id,a.campaign_id,a.id,'card-renewal-authorized:'||p.id,
      'campaign_card_renewal_authorized',jsonb_build_object('payment_id',p.id,'subscription_id',s.id,'attempt_id',origin_attempt))
    on conflict(event_key) do nothing;
  return true;
end $$;
revoke all on function public.authorize_paid_campaign_card_renewal(uuid) from public,anon,authenticated;
grant execute on function public.authorize_paid_campaign_card_renewal(uuid) to service_role;

create function public.authorize_fulfilled_campaign_card_renewal()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.authorize_paid_campaign_card_renewal(new.payment_id);
  return new;
end $$;
revoke all on function public.authorize_fulfilled_campaign_card_renewal() from public,anon,authenticated;
create trigger authorize_fulfilled_campaign_card_renewal
  after insert on public.billing_payment_fulfillments for each row
  execute function public.authorize_fulfilled_campaign_card_renewal();

-- Enforce subscription opt-outs inside the atomic claim as well as the worker.
create or replace function public.claim_managed_asaas_renewal(p_subscription uuid,p_payment uuid,p_attempt uuid,p_method uuid,p_expected_end timestamptz,p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.organization_subscriptions; p public.billing_payments; day date:=(p_now at time zone 'America/Sao_Paulo')::date; days integer; result jsonb;
begin
  perform 1 from public.organizations where id=(select organization_id from public.organization_subscriptions where id=p_subscription) for update;
  select * into s from public.organization_subscriptions where id=p_subscription for update;
  if not found or s.status<>'active' or s.current_period_end is distinct from p_expected_end or s.billing_provider<>'asaas'
    or s.metadata->>'auto_charge_disabled'='true' or s.provider_subscription_id is not null or s.metadata#>>'{commercial_terms,billing_cycle}'='one_time' then return null; end if;
  days:=(s.current_period_end at time zone 'America/Sao_Paulo')::date-day;
  if days not between 1 and 3 or extract(hour from p_now at time zone 'America/Sao_Paulo')<9 or p_now>=s.current_period_end then return null; end if;
  if not exists(select 1 from public.billing_asaas_card_vault where id=p_method and organization_id=s.organization_id and subscription_id=s.id and status='active') then return null; end if;
  if exists(select 1 from public.billing_card_attempts where subscription_id=s.id and automatic_period_end=p_expected_end and automatic_day=day) then return null; end if;
  select * into p from public.billing_payments where id=p_payment and subscription_id=s.id and organization_id=s.organization_id;
  if not found or p.provider<>'asaas' or p.payload->>'checkout_kind'<>'renewal'
    or (p.payload->>'previous_current_period_end')::timestamptz is distinct from p_expected_end or p.payload->>'auto_charge_disabled'='true'
    or p.payload->>'pix_creation_pending'='true' or p.payload->>'pix_qr_code' is not null then return null; end if;
  if exists(select 1 from public.billing_card_attempts where payment_id=p.id and state in ('processing','unknown','pending','approved')) then return null; end if;
  result:=public.claim_native_billing_card(s.organization_id,p.id,p_attempt,p.checkout_revision,p.amount_brl,coalesce((p.payload#>>'{campaign_pricing,next_price_brl}')::numeric,(p.payload#>>'{commercial_terms,price_brl}')::numeric)+(select coalesce(sum(total_brl),0) from public.billing_invoice_items where invoice_id=p.invoice_id and item_type<>'plan' and metadata->>'recurrence'<>'one_time'),'billing_card:'||p_attempt);
  if coalesce((result->>'claimed')::boolean,false) then
    update public.billing_card_attempts set automatic_day=day,automatic_period_end=p_expected_end,managed_renewal=true where id=p_attempt;
    update public.billing_payments set payload=payload||jsonb_build_object('managed_external_reference','billing_managed:'||p.id,'asaas_customer_id',(select customer_id from public.billing_asaas_card_vault where id=p_method)) where id=p.id;
    select jsonb_build_object('claimed',true,'attempt',to_jsonb(a)) into result from public.billing_card_attempts a where a.id=p_attempt;
  end if;
  return result;
end $$;
revoke all on function public.claim_managed_asaas_renewal(uuid,uuid,uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_managed_asaas_renewal(uuid,uuid,uuid,uuid,timestamptz,timestamptz) to service_role;
