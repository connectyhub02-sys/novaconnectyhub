create function public.guard_store_commercial_attempt() returns trigger language plpgsql set search_path=public as $$
declare a public.commercial_agreements;
begin
 select ca.* into a from public.commercial_agreements ca join public.commercial_agreement_periods cp on cp.agreement_id=ca.id where cp.order_id=new.order_id for update of ca;
 if a.id is null then return new; end if;
 if a.cancel_at_period_end or a.state in ('cancelled','ended') then raise exception 'COMMERCE_SUBSCRIPTION_CANCELLED'; end if;
 if a.campaign_id is not null and a.state='reserved' and a.reservation_expires_at<now() then raise exception 'COMMERCE_RESERVATION_EXPIRED'; end if;
 return new;
end $$;
create trigger guard_store_commercial_attempt before insert on public.sales_catalog_card_attempts for each row execute function public.guard_store_commercial_attempt();

create function public.guard_platform_commercial_attempt() returns trigger language plpgsql set search_path=public as $$
declare a public.commercial_agreements;
begin
 if new.status='in_process' or new.payload->>'pix_creation_pending'='true' then
  select ca.* into a from public.commercial_agreements ca join public.commercial_agreement_periods cp on cp.agreement_id=ca.id where cp.platform_payment_id=new.id;
  if a.campaign_id is not null and a.state='reserved' and a.reservation_expires_at<now() then raise exception 'COMMERCE_RESERVATION_EXPIRED'; end if;
 end if;
 return new;
end $$;
create trigger guard_platform_commercial_attempt before update on public.billing_payments for each row execute function public.guard_platform_commercial_attempt();

create function public.refund_store_commercial_period() returns trigger language plpgsql security definer set search_path=public as $$
declare a public.commercial_agreements;
begin
 if new.payment_status::text<>'refunded' or old.payment_status::text='refunded' then return new; end if;
 select ca.* into a from public.commercial_agreements ca join public.commercial_agreement_periods cp on cp.agreement_id=ca.id where cp.order_id=new.id and ca.organization_id=new.organization_id for update of ca;
 if a.id is null then return new; end if;
 perform public.cancel_store_commercial_agreement(a.id,a.organization_id);
 insert into public.commercial_events(organization_id,lead_id,campaign_id,agreement_id,event_key,event_type,payload)
 values(a.organization_id,a.lead_id,a.campaign_id,a.id,'refund:'||new.id,'subscription_refunded',jsonb_build_object('order_id',new.id,'notice','Estorno confirmado; próximas renovações interrompidas. Benefício utilizado permanece no histórico.')) on conflict(event_key) do nothing;
 return new;
end $$;
create trigger refund_store_commercial_period after update of payment_status on public.sales_catalog_orders for each row execute function public.refund_store_commercial_period();

do $$ declare f record; begin
 for f in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname in ('guard_store_commercial_attempt','guard_platform_commercial_attempt','refund_store_commercial_period') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig); execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
