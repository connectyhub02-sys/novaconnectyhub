-- Recover a definitively unissued payment without creating another order or
-- weakening the durable guards for an uncertain/confirmed financial result.
create or replace function public.begin_checkout_gateway_request(p_session_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare s public.sales_catalog_payment_sessions; o public.sales_catalog_orders;
begin
  select * into s from public.sales_catalog_payment_sessions where id=p_session_id;
  if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
  select * into o from public.sales_catalog_orders where id=s.order_id and organization_id=s.organization_id for update;
  if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
  -- Lead-wide evidence uses this same lock; order-specific evidence locks o.
  perform 1 from public.leads where id=o.lead_id and organization_id=o.organization_id for update;
  select * into s from public.sales_catalog_payment_sessions where id=p_session_id and order_id=o.id and organization_id=o.organization_id for update;
  if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
  perform public.assert_checkout_review_clear(o.id);
  if o.payment_status::text in ('confirmed','refunded','proof_sent')
    or o.status::text not in ('draft','pending_payment','needs_human') then raise exception 'CHECKOUT_CLOSED'; end if;
  if exists(select 1 from public.sales_catalog_order_revisions where order_id=o.id and state in ('processing','blocked')) then raise exception 'CHECKOUT_REVISION_BUSY'; end if;
  if o.checkout_payment_lock is not null or exists(select 1 from public.sales_catalog_card_attempts where order_id=o.id
    and state in ('processing','unknown','pending','approved','refunded')) then raise exception 'CHECKOUT_PAYMENT_BUSY'; end if;
  if s.status not in ('created','pending','error') or s.amount is distinct from public.checkout_money(o.total)
    or s.metadata->>'order_revision_superseded_by_request_id' is not null
    or s.metadata->>'checkout_customer_superseded_at' is not null then raise exception 'CHECKOUT_CHANGED'; end if;
  if s.metadata ? 'checkout_revision' and
    (coalesce(s.metadata->>'checkout_revision','') !~ '^[0-9]+$'
      or (s.metadata->>'checkout_revision')::numeric<>o.checkout_revision) then raise exception 'CHECKOUT_CHANGED'; end if;
  -- Check again after acquiring the order: a competing Pix may have completed
  -- between our caller's read and this claim. Never generate a second live Pix.
  if exists(select 1 from public.sales_catalog_payment_sessions where order_id=o.id and
    (metadata->>'gateway_request_inflight'='true' or provider_status_detail='verification_pending'
      or status in ('approved','refunded')
      or provider_payment_id is not null and status in ('created','pending','error'))) then raise exception 'CHECKOUT_PAYMENT_BUSY'; end if;
  update public.sales_catalog_payment_sessions set metadata=coalesce(metadata,'{}')||
    jsonb_build_object('gateway_request_inflight',true,'gateway_request_started_at',now(),'checkout_revision',o.checkout_revision) where id=s.id;
end $$;

-- Delayed gateway failure writes often carry an older metadata snapshot. They
-- must not revive a stale customer snapshot or request an already corrected field.
create function public.guard_sales_catalog_payment_recovery() returns trigger
language plpgsql set search_path=public as $$
begin
  if old.metadata->>'checkout_customer_superseded_at' is not null then
    new.metadata:=coalesce(new.metadata,'{}')||jsonb_build_object('checkout_customer_superseded_at',old.metadata->'checkout_customer_superseded_at');
  end if;
  if old.metadata->'payment_recovery'->>'corrected_at' is not null then
    new.metadata:=coalesce(new.metadata,'{}')||jsonb_build_object('payment_recovery',old.metadata->'payment_recovery','gateway_request_inflight',false);
  end if;
  return new;
end $$;
create trigger sales_catalog_payment_recovery_guard before update on public.sales_catalog_payment_sessions
  for each row execute function public.guard_sales_catalog_payment_recovery();

create function public.recover_sales_catalog_payment_customer_field(
  p_organization_id uuid,p_order_id uuid,p_conversation_id uuid,p_lead_id uuid,
  p_session_id uuid,p_expected_revision bigint,p_field text,p_value text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.sales_catalog_orders; s public.sales_catalog_payment_sessions; v_value text; v_recovery jsonb; v_legacy boolean:=false;
begin
  select * into o from public.sales_catalog_orders where id=p_order_id and organization_id=p_organization_id
    and lead_id=p_lead_id and conversation_id=p_conversation_id for update;
  if not found or not exists(select 1 from public.conversations where id=p_conversation_id and organization_id=p_organization_id and lead_id=p_lead_id)
    then raise exception 'CHECKOUT_NOT_FOUND'; end if;
  perform 1 from public.leads where id=p_lead_id and organization_id=p_organization_id for update;
  if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
  select * into s from public.sales_catalog_payment_sessions where id=p_session_id and organization_id=o.organization_id and order_id=o.id for update;
  if not found then raise exception 'CHECKOUT_NOT_FOUND'; end if;
  -- This exact legacy adapter failure happened before any charge could exist.
  -- Promote only the requested session, under the same locks as the correction.
  -- A supplied recovery marker (even null), another error or a remote identifier
  -- must never be relabelled by matching part of a free-form provider message.
  v_legacy:=s.provider='asaas' and s.method='pix' and s.status='error'
    and s.provider_status='gateway_error' and s.provider_payment_id is null
    and not(coalesce(s.metadata,'{}') ? 'payment_recovery')
    and s.metadata->'gateway_request_inflight'='true'::jsonb
    and s.failure_reason='O CPF/CNPJ informado é inválido.'
    and s.metadata->>'gateway_error'='O CPF/CNPJ informado é inválido.';
  v_legacy:=coalesce(v_legacy,false);
  v_recovery:=case when v_legacy then jsonb_build_object('safe_to_retry',true,'stage','customer_create','category','validation','field','customer_document')
    else s.metadata->'payment_recovery' end;
  if p_expected_revision is null or p_expected_revision<>o.checkout_revision then raise exception 'CHECKOUT_CHANGED'; end if;
  if o.payment_status::text in ('confirmed','refunded','proof_sent')
    or o.status::text not in ('draft','pending_payment','needs_human') then raise exception 'CHECKOUT_CLOSED'; end if;
  perform public.assert_checkout_review_clear(o.id);
  if exists(select 1 from public.sales_catalog_order_revisions where order_id=o.id and state in ('processing','blocked')) then raise exception 'CHECKOUT_REVISION_BUSY'; end if;
  if o.checkout_payment_lock is not null or exists(select 1 from public.sales_catalog_card_attempts where order_id=o.id
    and state in ('processing','unknown','pending','approved','refunded')) then raise exception 'CHECKOUT_PAYMENT_BUSY'; end if;
  if exists(select 1 from public.sales_catalog_payment_sessions where order_id=o.id and
    (metadata->>'gateway_request_inflight'='true' and not(v_legacy and id=s.id) or provider_status_detail='verification_pending'
      or status in ('approved','refunded')
      or provider_payment_id is not null and status in ('created','pending','error'))) then raise exception 'CHECKOUT_PAYMENT_BUSY'; end if;
  if s.provider<>'asaas' or s.status<>'error' or s.provider_payment_id is not null
    or v_recovery->'safe_to_retry' is distinct from 'true'::jsonb
    or v_recovery->>'category' is distinct from 'validation'
    or v_recovery->>'field' is distinct from p_field
    or coalesce(v_recovery->>'stage','') not in ('customer_lookup','customer_create','payment_create')
    or v_recovery->>'corrected_at' is not null then raise exception 'CHECKOUT_RECOVERY_NOT_ALLOWED'; end if;
  if p_field is null or p_field not in ('customer_document','customer_name','customer_email','customer_phone') then raise exception 'CHECKOUT_RECOVERY_INVALID_FIELD'; end if;
  v_value:=trim(coalesce(p_value,''));
  if p_field='customer_document' then
    if v_value !~ '^([0-9]{11}|[0-9]{14})$' or v_value ~ '^([0-9])\1+$' then raise exception 'CHECKOUT_RECOVERY_INVALID_VALUE'; end if;
  elsif p_field='customer_email' then
    if length(v_value)>254 or v_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'CHECKOUT_RECOVERY_INVALID_VALUE'; end if;
  elsif p_field='customer_phone' then
    if v_value !~ '^[0-9]{10,15}$' then raise exception 'CHECKOUT_RECOVERY_INVALID_VALUE'; end if;
  else
    if length(v_value) not between 3 and 160 or v_value ~ '[[:cntrl:]]' then raise exception 'CHECKOUT_RECOVERY_INVALID_VALUE'; end if;
  end if;
  if (case when p_field in ('customer_document','customer_phone')
      then regexp_replace(coalesce(to_jsonb(o)->>p_field,''),'[^0-9]','','g')=v_value
      else lower(trim(coalesce(to_jsonb(o)->>p_field,'')))=lower(v_value) end)
    then raise exception 'CHECKOUT_RECOVERY_VALUE_UNCHANGED'; end if;
  -- No freight, amount, item, payment status, preference or consent is changed.
  update public.sales_catalog_orders set
    customer_document=case when p_field='customer_document' then v_value else customer_document end,
    customer_name=case when p_field='customer_name' then v_value else customer_name end,
    customer_email=case when p_field='customer_email' then v_value else customer_email end,
    customer_phone=case when p_field='customer_phone' then v_value else customer_phone end,
    checkout_revision=checkout_revision+1,updated_at=now()
    where id=o.id returning * into o;
  -- The payer can differ from the contact. Do not change WhatsApp routing or the
  -- lead's personal identity when correcting a billing name/phone/email.
  update public.leads set
    metadata=coalesce(metadata,'{}')||jsonb_build_object(p_field,v_value,'lead_memory',coalesce(metadata->'lead_memory','{}')||jsonb_build_object(p_field,v_value)),
    updated_at=now() where id=p_lead_id and organization_id=p_organization_id;
  update public.sales_catalog_payment_sessions set metadata=coalesce(metadata,'{}')||
    jsonb_build_object('checkout_customer_superseded_at',now()),updated_at=now()
    where order_id=o.id and organization_id=o.organization_id and provider_payment_id is null and status in ('created','pending','error');
  update public.sales_catalog_payment_sessions set metadata=coalesce(metadata,'{}')||
    jsonb_build_object('gateway_request_inflight',false,'payment_recovery',(v_recovery-'field')||jsonb_build_object('corrected_field',p_field,'corrected_at',now(),'checkout_revision',o.checkout_revision)),
    updated_at=now() where id=s.id;
  insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
    values('organization',o.organization_id,'sales_catalog_order',o.id,'sales_catalog.payment_customer_corrected','Cadastro do pagamento corrigido',
      'O cliente corrigiu o campo solicitado para continuar o mesmo pedido.','organization',array['sales_catalog','payment','lead_tracking'],
      jsonb_build_object('lead_id',o.lead_id,'conversation_id',o.conversation_id,'order_id',o.id,'payment_session_id',s.id,'field',p_field,'checkout_revision',o.checkout_revision));
  return jsonb_build_object('order_id',o.id,'checkout_revision',o.checkout_revision);
end $$;

revoke all on function public.begin_checkout_gateway_request(uuid),public.guard_sales_catalog_payment_recovery(),
  public.recover_sales_catalog_payment_customer_field(uuid,uuid,uuid,uuid,uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.begin_checkout_gateway_request(uuid),public.guard_sales_catalog_payment_recovery(),
  public.recover_sales_catalog_payment_customer_field(uuid,uuid,uuid,uuid,uuid,bigint,text,text) to service_role;
