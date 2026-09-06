alter table public.sales_catalog_card_attempts add column if not exists diagnostic jsonb;
alter table public.billing_card_attempts add column if not exists diagnostic jsonb;

create table if not exists public.sales_catalog_payment_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  lead_id uuid not null references public.leads(id),
  order_id uuid references public.sales_catalog_orders(id),
  conversation_id uuid,
  status text not null default 'open' check(status in ('open','in_review','resolved')),
  notification_status text not null default 'pending',
  notification_payload jsonb, notification_claimed_at timestamptz, notification_next_at timestamptz not null default now(),
  resolution_notice_state text not null default 'pending',
  requested_at timestamptz not null default now(),
  resolved_at timestamptz, resolved_by uuid, resolution text, verification_reference text,
  updated_at timestamptz not null default now()
);
create unique index if not exists payment_review_open_order on public.sales_catalog_payment_reviews(organization_id,lead_id,coalesce(order_id,'00000000-0000-0000-0000-000000000000'::uuid)) where status<>'resolved';
create table if not exists public.sales_catalog_payment_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id), lead_id uuid not null references public.leads(id),
  order_id uuid references public.sales_catalog_orders(id), review_id uuid references public.sales_catalog_payment_reviews(id),
  conversation_id uuid not null, message_id uuid not null,
  kind text not null check(kind in ('claim','attachment')),
  created_at timestamptz not null default now(),
  unique(organization_id,message_id)
);
alter table public.sales_catalog_payment_reviews enable row level security;
alter table public.sales_catalog_payment_evidence enable row level security;
revoke all on public.sales_catalog_payment_reviews,public.sales_catalog_payment_evidence from anon,authenticated;
grant all on public.sales_catalog_payment_reviews,public.sales_catalog_payment_evidence to service_role;

create or replace function public.finish_checkout_card_attempt_diagnostic(p_attempt_id uuid,p_state text,p_provider_id text default null,p_provider_status text default null,p_diagnostic jsonb default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; a public.sales_catalog_card_attempts; safe jsonb;
begin
  result:=public.finish_checkout_card_attempt(p_attempt_id,p_state,p_provider_id,p_provider_status);
  if p_diagnostic is not null then
    safe:=jsonb_build_object('category',case when p_diagnostic->>'category' in ('declined','validation','integration','unknown') then p_diagnostic->>'category' else 'unknown' end,
      'stage',case when p_diagnostic->>'stage' in ('customer_lookup','customer_create','payment_create','reconcile') then p_diagnostic->>'stage' else 'reconcile' end,
      'code',case when p_diagnostic->>'code' in ('invalid_creditCard','invalid_creditCardHolderInfo','invalid_cpfCnpj','invalid_customer','invalid_value','invalid_installmentCount','invalid_access_token','access_token_not_found','invalid_object','invalid_action','invalid_payment') then p_diagnostic->>'code' else 'not_informed' end,
      'httpStatus',case when p_diagnostic->>'httpStatus' ~ '^[1-5][0-9][0-9]$' then (p_diagnostic->>'httpStatus')::int else null end);
    update public.sales_catalog_card_attempts set diagnostic=safe where id=p_attempt_id and state=p_state and diagnostic is distinct from safe returning * into a;
    if found then
      insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
      select 'organization',a.organization_id,'sales_catalog_payment_session',a.payment_session_id,'sales_catalog.payment_diagnostic','Diagnóstico do pagamento','Resultado da tentativa registrado com diagnóstico seguro.','organization',array['payment','lead_tracking'],
        jsonb_build_object('lead_id',o.lead_id,'order_id',o.id,'attempt_id',a.id,'payment_status',a.state,'diagnostic',safe)
        from public.sales_catalog_orders o where o.id=a.order_id;
      result:=jsonb_set(result,'{attempt}',to_jsonb(a));
    end if;
  end if;
  return result;
end $$;

create or replace function public.record_checkout_payment_evidence(p_organization_id uuid,p_lead_id uuid,p_conversation_id uuid,p_message_id uuid,p_order_id uuid,p_kind text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.sales_catalog_orders; r public.sales_catalog_payment_reviews; e public.sales_catalog_payment_evidence; confirmed boolean:=false;
begin
  if p_kind not in ('claim','attachment') then raise exception 'INVALID_EVIDENCE'; end if;
  perform 1 from public.leads where id=p_lead_id and organization_id=p_organization_id;
  if not found then raise exception 'LEAD_NOT_FOUND'; end if;
  if p_order_id is not null then
    select * into o from public.sales_catalog_orders where id=p_order_id and organization_id=p_organization_id and lead_id=p_lead_id for update;
    if not found then raise exception 'ORDER_NOT_FOUND'; end if;
    confirmed:=o.payment_status::text='confirmed';
  else
    perform 1 from public.leads where id=p_lead_id and organization_id=p_organization_id for update;
  end if;
  perform 1 from public.conversation_messages where id=p_message_id and organization_id=p_organization_id and lead_id=p_lead_id and conversation_id=p_conversation_id and direction='inbound';
  if not found then raise exception 'MESSAGE_NOT_FOUND'; end if;
  select * into e from public.sales_catalog_payment_evidence where organization_id=p_organization_id and message_id=p_message_id;
  if found then
    select * into r from public.sales_catalog_payment_reviews where id=e.review_id;
    return jsonb_build_object('evidence',to_jsonb(e),'review',case when r.id is not null then to_jsonb(r) else null end,'duplicate',true);
  end if;
  if not confirmed then
    select * into r from public.sales_catalog_payment_reviews where organization_id=p_organization_id and lead_id=p_lead_id and order_id is not distinct from p_order_id and status<>'resolved' for update;
    if not found then
      insert into public.sales_catalog_payment_reviews(organization_id,lead_id,order_id,conversation_id) values(p_organization_id,p_lead_id,p_order_id,p_conversation_id) returning * into r;
    end if;
  end if;
  insert into public.sales_catalog_payment_evidence(organization_id,lead_id,order_id,review_id,conversation_id,message_id,kind)
    values(p_organization_id,p_lead_id,p_order_id,r.id,p_conversation_id,p_message_id,p_kind) returning * into e;
  insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
    values('organization',p_organization_id,'sales_catalog_order',coalesce(p_order_id,r.id,e.id),'sales_catalog.payment_evidence_received','Informação de pagamento recebida',
      case when confirmed then 'Evidência anexada ao pagamento já confirmado.' else 'Evidência recebida; pagamento permanece sem confirmação. Revisão financeira aberta.' end,
      'organization',array['payment','lead_tracking','review'],jsonb_build_object('lead_id',p_lead_id,'conversation_id',p_conversation_id,'order_id',p_order_id,'review_id',r.id,'message_id',p_message_id,'kind',p_kind,'payment_status',o.payment_status));
  return jsonb_build_object('evidence',to_jsonb(e),'review',case when r.id is not null then to_jsonb(r) else null end,'confirmed',confirmed,'duplicate',false);
end $$;

create or replace function public.assert_checkout_review_clear(p_order_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.sales_catalog_payment_reviews r join public.sales_catalog_orders o on o.organization_id=r.organization_id and o.lead_id=r.lead_id where o.id=p_order_id and (r.order_id is null or r.order_id=o.id) and r.status<>'resolved') then raise exception 'CHECKOUT_FINANCIAL_REVIEW'; end if;
end $$;
create or replace function public.guard_checkout_review() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_table_name='sales_catalog_orders' then
    if new.payment_status::text='proof_sent' or (old.payment_status::text='confirmed' and new.payment_status::text in ('failed','pending')) or (old.payment_status::text='refunded' and new.payment_status::text<>'refunded') then
      new.payment_status:=old.payment_status;
      new.status:=old.status;
      new.latest_payment_session_id:=old.latest_payment_session_id;
    end if;
  end if;
  if tg_table_name='sales_catalog_payment_sessions' then
    if new.status in ('created','pending') then perform public.assert_checkout_review_clear(new.order_id); end if;
  elsif tg_table_name='sales_catalog_order_items' then
    perform public.assert_checkout_review_clear(case when tg_op='DELETE' then old.order_id else new.order_id end);
  elsif (new.total,new.subtotal,new.discount_total,new.shipping_total,new.destination_address,new.destination_cep) is distinct from (old.total,old.subtotal,old.discount_total,old.shipping_total,old.destination_address,old.destination_cep) then
    perform public.assert_checkout_review_clear(new.id);
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger checkout_review_payment_guard before insert on public.sales_catalog_payment_sessions for each row execute function public.guard_checkout_review();
create trigger checkout_review_items_guard before insert or update or delete on public.sales_catalog_order_items for each row execute function public.guard_checkout_review();
create trigger checkout_review_order_guard before update on public.sales_catalog_orders for each row execute function public.guard_checkout_review();

create or replace function public.resolve_checkout_payment_review(p_review_id uuid,p_organization_id uuid,p_actor_id uuid,p_resolution text,p_reference text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.sales_catalog_payment_reviews; o public.sales_catalog_orders;
begin
  select * into r from public.sales_catalog_payment_reviews where id=p_review_id and organization_id=p_organization_id;
  if not found then raise exception 'REVIEW_NOT_FOUND'; end if;
  if r.order_id is not null then select * into o from public.sales_catalog_orders where id=r.order_id and organization_id=r.organization_id for update;
  else perform 1 from public.leads where id=r.lead_id and organization_id=r.organization_id for update; end if;
  select * into r from public.sales_catalog_payment_reviews where id=p_review_id for update;
  if r.status='resolved' then return to_jsonb(r); end if;
  if p_actor_id is null or length(trim(coalesce(p_reference,'')))<5 or p_resolution not in ('confirmed','unconfirmed') then raise exception 'VERIFICATION_REQUIRED'; end if;
  if p_resolution='confirmed' and (o.id is null or o.payment_status::text<>'confirmed') then raise exception 'PAYMENT_NOT_CONFIRMED'; end if;
  if p_resolution='unconfirmed' and o.payment_status::text='confirmed' then raise exception 'PAYMENT_ALREADY_CONFIRMED'; end if;
  if p_resolution='unconfirmed' and (o.checkout_payment_lock is not null or exists(select 1 from public.sales_catalog_payment_sessions where order_id=o.id and (metadata->>'gateway_request_inflight'='true' or status='pending'))) then raise exception 'PAYMENT_STILL_VERIFYING'; end if;
  update public.sales_catalog_payment_reviews set status='resolved',resolved_at=now(),updated_at=now(),resolved_by=p_actor_id,resolution=p_resolution,verification_reference=left(p_reference,500) where id=r.id returning * into r;
  insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
    values('organization',r.organization_id,'sales_catalog_order',coalesce(r.order_id,r.id),'sales_catalog.payment_review_resolved','Conferência financeira concluída','A equipe registrou o resultado da conferência.','organization',array['payment','lead_tracking','review'],jsonb_build_object('lead_id',r.lead_id,'order_id',r.order_id,'review_id',r.id,'resolution',r.resolution,'resolved_by',p_actor_id,'verification_reference',r.verification_reference));
  return to_jsonb(r);
end $$;
revoke all on function public.finish_checkout_card_attempt_diagnostic(uuid,text,text,text,jsonb),public.record_checkout_payment_evidence(uuid,uuid,uuid,uuid,uuid,text),public.assert_checkout_review_clear(uuid),public.resolve_checkout_payment_review(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finish_checkout_card_attempt_diagnostic(uuid,text,text,text,jsonb),public.record_checkout_payment_evidence(uuid,uuid,uuid,uuid,uuid,text),public.assert_checkout_review_clear(uuid),public.resolve_checkout_payment_review(uuid,uuid,uuid,text,text) to service_role;
create index if not exists lead_financial_event_lookup on public.intelligence_events(organization_id,(payload->>'lead_id'),occurred_at desc);

create or replace function public.claim_lead_payment_check(p_order_id uuid,p_organization_id uuid,p_lead_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.sales_catalog_orders set metadata=coalesce(metadata,'{}')||jsonb_build_object('financial_checked_at',now())
    where id=p_order_id and organization_id=p_organization_id and lead_id=p_lead_id and
      (metadata->>'financial_checked_at' is null or (metadata->>'financial_checked_at')::timestamptz<now()-interval '30 seconds');
  return found;
end $$;
create or replace function public.claim_payment_review_notification(p_review_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.sales_catalog_payment_reviews;
begin
  update public.sales_catalog_payment_reviews set notification_claimed_at=now() where id=p_review_id and status<>'resolved' and notification_status<>'sent' and notification_payload is not null
    and notification_next_at<=now() and (notification_claimed_at is null or notification_claimed_at<now()-interval '5 minutes') returning * into r;
  return case when r.id is null then null else to_jsonb(r) end;
end $$;

-- Only a server-verified provider response reaches this RPC. Browser tracking cannot call it.
create or replace function public.apply_verified_catalog_payment(p_session_id uuid,p_organization_id uuid,p_state text,p_provider_status text,p_provider_id text) returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.sales_catalog_payment_sessions; o public.sales_catalog_orders; changed boolean:=false;
begin
  select * into s from public.sales_catalog_payment_sessions where id=p_session_id and organization_id=p_organization_id;
  if not found or s.provider<>'asaas' or s.provider_payment_id<>p_provider_id or p_state not in ('approved','pending','cancelled','rejected','refunded') then raise exception 'PAYMENT_MISMATCH'; end if;
  select * into o from public.sales_catalog_orders where id=s.order_id and organization_id=p_organization_id for update;
  select * into s from public.sales_catalog_payment_sessions where id=p_session_id for update;
  if s.status='refunded' or (s.status='approved' and p_state<>'refunded') then return jsonb_build_object('changed',false); end if;
  changed:=s.status is distinct from p_state;
  update public.sales_catalog_payment_sessions set status=p_state,provider_status=p_provider_status,updated_at=now(),paid_at=case when p_state='approved' then coalesce(paid_at,now()) else paid_at end where id=s.id;
  if o.payment_status::text<>'refunded' and (p_state='approved' or (p_state='refunded' and o.latest_payment_session_id=s.id)) then
    update public.sales_catalog_orders set payment_status=case when p_state='approved' then 'confirmed' else 'refunded' end::public.sales_catalog_payment_status,
      status=case when p_state='approved' and status::text in ('draft','pending_payment','needs_human') then 'paid'::public.sales_catalog_order_status else status end,
      latest_payment_session_id=s.id, checkout_payment_lock=null, updated_at=now() where id=o.id;
  end if;
  if changed then
    insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
    values('organization',p_organization_id,'sales_catalog_order',o.id,'sales_catalog.payment_reconciled','Pagamento conferido no provedor','Retorno verificado registrado.','organization',array['payment','lead_tracking'],jsonb_build_object('lead_id',o.lead_id,'order_id',o.id,'payment_session_id',s.id,'payment_status',p_state,'origin','provider_query'));
  end if;
  return jsonb_build_object('changed',changed);
end $$;

create or replace function public.resolve_reviews_on_verified_payment() returns trigger language plpgsql security definer set search_path=public as $$
declare r record;
begin
  if new.payment_status::text='confirmed' and old.payment_status::text<>'confirmed' then
    for r in update public.sales_catalog_payment_reviews set status='resolved',resolution='confirmed',verification_reference='verified_order:'||new.id::text,resolved_at=now(),updated_at=now()
      where organization_id=new.organization_id and order_id=new.id and status<>'resolved' returning * loop
      insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
        values('organization',new.organization_id,'sales_catalog_order',new.id,'sales_catalog.payment_review_resolved','Pagamento confirmado durante a conferência','Confirmação financeira encerrou a divergência.','organization',array['payment','lead_tracking'],jsonb_build_object('lead_id',new.lead_id,'order_id',new.id,'review_id',r.id,'resolution','confirmed','origin','backend'));
    end loop;
  end if;
  return new;
end $$;
create trigger payment_review_verified_resolution after update of payment_status on public.sales_catalog_orders for each row execute function public.resolve_reviews_on_verified_payment();
revoke all on function public.claim_lead_payment_check(uuid,uuid,uuid),public.claim_payment_review_notification(uuid),public.apply_verified_catalog_payment(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_lead_payment_check(uuid,uuid,uuid),public.claim_payment_review_notification(uuid),public.apply_verified_catalog_payment(uuid,uuid,text,text,text) to service_role;

create or replace function public.release_resolved_financial_handoff() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='resolved' and old.status<>'resolved' and not exists(select 1 from public.sales_catalog_payment_reviews where organization_id=new.organization_id and lead_id=new.lead_id and status<>'resolved') then
    update public.conversations set metadata=jsonb_set(coalesce(metadata,'{}'),'{human_intervention}',coalesce(metadata->'human_intervention','{}')||jsonb_build_object('active',false,'paused_until',null,'resolution','financial_review_resolved'))
      where organization_id=new.organization_id and lead_id=new.lead_id and metadata->'human_intervention'->>'reason'='financial_review';
    update public.leads set metadata=coalesce(metadata,'{}')||jsonb_build_object('financial_review',jsonb_build_object('id',new.id,'status','resolved','resolution',new.resolution)) where id=new.lead_id and organization_id=new.organization_id;
  end if;
  return new;
end $$;
create trigger payment_review_release_handoff after update of status on public.sales_catalog_payment_reviews for each row execute function public.release_resolved_financial_handoff();

create or replace function public.confirm_catalog_payment_manually(p_order_id uuid,p_organization_id uuid,p_actor_id uuid,p_reference text) returns void language plpgsql security definer set search_path=public as $$
declare o public.sales_catalog_orders;
begin
  if p_actor_id is null or length(trim(coalesce(p_reference,'')))<5 then raise exception 'VERIFICATION_REQUIRED'; end if;
  select * into o from public.sales_catalog_orders where id=p_order_id and organization_id=p_organization_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.payment_status::text='confirmed' then return; end if;
  if o.payment_status::text='refunded' or o.checkout_payment_lock is not null or exists(select 1 from public.sales_catalog_payment_sessions where order_id=o.id and (metadata->>'gateway_request_inflight'='true' or status='pending')) then raise exception 'PAYMENT_STILL_VERIFYING'; end if;
  update public.sales_catalog_orders set payment_status='confirmed',status=case when status::text in ('draft','pending_payment','needs_human') then 'paid'::public.sales_catalog_order_status else status end,
    metadata=coalesce(metadata,'{}')||jsonb_build_object('financial_confirmation',jsonb_build_object('origin','operator','actor_id',p_actor_id,'reference',left(p_reference,500),'confirmed_at',now())) where id=o.id;
  insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
    values('organization',p_organization_id,'sales_catalog_order',o.id,'sales_catalog.payment_manually_confirmed','Confirmação financeira manual','Responsável autorizado confirmou o recebimento após conferência.','organization',array['payment','lead_tracking'],jsonb_build_object('lead_id',o.lead_id,'order_id',o.id,'actor_id',p_actor_id,'origin','operator','verification_reference',left(p_reference,500)));
end $$;
revoke all on function public.confirm_catalog_payment_manually(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.confirm_catalog_payment_manually(uuid,uuid,uuid,text) to service_role;
