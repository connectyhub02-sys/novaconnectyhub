-- Lock a checkout before retiring an issued provider invoice. An ambiguous retirement
-- leaves it on hold for reconciliation; another request cannot start a charge.
create function public.hold_commercial_invoice_revision(p_payment uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.billing_payments;
begin
 perform 1 from public.organizations where id=(select organization_id from public.billing_payments where id=p_payment) for update;
 perform 1 from public.organization_subscriptions where id=(select subscription_id from public.billing_payments where id=p_payment) for update;
 select * into p from public.billing_payments where id=p_payment for update;
 if not found or p.status not in ('pending','rejected') or p.payload->>'pix_creation_pending'='true'
  or p.payload->>'commercial_revision_pending'='true' or exists(select 1 from public.billing_card_attempts where payment_id=p.id and state in ('processing','unknown','pending','approved')) then raise exception 'CAMPAIGN_PAYMENT_BUSY'; end if;
 update public.billing_payments set payload=payload||jsonb_build_object('commercial_revision_pending',true,'commercial_revision_started_at',now()) where id=p.id;
 return to_jsonb(p);
end $$;

create function public.guard_commercial_invoice_revision() returns trigger language plpgsql set search_path=public as $$
begin
 if old.payload->>'commercial_revision_pending'='true' and (new.status='in_process' or new.payload->>'pix_creation_pending'='true') then raise exception 'CAMPAIGN_REVISION_PENDING'; end if;
 return new;
end $$;
create trigger guard_commercial_invoice_revision before update on public.billing_payments for each row execute function public.guard_commercial_invoice_revision();

create function public.replace_commercial_invoice(p_payment uuid,p_agreement uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare p public.billing_payments; inv public.billing_invoices; iid uuid:=gen_random_uuid(); pid uuid:=gen_random_uuid(); meta jsonb;
begin
 perform 1 from public.organizations where id=(select organization_id from public.billing_payments where id=p_payment) for update;
 perform 1 from public.organization_subscriptions where id=(select subscription_id from public.billing_payments where id=p_payment) for update;
 select * into p from public.billing_payments where id=p_payment for update;
 if not found or p.status not in ('pending','rejected') or p.payload->>'commercial_revision_pending' is distinct from 'true' then raise exception 'CAMPAIGN_PAYMENT_BUSY'; end if;
 select * into inv from public.billing_invoices where id=p.invoice_id for update;
 meta:=(p.payload-array['campaign_pricing','campaign_selection','plan_pricing','commercial_revision_pending','commercial_revision_started_at','pix_creation_pending','pix_qr_code','pix_qr_code_base64','pix_ticket_url','asaas_payment_id','native_card_attempt_id','native_recurring_attempt_id','managed_external_reference','auto_charge_disabled','provider_payment_id','asaas_checkout_id','asaas_checkout_url','checkout_card_holder'])||jsonb_build_object('invoice_id',iid,'payment_id',pid,'replaces_payment_id',p.id,'external_reference','connectyhub_subscription:'||p.organization_id||':'||p.subscription_id||':'||iid||':'||pid,'checkout_status','internal_checkout_created');
 update public.billing_payments set status='canceled',provider_status='replaced_after_provider_retirement',payload=payload||jsonb_build_object('commercial_revision_pending',false,'replaced_by_payment_id',pid) where id=p.id;
 update public.billing_invoices set status='void',metadata=metadata||jsonb_build_object('replaced_by_invoice_id',iid) where id=inv.id;
 update public.commercial_agreements set state='cancelled' where id<>p_agreement and id in(select agreement_id from public.commercial_agreement_periods where platform_payment_id=p.id) and paid_cycles=0 and state='reserved';
 insert into public.billing_invoices(id,organization_id,subscription_id,status,currency,subtotal_brl,discount_brl,total_brl,due_at,provider,metadata)
 values(iid,p.organization_id,p.subscription_id,'open','BRL',inv.subtotal_brl,inv.discount_brl,inv.total_brl,greatest(inv.due_at,now()+interval '24 hours'),p.provider,meta);
 insert into public.billing_invoice_items(invoice_id,organization_id,item_type,description,quantity,unit_price_brl,total_brl,credit_amount,metadata)
 select iid,organization_id,item_type,description,quantity,unit_price_brl,total_brl,credit_amount,metadata from public.billing_invoice_items where invoice_id=inv.id;
 insert into public.billing_payments(id,organization_id,subscription_id,invoice_id,provider,status,amount_brl,payload)
 values(pid,p.organization_id,p.subscription_id,iid,p.provider,'pending',p.amount_brl,meta);
 update public.organization_subscriptions set metadata=metadata||jsonb_build_object('pending_checkout_payment_id',pid,'pending_checkout_invoice_id',iid) where id=p.subscription_id;
 insert into public.commercial_events(organization_id,buyer_user_id,event_key,event_type,payload)
 values(p.organization_id,(select owner_id from public.organizations where id=p.organization_id),'invoice-revised:'||p.id,'invoice_replaced',jsonb_build_object('old_payment_id',p.id,'new_payment_id',pid,'notice','Cobrança anterior substituída após conferência do provedor, para escolha de uma condição comercial.'));
 perform public.apply_platform_campaign_period(p_agreement,pid,0);
 return pid;
end $$;

-- Acceptance of a replacement offer supersedes the previous pricing program, never
-- the history or prior paid periods. Only one program bills a platform subscription.
create function public.finish_platform_commercial_agreement() returns trigger language plpgsql set search_path=public as $$
begin
 if new.state='active' and new.owner_type='platform' and new.consumed_at is not null then
  update public.commercial_agreements set state='ended' where platform_subscription_id=new.platform_subscription_id and id<>new.id and state in ('active','past_due');
 end if;
 return new;
end $$;
create trigger finish_platform_commercial_agreement after update of state on public.commercial_agreements for each row execute function public.finish_platform_commercial_agreement();

do $$ declare f record; begin
 for f in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname in ('hold_commercial_invoice_revision','guard_commercial_invoice_revision','replace_commercial_invoice','finish_platform_commercial_agreement') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig); execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
