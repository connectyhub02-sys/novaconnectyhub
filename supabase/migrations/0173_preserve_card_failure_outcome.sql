create or replace function public.finish_native_billing_card(p_attempt uuid,p_state text,p_provider_payment text default null,p_provider_status text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a public.billing_card_attempts; v_changed boolean;
begin
  if p_state not in ('unknown','pending','approved','rejected','error','cancelled','refunded') then raise exception 'BILLING_INVALID_STATE'; end if;
  select * into a from public.billing_card_attempts where id=p_attempt for update;
  if not found then raise exception 'BILLING_NOT_FOUND'; end if;
  if a.state='refunded' or a.state='approved' and p_state<>'refunded' then return to_jsonb(a); end if;
  -- The invoice stays PENDING after a definitive card refusal. A late invoice
  -- notification must not reopen that attempt or prevent replacing the card.
  -- A subsequently verified approval/refund remains authoritative.
  if a.state in ('rejected','error','cancelled') and p_state in ('pending','unknown') then return to_jsonb(a); end if;
  v_changed:=a.state<>p_state;
  update public.billing_card_attempts set state=p_state,provider_payment_id=coalesce(p_provider_payment,provider_payment_id),updated_at=now(),effects_completed_state=case when v_changed then null else effects_completed_state end,effects_claimed_at=case when v_changed then null else effects_claimed_at end where id=a.id returning * into a;
  update public.billing_payments set provider_payment_id=coalesce(p_provider_payment,provider_payment_id),provider_status=coalesce(p_provider_status,upper(p_state)),
    status=case when p_state in ('unknown','pending') then 'in_process' when p_state='cancelled' then 'canceled' when p_state='error' then 'rejected' else p_state end,
    paid_at=case when p_state='approved' then coalesce(paid_at,now()) else paid_at end where id=a.payment_id and status<>'refunded' and (status<>'approved' or p_state='refunded');
  if v_changed then insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
    values('organization',a.organization_id,'billing_payment',a.payment_id,'billing.native_card_'||p_state,'Atualização do pagamento no painel','Estado do pagamento: '||p_state,'organization',array['billing','payment'],jsonb_build_object('subscription_id',a.subscription_id,'invoice_id',a.invoice_id,'payment_id',a.payment_id,'attempt_id',a.id,'amount',a.amount,'status',p_state)); end if;
  return to_jsonb(a);
end $$;
revoke all on function public.finish_native_billing_card(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_native_billing_card(uuid,text,text,text) to service_role;

