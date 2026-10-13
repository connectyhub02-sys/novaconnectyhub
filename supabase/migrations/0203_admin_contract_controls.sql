create or replace function public.resolve_organization_contract_access(p_organization uuid,p_now timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare o public.organizations; target public.organizations; s public.organization_subscriptions;
  deadline timestamptz; period_end timestamptz; policy jsonb; grace integer:=3;
  allowed boolean:=false; manual_access boolean:=false; reason text:='inactive';
begin
  select * into target from public.organizations where id=p_organization;
  if not found then return jsonb_build_object('allowed',false,'reason','not_found','organization_id',p_organization); end if;
  select * into o from public.organizations where id=coalesce(target.billing_organization_id,target.id);
  if lower(target.status) in ('suspended','paused','blocked','inactive','archived')
    or lower(o.status) in ('suspended','paused','blocked','inactive','archived') then
    reason:='administrative_suspension';
  elsif o.plan_code='internal' then allowed:=true; reason:='internal';
  elsif o.plan_code='trial' then
    select max(c.cycle_end) into period_end from public.billing_cycles c join public.billing_plans p on p.id=c.plan_id
      where c.organization_id=o.id and p.plan_code='trial';
    period_end:=coalesce(period_end,o.created_at+interval '7 days');
    deadline:=period_end; allowed:=o.status<>'trial_pending' and p_now<deadline;
    reason:=case when o.status='trial_pending' then 'signup_required' when allowed then 'trial_active' else 'trial_expired' end;
  else
    select * into s from public.organization_subscriptions where organization_id=o.id and plan_code=o.plan_code and subscription_kind='plan'
      and status in ('active','past_due','canceled','paused')
      order by current_period_end desc nulls last,created_at desc limit 1;
    period_end:=coalesce(s.current_period_end,s.next_billing_at);
    if period_end is null then
      select max(c.cycle_end) into period_end from public.billing_cycles c join public.billing_plans p on p.id=c.plan_id
        where c.organization_id=o.id and p.plan_code=o.plan_code;
    end if;
    select metadata->'renewal_policy' into policy from public.platform_billing_settings where setting_key='default';
    grace:=greatest(coalesce((policy->>'grace_period_days')::integer,3),coalesce((policy->>'suspend_after_days')::integer,3));
    if s.status in ('cancelled','canceled','expired') or s.metadata#>>'{commercial_terms,billing_cycle}'='one_time' then grace:=0; end if;
    deadline:=period_end+make_interval(days=>greatest(0,least(grace,30)));
    allowed:=s.status is distinct from 'paused' and deadline is not null and p_now<deadline;
    if s.status in ('active','past_due') and s.metadata#>>'{commercial_terms,custom_contract_id}' is not null
      and (s.metadata->>'admin_access_until')::timestamptz>p_now then
      deadline:=greatest(deadline,(s.metadata->>'admin_access_until')::timestamptz); allowed:=true; manual_access:=true;
    end if;
    reason:=case when manual_access then 'admin_manual_access' when s.status='paused' then 'administrative_suspension' when period_end is null then 'contract_missing' when not allowed then 'paid_expired' when p_now>=period_end then 'grace_period' else 'paid_active' end;
  end if;
  return jsonb_build_object('organization_id',target.id,'billing_organization_id',o.id,'plan_code',o.plan_code,
    'allowed',allowed,'reason',reason,'period_end',period_end,'blocked_at',deadline,'subscription_id',s.id);
end $$;
revoke all on function public.resolve_organization_contract_access(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.resolve_organization_contract_access(uuid,timestamptz) to service_role;


create or replace function public.stamp_custom_contract_payment() returns trigger
language plpgsql security definer set search_path=public as $$
declare c public.organization_custom_contracts; m jsonb; terms jsonb; base numeric; additions numeric; starts timestamptz; plan text;
begin
  m:=coalesce(new.payload,'{}');
  if coalesce(m->>'purchase_kind','plan')<>'plan' or new.subscription_id is null then return new; end if;
  if exists(select 1 from public.organization_subscriptions where id=new.subscription_id and metadata->>'billing_terms_mode'='catalog') then return new; end if;
  plan:=coalesce(m->>'target_plan_code',m->>'requested_plan_code',(select plan_code from public.organization_subscriptions where id=new.subscription_id));
  starts:=coalesce((m->>'cycle_start_at')::timestamptz,now());
  select * into c from public.organization_custom_contracts where organization_id=new.organization_id and base_plan_code=plan and effective_at<=starts order by effective_at desc,version desc limit 1;
  if c.id is null then return new; end if;
  additions:=coalesce((select sum((b->>'price_brl')::numeric) from jsonb_array_elements(coalesce(m->'selected_bumps','[]')) b),0);
  base:=c.monthly_price_brl;
  terms:=jsonb_build_object('billing_cycle','recurring','billing_interval','month','access_duration_days',null,'price_brl',base,'list_price_brl',base,'annual_discount_percent',0,'first_purchase_discount_percent',0,'included_credits',c.included_credits,'custom_contract_id',c.id,'custom_contract_version',c.version,'name',c.name,'resource_limits',c.resource_limits,'features',c.features);
  new.amount_brl:=base+additions;
  new.payload:=(m-'campaign_pricing'-'campaign_selection'-'plan_pricing')||jsonb_build_object('commercial_terms',terms,'plan_amount_brl',base,'checkout_total_brl',base+additions,'cycle_start_at',starts,'cycle_end_at',case when m->>'checkout_kind'='initial' and c.first_period_end>starts then c.first_period_end else starts+interval '1 month' end);
  return new;
end $$;

create or replace function public.prepare_contract_renewal_before_campaigns(p_subscription uuid,p_expected_end timestamptz,p_start timestamptz,p_end timestamptz,p_provider text,p_metadata jsonb) returns jsonb
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
  base:=coalesce((select c.monthly_price_brl from public.organization_custom_contracts c where c.organization_id=s.organization_id and c.base_plan_code=s.plan_code and c.effective_at<=p_start and s.subscription_kind='plan' and coalesce(s.metadata->>'billing_terms_mode','custom')<>'catalog' order by c.effective_at desc,c.version desc limit 1),(s.metadata#>>'{commercial_terms,price_brl}')::numeric);
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

-- Explicit administrative access does not settle debt or grant another allowance.
create function public.admin_release_contract_access(p_organization uuid,p_contract uuid,p_actor uuid,p_days integer,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.organizations; s public.organization_subscriptions; until_at timestamptz;
begin
  if not exists(select 1 from public.profiles where id=p_actor and is_platform_admin) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_days is null or p_days<1 or p_days>365 or length(trim(coalesce(p_reason,'')))<3 then raise exception 'INVALID_MANUAL_RELEASE'; end if;
  select * into o from public.organizations where id=p_organization for update;
  if not found or (o.billing_organization_id is not null and o.billing_organization_id<>o.id) then raise exception 'BILLING_ACCOUNT_REQUIRED'; end if;
  if o.plan_code='internal' or o.status in ('suspended','paused','blocked','inactive','archived') then raise exception 'ACCOUNT_SUSPENDED'; end if;
  select * into s from public.organization_subscriptions where organization_id=o.id and plan_code=o.plan_code and subscription_kind='plan'
    and status in ('active','past_due') order by current_period_end desc nulls last,created_at desc limit 1 for update;
  if s.id is null or s.metadata#>>'{commercial_terms,custom_contract_id}' is distinct from p_contract::text then raise exception 'CONTRACT_NOT_CURRENT'; end if;
  until_at:=(s.metadata->>'admin_access_until')::timestamptz;
  if until_at>now() then return jsonb_build_object('already_applied',true,'access_until',until_at,'credits_granted',0); end if;
  until_at:=now()+make_interval(days=>p_days);
  update public.organization_subscriptions set metadata=metadata||jsonb_build_object('admin_access_until',until_at,'admin_access_actor',p_actor,'admin_access_reason',p_reason),updated_at=now() where id=s.id;
  update public.organizations set status='active',updated_at=now() where id=o.id;
  perform public.restore_custom_contract_api_access(o.id);
  insert into public.maintenance_audit_logs(actor_id,event_type,target_table,target_id,metadata)
    values(p_actor,'billing.custom_contract_manual_access','organizations',o.id,jsonb_build_object('contract_id',p_contract,'subscription_id',s.id,'reason',p_reason,'access_until',until_at,'credits_granted',0,'payment_unchanged',true));
  return jsonb_build_object('access_until',until_at,'credits_granted',0,'payment_unchanged',true);
end $$;
revoke all on function public.admin_release_contract_access(uuid,uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.admin_release_contract_access(uuid,uuid,uuid,integer,text) to service_role;

create table public.admin_catalog_plan_changes (
  request_id uuid primary key, organization_id uuid not null references public.organizations(id),
  actor_id uuid not null references auth.users(id), plan_code text not null,
  result jsonb not null, created_at timestamptz not null default now()
);
alter table public.admin_catalog_plan_changes enable row level security;
revoke all on public.admin_catalog_plan_changes from public,anon,authenticated,service_role;
grant select on public.admin_catalog_plan_changes to service_role;

-- A catalog selection retires local unpaid checkout attempts, not financial history.
create function public.admin_switch_to_catalog_plan(p_organization uuid,p_actor uuid,p_plan text,p_grant boolean,p_reason text,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.organizations; s public.organization_subscriptions; p public.billing_plans;
  prior public.admin_catalog_plan_changes; payment public.billing_payments; ends timestamptz; terms jsonb; tx uuid; result jsonb; amount numeric:=0;
begin
  if not exists(select 1 from public.profiles where id=p_actor and is_platform_admin) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_request is null or p_plan is null or p_plan not in ('starter','pro','scale') or length(trim(coalesce(p_reason,'')))<3 then raise exception 'INVALID_PLAN_CHANGE'; end if;
  select * into o from public.organizations where id=p_organization for update;
  if not found or (o.billing_organization_id is not null and o.billing_organization_id<>o.id) then raise exception 'BILLING_ACCOUNT_REQUIRED'; end if;
  if o.plan_code='internal' or o.status in ('suspended','paused','blocked','inactive','archived') then raise exception 'ACCOUNT_SUSPENDED'; end if;
  select * into prior from public.admin_catalog_plan_changes where request_id=p_request;
  if found then
    if prior.organization_id<>o.id or prior.plan_code<>p_plan or prior.actor_id<>p_actor then raise exception 'REQUEST_CONFLICT'; end if;
    return prior.result||jsonb_build_object('already_applied',true);
  end if;
  select * into p from public.billing_plans where plan_code=p_plan and status='active';
  if not found then raise exception 'PLAN_UNAVAILABLE'; end if;
  select * into s from public.organization_subscriptions where organization_id=o.id and subscription_kind='plan'
    and status in ('pending','active','past_due','incomplete','paused') order by created_at desc limit 1 for update;
  if s.id is null then raise exception 'SUBSCRIPTION_REQUIRED'; end if;
  if s.status='paused' then raise exception 'ACCOUNT_SUSPENDED'; end if;
  if exists(select 1 from public.billing_pix_authorizations where subscription_id=s.id and state in ('preparing','dispatching','unknown','CREATED','ACTIVE')) then raise exception 'PROVIDER_SUBSCRIPTION_REVIEW_REQUIRED'; end if;
  if s.provider_subscription_id is not null then raise exception 'PROVIDER_SUBSCRIPTION_REVIEW_REQUIRED'; end if;
  if exists(select 1 from public.billing_card_attempts where subscription_id=s.id and state in ('processing','pending','unknown')) then raise exception 'PAYMENT_IN_PROGRESS'; end if;
  for payment in select * from public.billing_payments where subscription_id=s.id and status in ('pending','in_process','rejected') for update loop
    -- An unsuccessful attempt older than the accepted contract remains historical.
    -- Existing fulfillment ordering prevents a late settlement from replacing it.
    if payment.status='rejected' and payment.created_at<(s.metadata->>'last_fulfilled_payment_created_at')::timestamptz then continue; end if;
    if payment.provider_payment_id is not null or payment.status='in_process' or payment.payload->>'pix_creation_pending'='true' or payment.payload->>'pix_qr_code' is not null then raise exception 'PENDING_INVOICE_REVIEW_REQUIRED'; end if;
    update public.billing_payments set status='canceled',payload=payload||jsonb_build_object('checkout_status','replaced_by_admin_catalog_plan','admin_request_id',p_request),updated_at=now() where id=payment.id;
    update public.billing_invoices set status='void',updated_at=now() where id=payment.invoice_id;
  end loop;
  ends:=case when p.billing_cycle='one_time' then now()+make_interval(days=>p.access_duration_days)
    when p.billing_interval='week' then now()+interval '7 days'
    when p.billing_interval='quarter' then now()+interval '3 months'
    when p.billing_interval='semester' then now()+interval '6 months'
    when p.billing_interval='year' then now()+interval '1 year' else now()+interval '1 month' end;
  if ends is null or ends<=now() then raise exception 'PLAN_UNAVAILABLE'; end if;
  terms:=jsonb_build_object('billing_cycle',p.billing_cycle,'billing_interval',p.billing_interval,'access_duration_days',p.access_duration_days,
    'price_brl',round(p.monthly_price_brl*(1-case when p.billing_interval='year' then coalesce(p.annual_discount_percent,0) else 0 end/100),2),
    'list_price_brl',p.monthly_price_brl,'included_credits',p.included_credits,'first_purchase_discount_percent',p.first_purchase_discount_percent,'annual_discount_percent',p.annual_discount_percent);
  if p_grant then amount:=p.included_credits; end if;
  update public.organization_subscriptions set plan_id=p.id,plan_code=p.plan_code,status='active',billing_provider='admin_manual',provider_plan_id=null,
    current_period_start=now(),current_period_end=ends,next_billing_at=case when p.billing_cycle='one_time' then null else ends end,included_credits_granted=amount,
    metadata=jsonb_build_object('commercial_terms',terms,'billing_terms_mode','catalog','source','admin_catalog_plan_change','actor_id',p_actor,'reason',p_reason,'manual_activation',true,'auto_charge_disabled',true,'last_fulfilled_payment_created_at',now(),'previous_custom_contract_id',s.metadata#>>'{commercial_terms,custom_contract_id}'),updated_at=now() where id=s.id;
  update public.organizations set plan_code=p.plan_code,status='active',updated_at=now() where id=o.id;
  update public.billing_cycles set status='closed' where subscription_id=s.id and status='open';
  insert into public.billing_cycles(organization_id,subscription_id,plan_id,cycle_start,cycle_end,included_credits,status,metadata)
    values(o.id,s.id,p.id,now(),ends,amount,'open',jsonb_build_object('source','admin_catalog_plan_change','request_id',p_request));
  if amount>0 then tx:=public.grant_credit_wallet(o.id,amount,'Franquia manual: '||p.name,'admin_catalog_plan:'||p_request,jsonb_build_object('actor_id',p_actor,'plan_code',p.plan_code),'grant'); end if;
  perform public.restore_custom_contract_api_access(o.id);
  result:=jsonb_build_object('plan_code',p.plan_code,'subscription_id',s.id,'cycle_end',ends,'credits_granted',amount,'credit_transaction_id',tx);
  insert into public.admin_catalog_plan_changes values(p_request,o.id,p_actor,p_plan,result,now());
  insert into public.maintenance_audit_logs(actor_id,event_type,target_table,target_id,metadata)
    values(p_actor,'billing.admin_catalog_plan_change','organizations',o.id,result||jsonb_build_object('reason',p_reason,'previous_terms',s.metadata->'commercial_terms'));
  return result;
end $$;
revoke all on function public.admin_switch_to_catalog_plan(uuid,uuid,text,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.admin_switch_to_catalog_plan(uuid,uuid,text,boolean,text,uuid) to service_role;

-- Restore only billing-guard pauses, preserving manual suspensions and revocations.
create or replace function public.restore_custom_contract_api_access(p_organization uuid) returns void
language plpgsql security definer set search_path=public as $$
declare api record; target_table text;
begin
  if not coalesce((public.resolve_organization_contract_access(p_organization)->>'allowed')::boolean,false) then return; end if;
  if not exists(select 1 from public.organization_subscriptions where organization_id=p_organization
    and status in ('active','past_due') and id=(public.resolve_organization_contract_access(p_organization)->>'subscription_id')::uuid and metadata#>>'{commercial_terms,features,connectyhub_api}'='true') then return; end if;
  for api in select id from public.connectyhub_api_clients where organization_id=p_organization
    and (status='active' or (status='paused'
      and metadata#>>'{connectyhub_api_access_guard,paused_by}'='connectyhub_api_access_guard'
      and metadata#>>'{connectyhub_api_access_guard,allowed}'='false')) for update
  loop
    update public.connectyhub_api_clients set status='active',metadata=coalesce(metadata,'{}')||jsonb_build_object(
      'connectyhub_api_access_guard',coalesce(metadata->'connectyhub_api_access_guard','{}')||
      jsonb_build_object('allowed',true,'reason','custom_contract_activation','status',null,'checked_at',now(),'restored_at',now()))
    where id=api.id and status='paused';
    foreach target_table in array array['connectyhub_api_keys','connectyhub_webhook_endpoints'] loop
      execute format('update public.%I set status=''active'',metadata=coalesce(metadata,''{}'')||jsonb_build_object(
        ''connectyhub_api_access_guard'',coalesce(metadata->''connectyhub_api_access_guard'',''{}'')||
        jsonb_build_object(''allowed'',true,''reason'',''custom_contract_activation'',''status'',null,''checked_at'',now(),''restored_at'',now()))
        where client_id=$1 and status=''paused''
        and metadata#>>''{connectyhub_api_access_guard,paused_by}''=''connectyhub_api_access_guard''
        and metadata#>>''{connectyhub_api_access_guard,allowed}''=''false''',target_table) using api.id;
    end loop;
  end loop;
end $$;
revoke all on function public.restore_custom_contract_api_access(uuid) from public,anon,authenticated;


create or replace function public.activate_custom_contract(p_organization uuid,p_contract uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.organization_custom_contracts; o public.organizations; s public.organization_subscriptions;
  plan public.billing_plans; prior public.custom_contract_activations; terms jsonb; m jsonb; invoice jsonb; pending public.billing_payments;
  starts timestamptz; ends timestamptz; credits numeric; granted numeric:=0; tx uuid; updating boolean;
begin
  if not exists(select 1 from public.profiles where id=p_actor and is_platform_admin) then raise exception 'ADMIN_REQUIRED'; end if;
  select * into o from public.organizations where id=p_organization for update;
  if not found or (o.billing_organization_id is not null and o.billing_organization_id<>o.id) then raise exception 'BILLING_ACCOUNT_REQUIRED'; end if;
  if o.plan_code='internal' or o.status in ('suspended','paused','blocked','inactive','archived') then raise exception 'ACCOUNT_SUSPENDED'; end if;
  select * into c from public.organization_custom_contracts where id=p_contract and organization_id=o.id;
  if not found then raise exception 'CONTRACT_NOT_FOUND'; end if;
  select * into prior from public.custom_contract_activations where contract_id=c.id;
  if found then
    if not exists(select 1 from public.organization_subscriptions where id=prior.subscription_id and metadata#>>'{commercial_terms,custom_contract_id}'=c.id::text) then raise exception 'CONTRACT_ALREADY_REPLACED'; end if;
    return to_jsonb(prior)||jsonb_build_object('already_applied',true);
  end if;
  if c.effective_at>now() then raise exception 'CONTRACT_NOT_EFFECTIVE'; end if;
  if c.id is distinct from (select id from public.organization_custom_contracts where organization_id=o.id and effective_at<=now() order by effective_at desc,version desc limit 1) then raise exception 'CONTRACT_VERSION_CHANGED'; end if;
  select * into plan from public.billing_plans where plan_code=c.base_plan_code and status='active';
  if not found then raise exception 'PLAN_UNAVAILABLE'; end if;
  select * into s from public.organization_subscriptions where organization_id=o.id and subscription_kind='plan'
    and status in ('pending','active','past_due','incomplete','paused') order by created_at desc limit 1 for update;
  if s.status='paused' then raise exception 'ACCOUNT_SUSPENDED'; end if;
  if s.provider_subscription_id is not null then raise exception 'PROVIDER_SUBSCRIPTION_REVIEW_REQUIRED'; end if;
  if exists(select 1 from public.billing_card_attempts where subscription_id=s.id and state in ('processing','pending','unknown')) then raise exception 'PAYMENT_IN_PROGRESS'; end if;
  updating:=s.metadata#>>'{commercial_terms,custom_contract_id}' is not null and s.current_period_end>now() and s.status='active';
  if updating then
    starts:=s.current_period_start; ends:=s.current_period_end;
    granted:=coalesce(s.included_credits_granted,0);
  else
    starts:=now(); ends:=c.first_period_end;
    if ends<=starts then raise exception 'CONTRACT_DEADLINE_EXPIRED'; end if;
    perform public.prepare_trial_conversion(o.id,now());
  end if;
  credits:=greatest(c.included_credits-granted,0);
  -- An unpaid local invoice can be replaced, never rewritten. An invoice already
  -- sent to a provider requires reconciliation before changing the contract.
  for pending in select * from public.billing_payments where subscription_id=s.id
    and payload->>'checkout_kind'='renewal' and (payload->>'previous_current_period_end')::timestamptz=ends
    and status in ('pending','in_process','rejected') for update
  loop
    if pending.provider_payment_id is not null or pending.status='in_process'
      or pending.payload->>'pix_creation_pending'='true' or pending.payload->>'pix_qr_code' is not null
      or exists(select 1 from public.billing_card_attempts where payment_id=pending.id and state in ('processing','pending','unknown','approved'))
      then raise exception 'PENDING_INVOICE_REVIEW_REQUIRED'; end if;
    update public.billing_payments set status='canceled',payload=payload||jsonb_build_object('checkout_status','replaced_by_contract_activation','replaced_by_contract_id',c.id,'replaced_at',now()),updated_at=now() where id=pending.id;
    update public.billing_invoices set status='void',metadata=metadata||jsonb_build_object('replaced_by_contract_id',c.id,'replaced_at',now()),updated_at=now() where id=pending.invoice_id;
  end loop;
  terms:=jsonb_build_object('billing_cycle','recurring','billing_interval','month','access_duration_days',null,
    'price_brl',c.monthly_price_brl,'list_price_brl',c.monthly_price_brl,'first_purchase_discount_percent',0,'annual_discount_percent',0,
    'included_credits',c.included_credits,'custom_contract_id',c.id,'custom_contract_version',c.version,'name',c.name,
    'features',c.features,'resource_limits',c.resource_limits,'development_scope',c.development_scope);
  -- The previous payment's IDs/credentials are not identities for a new cycle.
  -- Financial history remains on its invoice and payment, not this active snapshot.
  m:=jsonb_build_object('source','admin_custom_contract_activation','manual_activation',true,'auto_charge_disabled',true,
      'actor_id',p_actor,'custom_contract_activated_at',now(),'commercial_terms',terms,
      'last_fulfilled_payment_created_at',now(),'purchase_kind','plan','target_plan_code',c.base_plan_code,'requested_plan_code',c.base_plan_code);
  if s.id is null then
    insert into public.organization_subscriptions(organization_id,plan_id,plan_code,status,billing_provider,current_period_start,current_period_end,next_billing_at,included_credits_granted,metadata)
      values(o.id,plan.id,c.base_plan_code,'active','asaas',starts,ends,ends,greatest(granted,c.included_credits),m) returning * into s;
  else
    update public.organization_subscriptions set plan_id=plan.id,plan_code=c.base_plan_code,status='active',billing_provider='asaas',
      current_period_start=starts,current_period_end=ends,next_billing_at=ends,included_credits_granted=greatest(granted,c.included_credits),metadata=m,updated_at=now()
      where id=s.id returning * into s;
  end if;
  update public.organizations set plan_code=c.base_plan_code,status='active',updated_at=now() where id=o.id;
  insert into public.organization_billing_limits(organization_id,allow_overage,overage_limit_credits,hard_block_when_empty,alert_threshold_percent)
    values(o.id,false,0,true,80) on conflict(organization_id) do nothing;
  if credits>0 then
    tx:=public.grant_credit_wallet(o.id,credits,'Franquia liberada administrativamente: '||c.name,'custom_contract_activation:'||c.id,
      jsonb_build_object('source','admin_custom_contract_activation','contract_id',c.id,'subscription_id',s.id,'actor_id',p_actor,'credit_policy_version','rollover_v1'),'grant');
  end if;
  if updating then
    update public.billing_cycles set included_credits=greatest(included_credits,c.included_credits),metadata=metadata||jsonb_build_object('custom_contract_id',c.id)
      where subscription_id=s.id and cycle_start=starts and cycle_end=ends;
  else
    insert into public.billing_cycles(organization_id,subscription_id,plan_id,cycle_start,cycle_end,included_credits,status,metadata)
      values(o.id,s.id,plan.id,starts,ends,c.included_credits,'open',jsonb_build_object('custom_contract_id',c.id,'source','admin_custom_contract_activation','payment_pending',true));
  end if;
  -- Local invoice only. No provider request, card debit or payment confirmation.
  -- Retired local invoices retain their immutable terms in history.
  invoice:=public.prepare_contract_renewal(s.id,ends,ends,ends+interval '1 month','asaas',jsonb_build_object('auto_charge_disabled',true,'source','admin_custom_contract_activation'));
  if not coalesce((invoice->>'reused')::boolean,false) then
    update public.billing_invoices set due_at=ends where id=(invoice->>'invoice_id')::uuid;
  end if;
  update public.trial_conversion_messages set status='canceled' where organization_id=o.id and status='pending';
  insert into public.custom_contract_activations(contract_id,organization_id,subscription_id,actor_id,cycle_start,cycle_end,credits_granted,credit_transaction_id,payment_id)
    values(c.id,o.id,s.id,p_actor,starts,ends,credits,tx,(invoice->>'payment_id')::uuid) returning * into prior;
  insert into public.intelligence_events(scope,organization_id,source_type,source_id,event_type,title,summary,visibility,tags,payload)
    values('organization',o.id,'custom_contract',c.id,'billing.custom_contract_activated','Contrato personalizado ativado',
      'Acesso e franquia liberados administrativamente. Pagamento permanece pendente.','organization',array['billing','custom_contract'],to_jsonb(prior));
  return to_jsonb(prior)||jsonb_build_object('already_applied',false,'invoice_reused',invoice->'reused');
end $$;
revoke all on function public.activate_custom_contract(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.activate_custom_contract(uuid,uuid,uuid) to service_role;

-- Renewal metadata is derived from the subscription. A prior payment's credit
-- transaction must never suppress the new invoice's own idempotent grant.
