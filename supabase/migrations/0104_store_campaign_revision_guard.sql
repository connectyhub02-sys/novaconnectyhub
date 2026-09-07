create function public.hold_store_campaign_revision(p_order uuid,p_org uuid,p_token uuid) returns void language plpgsql security definer set search_path=public as $$
declare o public.sales_catalog_orders;
begin
 select * into o from public.sales_catalog_orders where id=p_order and organization_id=p_org for update;
 if o.id is null or o.checkout_payment_lock is not null or o.payment_status::text in ('confirmed','refunded') or o.status::text='cancelled'
 or o.metadata->>'commercial_revision_token' is not null or exists(select 1 from public.sales_catalog_payment_sessions where order_id=o.id and metadata->>'gateway_request_inflight'='true') then raise exception 'CAMPAIGN_PAYMENT_BUSY'; end if;
 update public.sales_catalog_orders set metadata=metadata||jsonb_build_object('commercial_revision_token',p_token) where id=o.id;
end $$;

-- A renewal keeps its original financial history. A new program gets a new order,
-- after the provider charge was retired and while the old checkout is held.
create function public.revise_store_campaign_order(p_order uuid,p_agreement uuid,p_token uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare a public.commercial_agreements; o public.sales_catalog_orders; bound public.commercial_agreement_periods; oid uuid;
begin
 select * into a from public.commercial_agreements where id=p_agreement for update;
 select * into o from public.sales_catalog_orders where id=p_order and organization_id=a.organization_id for update;
 if a.id is null or a.owner_type<>'store' or o.id is null or a.lead_id is distinct from o.lead_id
  or o.metadata->>'commercial_revision_token' is distinct from p_token::text or a.paid_cycles<>0
  or o.payment_status::text in ('confirmed','refunded') or o.checkout_payment_lock is not null
  or exists(select 1 from public.sales_catalog_payment_sessions where order_id=o.id and (metadata->>'gateway_request_inflight'='true' or provider_payment_id is not null and status in ('created','pending','error')))
  then raise exception 'CAMPAIGN_PAYMENT_BUSY'; end if;
 select * into bound from public.commercial_agreement_periods where order_id=o.id for update;
 if bound.id is null or bound.agreement_id=a.id then return o.id; end if;
 if bound.paid_at is not null then raise exception 'CAMPAIGN_PERIOD_PAID'; end if;
 insert into public.sales_catalog_orders(organization_id,lead_id,conversation_id,source,status,customer_name,customer_phone,customer_email,customer_document,destination_cep,destination_address,subtotal,discount_total,shipping_total,total,shipping_method,payment_method,metadata)
 values(o.organization_id,o.lead_id,o.conversation_id,'checkout','pending_payment',o.customer_name,o.customer_phone,o.customer_email,o.customer_document,o.destination_cep,o.destination_address,o.subtotal,o.discount_total,o.shipping_total,o.total,o.shipping_method,o.payment_method,
 (o.metadata-'campaign_pricing'-'commercial_agreement_id'-'commercial_cycle'-'cycle_start_at'-'payment_session_id'-'provider_payment_id'-'renewal')||jsonb_build_object('replaces_order_id',o.id)) returning id into oid;
 insert into public.sales_catalog_order_items(order_id,organization_id,catalog_item_id,title,tag,quantity,unit_price,sale_price,total,attributes,fulfillment,metadata,sku_id,sku_code,platform_product_id)
 select oid,organization_id,catalog_item_id,title,tag,quantity,unit_price,sale_price,total,attributes,fulfillment,metadata-'commercial_agreement_id',sku_id,sku_code,platform_product_id from public.sales_catalog_order_items where order_id=o.id;
 update public.commercial_agreements set origin_order_id=oid where id=a.id;
 update public.sales_catalog_orders set metadata=metadata||jsonb_build_object('revised_order_id',oid) where id=o.id;
 insert into public.commercial_events(organization_id,lead_id,campaign_id,agreement_id,event_key,event_type,payload)
 values(a.organization_id,a.lead_id,a.campaign_id,a.id,'store-revision:'||oid,'campaign_order_revised',jsonb_build_object('previous_order_id',o.id,'order_id',oid,'notice','Cobrança anterior retirada; nova condição comercial separada do histórico original.'));
 return oid;
end $$;
revoke all on function public.revise_store_campaign_order(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.revise_store_campaign_order(uuid,uuid,uuid) to service_role;
create function public.release_store_campaign_revision(p_order uuid,p_token uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 update public.sales_catalog_orders set metadata=metadata-'commercial_revision_token' where id=p_order and metadata->>'commercial_revision_token'=p_token::text;
 if not found then raise exception 'CAMPAIGN_REVISION_CHANGED'; end if;
end $$;
create or replace function public.guard_store_commercial_attempt() returns trigger language plpgsql set search_path=public as $$
declare a public.commercial_agreements; o public.sales_catalog_orders;
begin
 select * into o from public.sales_catalog_orders where id=new.order_id for update;
 if o.metadata->>'commercial_revision_token' is not null then raise exception 'CAMPAIGN_REVISION_PENDING'; end if;
 select ca.* into a from public.commercial_agreements ca join public.commercial_agreement_periods cp on cp.agreement_id=ca.id where cp.order_id=new.order_id for update of ca;
 if a.id is null then return new; end if;
 if a.cancel_at_period_end or a.state in ('cancelled','ended') then raise exception 'COMMERCE_SUBSCRIPTION_CANCELLED'; end if;
 if a.state='reserved' and a.reservation_expires_at<now() then raise exception 'COMMERCE_RESERVATION_EXPIRED'; end if;
 if public.store_agreement_change_pending(a.id) then raise exception 'COMMERCE_REPLACEMENT_PENDING'; end if;
 return new;
end $$;
create function public.guard_store_commercial_pix() returns trigger language plpgsql set search_path=public as $$
declare a public.commercial_agreements; o public.sales_catalog_orders;
begin
 if new.metadata->>'gateway_request_inflight' is distinct from 'true' or old.metadata->>'gateway_request_inflight'='true' then return new; end if;
 select * into o from public.sales_catalog_orders where id=new.order_id for update;
 if o.metadata->>'commercial_revision_token' is not null then raise exception 'CAMPAIGN_REVISION_PENDING'; end if;
 select ca.* into a from public.commercial_agreements ca join public.commercial_agreement_periods cp on cp.agreement_id=ca.id where cp.order_id=new.order_id for update of ca;
 if a.id is null then return new; end if;
 if a.cancel_at_period_end or a.state in ('cancelled','ended') then raise exception 'COMMERCE_SUBSCRIPTION_CANCELLED'; end if;
 if a.state='reserved' and a.reservation_expires_at<now() then raise exception 'COMMERCE_RESERVATION_EXPIRED'; end if;
 if public.store_agreement_change_pending(a.id) then raise exception 'COMMERCE_REPLACEMENT_PENDING'; end if;
 return new;
end $$;
create trigger guard_store_commercial_pix before update of metadata on public.sales_catalog_payment_sessions for each row execute function public.guard_store_commercial_pix();
do $$ declare f record; begin
 for f in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname in ('hold_store_campaign_revision','release_store_campaign_revision','guard_store_commercial_pix','guard_store_commercial_attempt') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig); execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
