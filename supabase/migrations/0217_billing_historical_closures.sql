-- Administrative closure is evidence, not a successful delivery or a priced usage.
-- No historical records are changed by this migration.
alter table public.usage_events
  add column billing_closed_at timestamptz,
  add column billing_closure_reason text,
  add constraint usage_billing_closure_pair check ((billing_closed_at is null) = (billing_closure_reason is null));
alter table public.billing_notification_events
  add column billing_closed_at timestamptz,
  add column billing_closure_reason text,
  add constraint notice_billing_closure_pair check ((billing_closed_at is null) = (billing_closure_reason is null));
create index usage_billing_closures on public.usage_events(billing_closed_at desc) where billing_closed_at is not null;
create index notice_billing_closures on public.billing_notification_events(billing_closed_at desc) where billing_closed_at is not null;

create function public.guard_billing_historical_closure() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if TG_OP='UPDATE' and old.billing_closed_at is not null then
    if new.billing_closed_at is distinct from old.billing_closed_at
      or new.billing_closure_reason is distinct from old.billing_closure_reason
      or new.id is distinct from old.id or new.organization_id is distinct from old.organization_id then
      raise exception 'Historical billing closure is immutable.';
    end if;
  end if;
  if new.billing_closed_at is not null then
    if TG_TABLE_NAME='usage_events' then
      if new.connecty_charge_credits<>0 or new.connecty_revenue_estimate<>0
        or new.debit_retry_at is not null or new.status<>'pending'
        or exists(select 1 from public.credit_transactions where usage_event_id=new.id and transaction_type::text='debit') then
        raise exception 'Closed historical usage cannot be charged or retried.';
      end if;
    else
      if new.status<>'skipped' or new.next_attempt_at is not null or new.delivery_claimed_at is not null then
        raise exception 'Closed historical notice cannot be queued or resent.';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger guard_usage_historical_closure before insert or update on public.usage_events
for each row execute function public.guard_billing_historical_closure();
create trigger guard_notice_historical_closure before insert or update on public.billing_notification_events
for each row execute function public.guard_billing_historical_closure();

-- Guard the ledger as well as the usage row, including alternate debit callers.
create function public.guard_closed_usage_debit() returns trigger
language plpgsql security definer set search_path=public as $$
declare closed_at timestamptz;
begin
  if new.transaction_type::text='debit' and new.usage_event_id is not null then
    select billing_closed_at into closed_at from public.usage_events where id=new.usage_event_id for update;
    if closed_at is not null then raise exception 'Historical usage was closed without a charge.'; end if;
  end if;
  return new;
end $$;
create trigger guard_closed_usage_debit before insert or update on public.credit_transactions
for each row execute function public.guard_closed_usage_debit();

-- Only the platform server can inspect cross-customer operational details.
-- No phone, card, provider response, credentials or message body is returned.
create function public.billing_attention_details() returns jsonb
language sql stable security definer set search_path=public as $$
with pending as (
 select n.id,n.organization_id,n.created_at as occurred_at,
   case when delivery_blocked_reason is not null then 'blockedNotices'
     when delivery_uncertain then 'uncertainNotices'
     when attempts>=5 then 'exhaustedNotices' else 'overdueNotices' end as category,
   n.event_type as detail
 from billing_notification_events n where n.billing_closed_at is null and n.status in ('pending','failed')
   and (delivery_blocked_reason is not null or (n.status='failed' and (delivery_uncertain or attempts>=5))
     or (next_attempt_at<now()-interval '30 minutes' and attempts<5 and not delivery_uncertain))
 union all
 select id,organization_id,occurred_at,'missingRate',feature_code||coalesce(' ('||model_id||')','')
 from usage_events where status='pending' and error_message='billing_rate_missing' and billing_closed_at is null
 union all
 select id,organization_id,updated_at,'unreconciledPayments',''
 from billing_card_attempts where (state in ('processing','unknown','pending') or effects_completed_state is null) and updated_at<now()-interval '15 minutes'
 union all
 select organization_id,organization_id,updated_at,'topupErrors',''
 from credit_topup_policies where last_error_code is not null
 union all
 select id,organization_id,created_at,'pixPending',''
 from billing_pix_authorizations where (state in ('unknown','dispatching','preparing') or (state='REFUSED' and not initial_payment_absent and not initial_effects_completed)) and created_at<now()-interval '15 minutes'
 union all
 select s.id,s.organization_id,s.current_period_end,'missedRenewals',''
 from organization_subscriptions s where coalesce(s.metadata#>>'{commercial_terms,billing_cycle}','recurring')='recurring'
   and not exists(select 1 from platform_billing_settings where setting_key='default' and metadata#>>'{renewal_policy,card_charge_attempt_enabled}'='false')
   and s.status in ('active','past_due') and coalesce(s.metadata->>'auto_charge_disabled','false')<>'true'
   and exists(select 1 from billing_asaas_card_vault c where c.subscription_id=s.id and c.status='active')
   and (s.current_period_end at time zone 'America/Sao_Paulo')::date-(now() at time zone 'America/Sao_Paulo')::date between 1 and 3
   and extract(hour from now() at time zone 'America/Sao_Paulo')>=10
   and not exists(select 1 from billing_card_attempts a where a.subscription_id=s.id and a.automatic_period_end=s.current_period_end and a.automatic_day=(now() at time zone 'America/Sao_Paulo')::date)
), closed as (
 select id,organization_id,occurred_at,'missingRate' as category,feature_code||coalesce(' ('||model_id||')','') as detail,billing_closed_at,billing_closure_reason
 from usage_events where billing_closed_at is not null
 union all
 select id,organization_id,created_at,'uncertainNotices',event_type,billing_closed_at,billing_closure_reason
 from billing_notification_events where billing_closed_at is not null
)
select jsonb_build_object(
 'pendingCount',(select count(*) from pending),
 'pending',coalesce((select jsonb_agg(to_jsonb(x)) from (
   select p.*,coalesce(o.name,'Cliente não identificado') as customer from pending p left join organizations o on o.id=p.organization_id order by occurred_at,id limit 100
 ) x),'[]'::jsonb),
 'closedCount',(select count(*) from closed),
 'closed',coalesce((select jsonb_agg(to_jsonb(x)) from (
   select c.*,coalesce(o.name,'Cliente não identificado') as customer from closed c left join organizations o on o.id=c.organization_id order by billing_closed_at desc,id limit 20
 ) x),'[]'::jsonb));
$$;
revoke all on function public.guard_billing_historical_closure() from public,anon,authenticated;
revoke all on function public.guard_closed_usage_debit() from public,anon,authenticated;
revoke all on function public.billing_attention_details() from public,anon,authenticated;
grant execute on function public.billing_attention_details() to service_role;
notify pgrst,'reload schema';
