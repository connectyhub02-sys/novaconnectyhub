-- Read-only, service-scoped operational view; contains no holder or card secrets.
create function public.billing_reliability_snapshot() returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'checkedAt',now(),
  'blockedNotices',(select count(*) from billing_notification_events where status in ('pending','failed') and delivery_blocked_reason is not null),
  'exhaustedNotices',(select count(*) from billing_notification_events where status='failed' and attempts>=5 and not delivery_uncertain and delivery_blocked_reason is null),
  'uncertainNotices',(select count(*) from billing_notification_events where status='failed' and delivery_uncertain),
  'overdueNotices',(select count(*) from billing_notification_events where status in ('pending','failed') and next_attempt_at<now()-interval '30 minutes' and attempts<5 and delivery_blocked_reason is null and not delivery_uncertain),
  'unreconciledPayments',(select count(*) from billing_card_attempts where (state in ('processing','unknown','pending') or effects_completed_state is null) and updated_at<now()-interval '15 minutes'),
  'topupErrors',(select count(*) from credit_topup_policies where last_error_code is not null),
  'pixPending',(select count(*) from billing_pix_authorizations where (state in ('unknown','dispatching','preparing') or (state='REFUSED' and not initial_payment_absent and not initial_effects_completed)) and created_at<now()-interval '15 minutes'),
  'missedRenewals',(select count(*) from organization_subscriptions s where coalesce(s.metadata#>>'{commercial_terms,billing_cycle}','recurring')='recurring' and not exists(select 1 from platform_billing_settings where setting_key='default' and metadata#>>'{renewal_policy,card_charge_attempt_enabled}'='false') and s.status in ('active','past_due') and coalesce(s.metadata->>'auto_charge_disabled','false')<>'true'
    and exists(select 1 from billing_asaas_card_vault c where c.subscription_id=s.id and c.status='active')
    and (s.current_period_end at time zone 'America/Sao_Paulo')::date-(now() at time zone 'America/Sao_Paulo')::date between 1 and 3
    and extract(hour from now() at time zone 'America/Sao_Paulo')>=10
    and not exists(select 1 from billing_card_attempts a where a.subscription_id=s.id and a.automatic_period_end=s.current_period_end and a.automatic_day=(now() at time zone 'America/Sao_Paulo')::date))
 );
$$;
revoke all on function public.billing_reliability_snapshot() from public,anon,authenticated;
grant execute on function public.billing_reliability_snapshot() to service_role;
