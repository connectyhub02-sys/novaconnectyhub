create or replace function public.apply_store_campaign_period(p_agreement uuid,p_order uuid,p_cycle integer,p_item uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a public.commercial_agreements; o public.sales_catalog_orders; item public.sales_catalog_order_items; pricing jsonb; v_subtotal numeric; v_discount numeric; recurring boolean;
begin
 select * into a from public.commercial_agreements where id=p_agreement for update;
 select * into o from public.sales_catalog_orders where id=p_order and organization_id=a.organization_id for update;
 if a.id is null or a.owner_type<>'store' or o.id is null or a.lead_id is distinct from o.lead_id then raise exception 'CAMPAIGN_ORDER_NOT_FOUND'; end if;
 if a.state in ('cancelled','ended') or p_cycle<>a.paid_cycles then raise exception 'CAMPAIGN_PERIOD_INVALID'; end if;
 if o.checkout_payment_lock is not null or o.payment_status::text in ('confirmed','refunded') or o.status::text='cancelled'
  or exists(select 1 from public.sales_catalog_payment_sessions where order_id=o.id and (metadata->>'gateway_request_inflight'='true' or provider_payment_id is not null and status in ('created','pending','error')))
  then raise exception 'CAMPAIGN_PAYMENT_BUSY'; end if;
 if a.state='reserved' and a.campaign_id is not null and a.reservation_expires_at<now() then raise exception 'CAMPAIGN_RESERVATION_EXPIRED'; end if;
 select * into item from public.sales_catalog_order_items where id=p_item and order_id=o.id and organization_id=o.organization_id;
 if item.id is null or item.catalog_item_id::text<>a.target_id or item.platform_product_id is not null then raise exception 'CAMPAIGN_PRODUCT_INVALID'; end if;
 recurring:=coalesce(item.metadata->>'billing_cycle','one_time')='recurring';
 pricing:=public.commercial_program_price(a.configuration,a.option_id,p_cycle)||jsonb_build_object('campaign_id',a.campaign_id,'campaign_revision',a.campaign_revision,'agreement_id',a.id,'recurring',recurring,'quantity',item.quantity);
 if not recurring then pricing:=pricing||jsonb_build_object('next_price_brl',0,'remaining_cycles',0); end if;
 update public.sales_catalog_order_items set unit_price=(pricing->>'list_price_brl'),sale_price=(pricing->>'price_brl'),total=((pricing->>'list_price_brl')::numeric*item.quantity)::text,
  metadata=metadata||jsonb_build_object('commercial_agreement_id',a.id,'billing_interval',pricing->>'interval') where id=item.id;
 select sum(public.checkout_money(total)) into v_subtotal from public.sales_catalog_order_items where order_id=o.id;
 v_discount:=(pricing->>'discount_brl')::numeric*item.quantity;
 if a.campaign_id is null and p_cycle=0 then v_discount:=greatest(v_discount,public.checkout_money(o.discount_total)); end if;
 update public.sales_catalog_orders set checkout_revision=checkout_revision+1,subtotal=v_subtotal::text,discount_total=v_discount::text,total=(v_subtotal-v_discount+public.checkout_money(shipping_total))::text,
  metadata=metadata||jsonb_build_object('campaign_pricing',pricing,'commercial_agreement_id',a.id,'commercial_cycle',p_cycle),updated_at=now() where id=o.id;
 insert into public.commercial_agreement_periods(agreement_id,cycle,order_id,pricing) values(a.id,p_cycle,o.id,pricing)
  on conflict(agreement_id,cycle) do update set pricing=excluded.pricing where commercial_agreement_periods.order_id=excluded.order_id and commercial_agreement_periods.paid_at is null;
 update public.commercial_agreements set metadata=metadata||jsonb_build_object('recurring',recurring,'quantity',item.quantity,'recurring_item_id',item.id,'shipping_total',o.shipping_total),updated_at=now() where id=a.id;
 insert into public.commercial_events(organization_id,lead_id,campaign_id,agreement_id,event_key,event_type,payload)
  values(a.organization_id,a.lead_id,a.campaign_id,a.id,'store-period:'||o.id||':'||coalesce(a.campaign_revision,0),'campaign_applied',pricing) on conflict(event_key) do nothing;
 return pricing;
end $$;

-- Create only the next unpaid period; repeated jobs reuse it. No provider charge here.
create or replace function public.prepare_store_contract_period(p_agreement uuid,p_now timestamptz) returns uuid
language plpgsql security definer set search_path=public as $$
declare a public.commercial_agreements; original public.sales_catalog_orders; item public.sales_catalog_order_items; pending uuid; oid uuid; iid uuid; pricing jsonb; next_start timestamptz;
begin
 select * into a from public.commercial_agreements where id=p_agreement and owner_type='store' for update;
 if a.id is null or a.state not in ('active','past_due') or a.metadata->>'recurring' is distinct from 'true' or a.cancel_at_period_end then return null; end if;
 if public.store_agreement_change_pending(a.id) then return null; end if;
 if a.period_end is null or a.period_end>p_now+interval '3 days' then return null; end if;
 if a.period_end<=p_now then update public.commercial_agreements set state='past_due' where id=a.id; end if;
 select order_id into pending from public.commercial_agreement_periods where agreement_id=a.id and cycle=a.paid_cycles;
 if pending is not null then return pending; end if;
 select * into original from public.sales_catalog_orders where id=a.origin_order_id and organization_id=a.organization_id;
 select * into item from public.sales_catalog_order_items where id=(a.metadata->>'recurring_item_id')::uuid and organization_id=a.organization_id;
 if original.id is null or item.id is null then raise exception 'COMMERCE_ORIGIN_MISSING'; end if;
 pricing:=public.commercial_program_price(a.configuration,a.option_id,a.paid_cycles);
 next_start:=greatest(a.period_end,p_now);
 insert into public.sales_catalog_orders(organization_id,lead_id,conversation_id,source,status,customer_name,customer_phone,customer_email,customer_document,destination_cep,destination_address,shipping_total,shipping_method,payment_method,metadata)
  values(a.organization_id,a.lead_id,original.conversation_id,'checkout','pending_payment',original.customer_name,original.customer_phone,original.customer_email,original.customer_document,original.destination_cep,original.destination_address,
   original.shipping_total,original.shipping_method,original.payment_method,(original.metadata-'campaign_pricing'-'payment_session_id'-'provider_payment_id')||jsonb_build_object('commercial_agreement_id',a.id,'commercial_cycle',a.paid_cycles,'cycle_start_at',next_start,'renewal',true)) returning id into oid;
 insert into public.sales_catalog_order_items(order_id,organization_id,catalog_item_id,title,tag,quantity,unit_price,sale_price,total,attributes,fulfillment,metadata,sku_id,sku_code)
  values(oid,a.organization_id,item.catalog_item_id,item.title,item.tag,item.quantity,pricing->>'list_price_brl',pricing->>'price_brl',((pricing->>'list_price_brl')::numeric*item.quantity)::text,item.attributes,item.fulfillment,item.metadata,item.sku_id,item.sku_code) returning id into iid;
 perform public.apply_store_campaign_period(a.id,oid,a.paid_cycles,iid);
 return oid;
end $$;

create or replace function public.finish_store_contract_period() returns trigger language plpgsql security definer set search_path=public as $$
declare a public.commercial_agreements; pricing jsonb; start_at timestamptz; end_at timestamptz; months integer; days integer;
begin
 if new.payment_status::text<>'confirmed' or old.payment_status::text='confirmed' then return new; end if;
 select * into a from public.commercial_agreements where id=(new.metadata->>'commercial_agreement_id')::uuid and organization_id=new.organization_id for update;
 if a.id is null then return new; end if;
 if exists(select 1 from public.commercial_agreement_periods where order_id=new.id and fulfilled_at is not null) then return new; end if;
 update public.commercial_agreement_periods set fulfilled_at=now() where order_id=new.id;
 pricing:=new.metadata->'campaign_pricing';
 start_at:=greatest(now(),coalesce((new.metadata->>'cycle_start_at')::timestamptz,now()),coalesce(a.period_end,now()));
 months:=case pricing->>'interval' when 'year' then 12 when 'semester' then 6 when 'quarter' then 3 when 'month' then 1 else 0 end;
 days:=case pricing->>'interval' when 'week' then 7 else 0 end;
 end_at:=start_at+make_interval(months=>months,days=>days);
 update public.commercial_agreements set period_start=start_at,period_end=end_at,state=case when metadata->>'recurring'='true' and not cancel_at_period_end then 'active' else 'ended' end where id=a.id;
 update public.commercial_card_vault set status='revoked' where agreement_id=a.id and status='active'
  and exists(select 1 from public.commercial_card_vault v join public.sales_catalog_card_attempts ca on ca.id=v.activation_attempt_id where v.agreement_id=a.id and v.status='pending' and ca.order_id=new.id and ca.state='approved');
 update public.commercial_card_vault v set status='active' where v.agreement_id=a.id and v.status='pending'
  and exists(select 1 from public.sales_catalog_card_attempts ca where ca.id=v.activation_attempt_id and ca.order_id=new.id and ca.state='approved');
 return new;
end $$;
create trigger finish_store_contract_period after update of payment_status on public.sales_catalog_orders for each row execute function public.finish_store_contract_period();

create or replace function public.cancel_store_commercial_agreement(p_agreement uuid,p_org uuid) returns void language plpgsql security definer set search_path=public as $$
declare a public.commercial_agreements;
begin
 select * into a from public.commercial_agreements where id=p_agreement and organization_id=p_org and owner_type='store' for update;
 if not found then raise exception 'COMMERCE_CONTRACT_NOT_FOUND'; end if;
 update public.commercial_agreements set cancel_at_period_end=true,state='cancelled',updated_at=now() where id=a.id;
 update public.commercial_card_vault set status='revoked' where agreement_id=a.id;
 insert into public.commercial_events(organization_id,lead_id,campaign_id,agreement_id,event_key,event_type,payload)
  values(a.organization_id,a.lead_id,a.campaign_id,a.id,'cancel:'||a.id,'subscription_cancelled',jsonb_build_object('access_until',a.period_end,'notice','Renovação cancelada. O período já pago permanece registrado.')) on conflict(event_key) do nothing;
end $$;
do $$ declare f record; begin
 for f in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname in ('apply_store_campaign_period','prepare_store_contract_period','finish_store_contract_period','cancel_store_commercial_agreement') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig); execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
