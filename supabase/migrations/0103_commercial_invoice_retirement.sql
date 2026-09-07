create function public.void_commercial_invoice_revision(p_payment uuid,p_actor uuid,p_next_plan text) returns void language plpgsql security definer set search_path=public as $$
declare p public.billing_payments; m jsonb;
begin
 perform 1 from public.organizations where id=(select organization_id from public.billing_payments where id=p_payment) for update;
 perform 1 from public.organization_subscriptions where id=(select subscription_id from public.billing_payments where id=p_payment) for update;
 select * into p from public.billing_payments where id=p_payment for update;
 if not found or p.status not in ('pending','rejected') or p.payload->>'commercial_revision_pending' is distinct from 'true'
 or exists(select 1 from public.billing_card_attempts where payment_id=p.id and state in ('processing','unknown','pending','approved')) then raise exception 'CAMPAIGN_PAYMENT_BUSY'; end if;
 m:=jsonb_build_object('commercial_revision_pending',false,'checkout_status','replaced_by_customer','replaced_at',now(),'replaced_by',p_actor,'replaced_by_plan_code',p_next_plan);
 update public.billing_payments set status='canceled',provider_status='replaced_after_provider_retirement',payload=payload||m where id=p.id;
 update public.billing_invoices set status='void',metadata=metadata||m where id=p.invoice_id and status in ('draft','open','failed');
 update public.commercial_agreements set state='cancelled' where id in(select agreement_id from public.commercial_agreement_periods where platform_payment_id=p.id) and state='reserved' and paid_cycles=0;
 insert into public.commercial_events(organization_id,buyer_user_id,event_key,event_type,payload)
 values(p.organization_id,p_actor,'invoice-retired:'||p.id,'invoice_replaced',m||jsonb_build_object('payment_id',p.id,'notice','Cobrança anterior encerrada após conferência do provedor para escolha de outro plano.')) on conflict(event_key) do nothing;
end $$;
revoke all on function public.void_commercial_invoice_revision(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.void_commercial_invoice_revision(uuid,uuid,text) to service_role;
