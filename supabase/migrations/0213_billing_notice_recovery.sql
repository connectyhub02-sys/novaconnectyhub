-- Missing transport is a recoverable dependency, not a delivery attempt.
alter table public.billing_notification_events add column delivery_blocked_reason text check(delivery_blocked_reason in ('sender_unavailable','platform_disabled'));
-- Only proven pre-dispatch failures are eligible. Never release uncertain sends.
update public.billing_notification_events set
 metadata=coalesce(metadata,'{}')||jsonb_build_object('pre_dispatch_attempts_before_recovery',attempts,'sender_recovery_at',now()),
 attempts=0,delivery_blocked_reason='sender_unavailable',next_attempt_at=now(),
 error_message='Aviso aguardando conexão de um remetente autorizado.'
where status='failed' and not delivery_uncertain and delivery_claimed_at is null and provider_message_id is null
 and error_message='Nenhum WhatsApp disponível para enviar o aviso. O envio será tentado novamente.';

create or replace function public.claim_billing_notice(p_event uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare n public.billing_notification_events; s public.organization_subscriptions; p public.billing_payments; expected timestamptz; wallet public.credit_wallets; alert public.wallet_alert_state; policy public.credit_topup_policies; available numeric; level integer;
begin
  select * into n from public.billing_notification_events where id=p_event for update;
  if not found or n.status not in ('pending','failed') or n.delivery_uncertain or n.delivery_claimed_at is not null or n.attempts>=5 or n.next_attempt_at>now() then return false; end if;
  select * into s from public.organization_subscriptions where id=n.subscription_id;
  expected:=nullif(n.metadata->>'current_period_end','')::timestamptz;
  if expected is not null and (coalesce(s.current_period_end,s.next_billing_at) is distinct from expected or (s.status='canceled' and n.event_type not in ('paid_access_ending','paid_access_ended'))) then
    update public.billing_notification_events set status='skipped',error_message='Ciclo alterado; aviso anterior cancelado.' where id=n.id; return false;
  end if;
  if n.payment_id is not null then
    select * into p from public.billing_payments where id=n.payment_id;
    if (n.event_type in ('subscription_pending','payment_pending','payment_rejected','payment_canceled','payment_started','checkout_payment_started','checkout_cart_updated') and p.status in ('approved','refunded'))
      or (n.event_type='payment_approved' and p.status<>'approved') then
      update public.billing_notification_events set status='skipped',error_message='Situação financeira alterada.' where id=n.id; return false;
    end if;
  end if;
  -- Time-sensitive copies must not be delivered after their advertised day.
  if n.event_type in ('paid_plan_three_days_remaining','paid_plan_one_day_remaining','paid_plan_due_today','paid_plan_renewal_reminder','paid_plan_grace_period')
     and (n.created_at at time zone 'America/Sao_Paulo')::date < (now() at time zone 'America/Sao_Paulo')::date then
    update public.billing_notification_events set status='skipped',next_attempt_at=null,error_message='Lembrete anterior substituído pelo estado atual.' where id=n.id; return false;
  end if;
  if n.event_type in ('paid_low_credits_20','paid_low_credits_10','paid_no_credits') and n.metadata->>'walletEpisode' is not null then
    select * into wallet from public.credit_wallets where organization_id=n.organization_id;
    select * into alert from public.wallet_alert_state where organization_id=n.organization_id;
    available:=greatest(0,wallet.balance_credits-wallet.reserved_credits);
    level:=case when available<=0 then 0 when available<=coalesce(alert.absolute_critical_credits,alert.reference_credits*0.1) then 10 when available<=coalesce(alert.absolute_low_credits,alert.reference_credits*0.2) then 20 else 100 end;
    if wallet.id is null or alert.episode::text is distinct from n.metadata->>'walletEpisode'
       or level is distinct from (case n.event_type when 'paid_no_credits' then 0 when 'paid_low_credits_10' then 10 else 20 end) then
      update public.billing_notification_events set status='skipped',next_attempt_at=null,error_message='Saldo ou nível do aviso alterado.' where id=n.id; return false;
    end if;
  end if;
  if n.event_type in ('credit_topup_enabled','credit_topup_disabled','credit_topup_action_required') then
    select * into policy from public.credit_topup_policies where organization_id=n.organization_id;
    if policy.organization_id is null or (n.metadata->>'policy_authorized_at' is not null and policy.authorized_at is distinct from (n.metadata->>'policy_authorized_at')::timestamptz)
       or (n.event_type='credit_topup_enabled' and not policy.enabled) or (n.event_type='credit_topup_disabled' and policy.enabled) then
      update public.billing_notification_events set status='skipped',next_attempt_at=null,error_message='Autorização de recarga alterada.' where id=n.id; return false;
    end if;
  end if;
  update public.billing_notification_events set delivery_claimed_at=now() where id=n.id;
  return true;
end $$;
revoke all on function public.claim_billing_notice(uuid) from public,anon,authenticated;
grant execute on function public.claim_billing_notice(uuid) to service_role;
