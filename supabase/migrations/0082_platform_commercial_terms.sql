-- Existing contracts retain monthly terms. Catalog edits affect future purchases only.
alter table public.billing_plans
  add column if not exists billing_cycle text not null default 'recurring' check (billing_cycle in ('one_time','recurring')),
  add column if not exists billing_interval text not null default 'month' check (billing_interval in ('week','month','quarter','year')),
  add column if not exists access_duration_days integer check (access_duration_days > 0);
alter table public.billing_plans add constraint billing_plan_one_time_duration
  check (billing_cycle <> 'one_time' or access_duration_days is not null);

update public.organization_subscriptions s
set metadata=coalesce(s.metadata,'{}') || jsonb_build_object('commercial_terms',jsonb_build_object('billing_cycle','recurring','billing_interval','month','access_duration_days',null,'price_brl',p.monthly_price_brl,'included_credits',p.included_credits))
from public.billing_plans p where p.plan_code=s.plan_code and not coalesce(s.metadata,'{}') ? 'commercial_terms';

update public.billing_payments b
set payload=coalesce(b.payload,'{}') || jsonb_build_object('commercial_terms',jsonb_build_object('billing_cycle','recurring','billing_interval','month','access_duration_days',null,
  'price_brl',coalesce((select sum(i.total_brl) from public.billing_invoice_items i where i.invoice_id=b.invoice_id and i.item_type='plan'),p.monthly_price_brl),'included_credits',p.included_credits))
from public.organization_subscriptions s join public.billing_plans p on p.plan_code=s.plan_code where b.subscription_id=s.id and not coalesce(b.payload,'{}') ? 'commercial_terms';

alter table public.billing_card_attempts drop constraint if exists billing_card_attempts_recurring_amount_check;
alter table public.billing_card_attempts add constraint billing_card_attempts_recurring_amount_check check(recurring_amount >= 0);

create or replace function public.claim_native_billing_card(p_org uuid,p_payment uuid,p_attempt uuid,p_revision bigint,p_amount numeric,p_recurring numeric,p_reference text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p public.billing_payments; a public.billing_card_attempts; v_subscription uuid; v_invoice uuid; v_previous text;
begin
  select subscription_id,invoice_id into v_subscription,v_invoice from public.billing_payments where id=p_payment and organization_id=p_org;
  if not found then raise exception 'BILLING_NOT_FOUND'; end if;
  select provider_subscription_id into v_previous from public.organization_subscriptions where id=v_subscription and organization_id=p_org for update;
  perform 1 from public.billing_invoices where id=v_invoice and organization_id=p_org for update;
  select * into p from public.billing_payments where id=p_payment and organization_id=p_org for update;
  select * into a from public.billing_card_attempts where id=p_attempt;
  if found then
    if a.organization_id<>p_org or a.payment_id<>p.id then raise exception 'BILLING_ATTEMPT_CONFLICT'; end if;
    return jsonb_build_object('claimed',false,'attempt',to_jsonb(a));
  end if;
  select * into a from public.billing_card_attempts where payment_id=p.id and state in ('processing','unknown','pending','approved') order by created_at desc limit 1;
  if found then return jsonb_build_object('claimed',false,'attempt',to_jsonb(a)); end if;
  if p.status not in ('pending','rejected','in_process') then raise exception 'BILLING_NOT_PAYABLE'; end if;
  if p.payload->>'pix_creation_pending'='true' then raise exception 'BILLING_PIX_PENDING'; end if;
  if p.checkout_revision<>p_revision or p.amount_brl<>p_amount or p_recurring<0 or p_recurring>p_amount then raise exception 'BILLING_CHANGED'; end if;
  if (select count(*) from public.billing_card_attempts where payment_id=p.id and created_at>now()-interval '15 minutes')>=5 then raise exception 'BILLING_RATE_LIMIT'; end if;
  insert into public.billing_card_attempts(id,organization_id,subscription_id,invoice_id,payment_id,amount,recurring_amount,external_reference,state,previous_subscription_id)
    values(p_attempt,p_org,p.subscription_id,p.invoice_id,p.id,p_amount,p_recurring,p_reference,'processing',v_previous) returning * into a;
  update public.billing_payments set status='in_process',provider_status='NATIVE_CARD_PROCESSING',payload=coalesce(payload,'{}')||jsonb_build_object('native_card_attempt_id',a.id,'payment_method','card','billing_payment_method','card','pix_qr_code',null,'pix_qr_code_base64',null,'pix_ticket_url',null) where id=p.id;
  insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
    values('organization',p_org,'billing_payment',p.id,'billing.native_card_attempt_started','Pagamento iniciado no painel','Tentativa de cartão registrada antes do envio ao provedor.','organization',array['billing','payment'],jsonb_build_object('subscription_id',p.subscription_id,'invoice_id',p.invoice_id,'payment_id',p.id,'attempt_id',a.id,'amount',p_amount));
  return jsonb_build_object('claimed',true,'attempt',to_jsonb(a));
end $$;
