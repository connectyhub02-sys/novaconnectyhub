-- Serialize invoice creation with activation and suspension. Repeated workers return
-- the same invoice for the same contract period, including recurring products.
create or replace function public.prepare_contract_renewal(p_subscription uuid,p_expected_end timestamptz,p_start timestamptz,p_end timestamptz,p_provider text,p_metadata jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.organization_subscriptions; p public.billing_payments; inv uuid:=gen_random_uuid(); pay uuid:=gen_random_uuid();
  m jsonb; bumps jsonb; selected_item jsonb; amount numeric; base numeric; ref text;
begin
  perform 1 from public.organizations where id=(select organization_id from public.organization_subscriptions where id=p_subscription) for update;
  select * into s from public.organization_subscriptions where id=p_subscription for update;
  if not found or s.status not in ('active','past_due') or s.current_period_end is distinct from p_expected_end
    or s.metadata#>>'{commercial_terms,billing_cycle}'='one_time' or p_end<=p_start then raise exception 'BILLING_CYCLE_CHANGED'; end if;
  if s.provider_subscription_id like 'sub_%' then raise exception 'BILLING_PROVIDER_CYCLE_REQUIRED'; end if;
  select * into p from public.billing_payments where subscription_id=s.id and payload->>'checkout_kind'='renewal'
    and (payload->>'previous_current_period_end')::timestamptz=p_expected_end and status in ('pending','in_process','rejected') order by created_at desc limit 1;
  if found then return jsonb_build_object('invoice_id',p.invoice_id,'payment_id',p.id,'reused',true); end if;
  base:=(s.metadata#>>'{commercial_terms,price_brl}')::numeric;
  if base is null or base<=0 then raise exception 'BILLING_PRICE_REVIEW_REQUIRED'; end if;
  select coalesce(jsonb_agg(b),'[]') into bumps from jsonb_array_elements(coalesce(s.metadata->'selected_bumps','[]')) b where b->>'recurrence' in ('weekly','monthly','quarterly','yearly');
  amount:=base+coalesce((select sum((b->>'price_brl')::numeric) from jsonb_array_elements(bumps) b),0);
  ref:='connectyhub_subscription:'||s.organization_id||':'||s.id||':'||inv||':'||pay;
  m:=coalesce(s.metadata,'{}')||p_metadata||jsonb_build_object('external_reference',ref,'subscription_id',s.id,'invoice_id',inv,'payment_id',pay,
    'commercial_terms',s.metadata->'commercial_terms','purchase_kind',s.subscription_kind,'purchase_product_id',s.metadata->'purchase_product_id',
    'selected_bumps',bumps,'selected_bump_codes',(select coalesce(jsonb_agg(b->>'code'),'[]') from jsonb_array_elements(bumps) b),
    'plan_amount_brl',base,'checkout_total_brl',amount,'checkout_kind','renewal','cycle_start_at',p_start,'cycle_end_at',p_end,'previous_current_period_end',p_expected_end);
  insert into public.billing_invoices(id,organization_id,subscription_id,status,subtotal_brl,total_brl,provider,metadata)
    values(inv,s.organization_id,s.id,'open',amount,amount,p_provider,m);
  insert into public.billing_invoice_items(invoice_id,organization_id,item_type,description,quantity,unit_price_brl,total_brl,metadata)
    values(inv,s.organization_id,'plan','Renovação ConnectyHub',1,base,base,jsonb_build_object('platform_product_id',m->'purchase_product_id','recurrence','recurring'));
  for selected_item in select * from jsonb_array_elements(bumps) loop
    insert into public.billing_invoice_items(invoice_id,organization_id,item_type,description,quantity,unit_price_brl,total_brl,credit_amount,metadata)
      values(inv,s.organization_id,coalesce(selected_item->>'item_type','adjustment'),selected_item->>'title',1,(selected_item->>'price_brl')::numeric,(selected_item->>'price_brl')::numeric,coalesce((selected_item->>'credit_amount')::numeric,0),
        jsonb_build_object('source','dashboard_plan_checkout_bump','platform_product_id',selected_item->'platform_product_id','recurrence',selected_item->'recurrence','bump',selected_item));
  end loop;
  insert into public.billing_payments(id,organization_id,subscription_id,invoice_id,status,provider,amount_brl,payload)
    values(pay,s.organization_id,s.id,inv,'pending',p_provider,amount,m);
  -- Keep the current contract immutable until this invoice is actually paid.
  update public.organization_subscriptions set metadata=metadata||jsonb_build_object('pending_checkout_invoice_id',inv,'pending_checkout_payment_id',pay),updated_at=now() where id=s.id;
  return jsonb_build_object('invoice_id',inv,'payment_id',pay,'reused',false);
end $$;
revoke all on function public.prepare_contract_renewal(uuid,timestamptz,timestamptz,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.prepare_contract_renewal(uuid,timestamptz,timestamptz,timestamptz,text,jsonb) to service_role;

-- A worker dying after a send is an uncertain delivery, never permission to resend.
create or replace function public.recover_abandoned_billing_notices() returns integer
language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  update public.billing_notification_events set delivery_uncertain=true,delivery_claimed_at=null,status='failed',
    error_message='Resultado de envio não confirmado. Conferir no provedor antes de reenviar.'
    where delivery_claimed_at<now()-interval '10 minutes' and status in ('pending','failed');
  get diagnostics n=row_count;
  return n;
end $$;
revoke all on function public.recover_abandoned_billing_notices() from public,anon,authenticated;
grant execute on function public.recover_abandoned_billing_notices() to service_role;

-- Only a full refund of the currently fulfilled invoice ends its operating period.
-- Product rights are independently revoked by their existing per-payment trigger.
create or replace function public.apply_billing_refund_access() returns trigger
language plpgsql security definer set search_path=public as $$
declare s public.organization_subscriptions; credit_amount numeric;
begin
  if new.status<>'refunded' or old.status='refunded' then return new; end if;
  select * into s from public.organization_subscriptions where id=new.subscription_id for update;
  if new.payload->>'credit_reversal_transaction_id' is null and exists(select 1 from public.billing_payment_fulfillments where payment_id=new.id) then
    credit_amount:=coalesce((new.payload#>>'{commercial_terms,included_credits}')::numeric,0)+coalesce((select sum(i.credit_amount) from public.billing_invoice_items i where i.invoice_id=new.invoice_id and item_type<>'plan'),0);
    if credit_amount>0 then perform public.reverse_credit_wallet_for_refund(new.organization_id,credit_amount,'billing_refund_payment:'||new.id,'Estorno da compra ConnectyHub',jsonb_build_object('payment_id',new.id)); end if;
  end if;
  if s.subscription_kind='plan' and exists(select 1 from public.billing_payment_fulfillments where payment_id=new.id)
    and (s.metadata->>'last_fulfilled_payment_created_at')::timestamptz=new.created_at then
    update public.organization_subscriptions set status=case when status='paused' then status else 'canceled' end,
      current_period_end=least(current_period_end,now()),next_billing_at=null,
      metadata=metadata||jsonb_build_object('access_ended_reason','payment_refunded','refunded_payment_id',new.id),updated_at=now() where id=s.id;
    update public.organizations set status='past_due',updated_at=now() where id=s.organization_id and status='active';
  end if;
  return new;
end $$;
create trigger billing_refund_access after update of status on public.billing_payments for each row execute function public.apply_billing_refund_access();

-- Preserve purchased credits when a trial bonus has expired. Only the remaining
-- bonus can expire; buying an avulso during the trial does not make it disposable.
create or replace function public.prepare_trial_conversion(p_org uuid,p_paid_at timestamptz) returns void
language plpgsql security definer set search_path=public as $$
declare o public.organizations; trial public.billing_cycles; w record; purchased numeric; expired numeric;
begin
  select * into o from public.organizations where id=p_org for update;
  if o.plan_code<>'trial' and o.status not in ('trial','trial_expired') then return; end if;
  select c.* into trial from public.billing_cycles c join public.billing_plans bp on bp.id=c.plan_id where c.organization_id=o.id and bp.plan_code='trial' order by c.cycle_end desc limit 1;
  if trial.status='closed' or p_paid_at<coalesce(trial.cycle_end,o.created_at+interval '7 days') then return; end if;
  select * into w from public.credit_wallets where organization_id=o.id for update;
  if not found then return; end if;
  select greatest(coalesce(sum(amount_credits),0),0) into purchased from public.credit_transactions
    where organization_id=o.id and transaction_type in ('purchase','refund');
  expired:=greatest(least(coalesce(trial.included_credits,0),w.balance_credits-purchased),0);
  if expired>0 then
    update public.credit_wallets set balance_credits=balance_credits-expired,updated_at=now(),metadata=coalesce(metadata,'{}')||jsonb_build_object('trial_balance_expired_on_paid_conversion',true,'trial_balance_expired_credits',expired) where id=w.id;
    insert into public.credit_transactions(organization_id,wallet_id,transaction_type,amount_credits,balance_after_credits,external_reference,description,metadata)
      values(o.id,w.id,'expiration',-expired,w.balance_credits-expired,'trial_expired:'||o.id||':'||coalesce(trial.id::text,'no_cycle'),'Expiração do bônus de teste',jsonb_build_object('source','trial_credit_expiration_on_paid_conversion'));
  end if;
  update public.billing_cycles set status='closed' where organization_id=o.id and id=trial.id;
end $$;
revoke all on function public.prepare_trial_conversion(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.prepare_trial_conversion(uuid,timestamptz) to service_role;

-- Recover proven historical rights. Unknown commercial terms remain in review;
-- imported catalogue entries never create a purchased entitlement.
do $$ declare r record;
begin
  for r in select id from public.billing_payments where status in ('approved','refunded') loop perform public.sync_billing_product_entitlements(r.id); end loop;
  for r in select id from public.sales_catalog_orders where payment_status in ('confirmed','refunded') loop perform public.sync_store_product_entitlements(r.id); end loop;
end $$;

-- Import the actual recorded notices into the owner's journal, without sending them.
insert into public.platform_customer_journey(user_id,event_key,event_type,source_id,payload,created_at)
select o.owner_id,'historical_notice:'||n.id,'billing_notice',n.id,
  public.lead_archive_safe_json(to_jsonb(n)-'metadata')||jsonb_build_object('message',coalesce(n.metadata->>'sent_message_body',n.metadata->>'message_body',n.message_preview)),coalesce(n.sent_at,n.created_at)
from public.billing_notification_events n join public.organizations o on o.id=n.organization_id where o.owner_id is not null
on conflict(event_key) do nothing;

create or replace function public.sync_native_billing_cart(p_org uuid,p_subscription uuid,p_invoice uuid,p_payment uuid,p_amount numeric,p_metadata jsonb,p_items jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare s public.organization_subscriptions; p public.billing_payments;
begin
  select * into s from public.organization_subscriptions where id=p_subscription and organization_id=p_org for update;
  if not found then raise exception 'BILLING_NOT_FOUND'; end if;
  perform 1 from public.billing_invoices where id=p_invoice and organization_id=p_org and subscription_id=s.id for update;
  if not found then raise exception 'BILLING_NOT_FOUND'; end if;
  select * into p from public.billing_payments where id=p_payment and invoice_id=p_invoice and subscription_id=s.id and organization_id=p_org for update;
  if not found or p.status not in ('pending','rejected','in_process') or p_amount<=0 then raise exception 'BILLING_NOT_PAYABLE'; end if;
  if p.amount_brl=p_amount and coalesce(p.payload->'selected_bump_codes','[]')=coalesce(p_metadata->'selected_bump_codes','[]') then return; end if;
  if p.payload->>'checkout_kind'='renewal' then raise exception 'BILLING_RENEWAL_TERMS_FIXED'; end if;
  if p.payload->>'pix_creation_pending'='true' or (p.payload->>'pix_qr_code' is not null and p.provider_payment_id is not null and p.status in ('pending','in_process')) then raise exception 'BILLING_PIX_PENDING'; end if;
  if exists(select 1 from public.billing_card_attempts where payment_id=p.id and state in ('processing','unknown','pending')) then raise exception 'BILLING_PAYMENT_BUSY'; end if;
  delete from public.billing_invoice_items where invoice_id=p_invoice and organization_id=p_org and metadata->>'source'='dashboard_plan_checkout_bump';
  insert into public.billing_invoice_items(invoice_id,organization_id,item_type,description,quantity,unit_price_brl,total_brl,credit_amount,metadata)
    select p_invoice,p_org,r->>'item_type',r->>'description',1,(r->>'unit_price_brl')::numeric,(r->>'total_brl')::numeric,nullif(r->>'credit_amount','')::numeric,r->'metadata' from jsonb_array_elements(p_items) r;
  update public.organization_subscriptions set metadata=coalesce(metadata,'{}')||jsonb_build_object('pending_checkout_cart',p_metadata) where id=s.id;
  update public.billing_invoices set subtotal_brl=p_amount,discount_brl=0,total_brl=p_amount,provider='asaas',metadata=coalesce(metadata,'{}')||p_metadata where id=p_invoice;
  update public.billing_payments set amount_brl=p_amount,provider='asaas',payload=coalesce(payload,'{}')||p_metadata where id=p.id;
end $$;
revoke all on function public.sync_native_billing_cart(uuid,uuid,uuid,uuid,numeric,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sync_native_billing_cart(uuid,uuid,uuid,uuid,numeric,jsonb,jsonb) to service_role;


-- Expire only a trial bonus, leaving purchased balances and content intact.
create or replace function public.expire_connectyhub_trial_credits(p_now timestamptz default now(),p_limit integer default 100)
returns table(organization_id uuid,wallet_id uuid,trial_cycle_id uuid,expired_balance_credits numeric)
language plpgsql security definer set search_path=public as $$
declare r record; before_balance numeric; after_balance numeric;
begin
 for r in select o.id org,cw.id wallet,bc.id cycle from public.organizations o
 join public.credit_wallets cw on cw.organization_id=o.id
 join public.billing_cycles bc on bc.organization_id=o.id join public.billing_plans bp on bp.id=bc.plan_id
 where (o.plan_code='trial' or o.status in ('trial','trial_expired')) and bp.plan_code='trial' and bc.status<>'closed' and bc.cycle_end<=p_now
 order by bc.cycle_end limit least(greatest(p_limit,1),500)
 loop
  perform 1 from public.organizations where id=r.org for update;
  select balance_credits into before_balance from public.credit_wallets where id=r.wallet;
  perform public.prepare_trial_conversion(r.org,p_now);
  select balance_credits into after_balance from public.credit_wallets where id=r.wallet;
  update public.organizations set status='trial_expired',updated_at=now() where id=r.org and status='trial';
  return query select r.org::uuid,r.wallet::uuid,r.cycle::uuid,greatest(before_balance-after_balance,0)::numeric;
 end loop;
end $$;
revoke all on function public.expire_connectyhub_trial_credits(timestamptz,integer) from public,anon,authenticated;
grant execute on function public.expire_connectyhub_trial_credits(timestamptz,integer) to service_role;

-- A partial refund does not identify which items lost their rights. Preserve other
-- purchases and open a human reconciliation instead of treating it as a full refund.
create or replace function public.archive_partial_billing_refund() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if upper(coalesce(new.provider_status,'')) in ('PARTIALLY_REFUNDED','PARTIAL_REFUNDED') then
  insert into public.platform_customer_journey(user_id,event_key,event_type,source_id,payload)
   select owner_id,'partial_refund:'||new.id||':'||md5(coalesce(new.payload->'asaas_payment','{}')::text),'partial_refund_review',new.id,
    jsonb_build_object('payment_id',new.id,'invoice_id',new.invoice_id,'provider_status',new.provider_status,'requires_item_review',true)
   from public.organizations where id=new.organization_id and owner_id is not null on conflict(event_key) do nothing;
 end if;
 return new;
end $$;
create trigger platform_partial_refund_journey after update of provider_status on public.billing_payments for each row execute function public.archive_partial_billing_refund();
