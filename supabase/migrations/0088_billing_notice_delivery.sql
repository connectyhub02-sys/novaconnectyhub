alter table public.billing_notification_events add column delivery_claimed_at timestamptz, add column delivery_uncertain boolean not null default false;

create or replace function public.claim_billing_notice(p_event uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare n public.billing_notification_events; s public.organization_subscriptions; p public.billing_payments; expected timestamptz;
begin
  select * into n from public.billing_notification_events where id=p_event for update;
  if not found or n.status not in ('pending','failed') or n.delivery_uncertain or n.delivery_claimed_at is not null or n.attempts>=5 or n.next_attempt_at>now() then return false; end if;
  select * into s from public.organization_subscriptions where id=n.subscription_id;
  expected:=nullif(n.metadata->>'current_period_end','')::timestamptz;
  if expected is not null and (coalesce(s.current_period_end,s.next_billing_at) is distinct from expected or s.status='canceled') then
    update public.billing_notification_events set status='skipped',error_message='Ciclo alterado; aviso anterior cancelado.' where id=n.id; return false;
  end if;
  if n.payment_id is not null then
    select * into p from public.billing_payments where id=n.payment_id;
    if (n.event_type in ('subscription_pending','payment_pending','payment_rejected','payment_canceled','payment_started','checkout_payment_started','checkout_cart_updated') and p.status in ('approved','refunded'))
      or (n.event_type='payment_approved' and p.status<>'approved') then
      update public.billing_notification_events set status='skipped',error_message='Situação financeira alterada.' where id=n.id; return false;
    end if;
  end if;
  update public.billing_notification_events set delivery_claimed_at=now() where id=n.id;
  return true;
end $$;
revoke all on function public.claim_billing_notice(uuid) from public,anon,authenticated;
grant execute on function public.claim_billing_notice(uuid) to service_role;
