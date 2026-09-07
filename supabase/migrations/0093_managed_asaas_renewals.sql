-- ConnectyHub owns the D-3/D-2/D-1 schedule; provider agreements are never created here.
create table public.billing_asaas_card_vault (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  subscription_id uuid not null references public.organization_subscriptions(id),
  activation_attempt_id uuid not null unique references public.billing_card_attempts(id),
  customer_id text not null,
  token_encrypted text not null,
  consent_version text not null check(consent_version='connectyhub-advance-3-2-1-v1'),
  consent_at timestamptz not null default now(),
  status text not null default 'pending' check(status in ('pending','active','inactive')),
  created_at timestamptz not null default now()
);
alter table public.billing_asaas_card_vault enable row level security;
revoke all on public.billing_asaas_card_vault from public,anon,authenticated;
grant all on public.billing_asaas_card_vault to service_role;
create unique index billing_asaas_one_active_method on public.billing_asaas_card_vault(subscription_id) where status='active';

alter table public.billing_card_attempts add column if not exists automatic_day date;
alter table public.billing_card_attempts add column if not exists automatic_period_end timestamptz;
alter table public.billing_card_attempts add column if not exists managed_renewal boolean not null default false;
create unique index billing_managed_one_attempt_daily on public.billing_card_attempts(subscription_id,automatic_period_end,automatic_day) where automatic_day is not null;

create or replace function public.activate_asaas_billing_vault() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.state='approved' and old.state is distinct from new.state then
    if exists(select 1 from billing_asaas_card_vault where activation_attempt_id=new.id and status='pending') then
      update billing_asaas_card_vault set status='inactive' where subscription_id=new.subscription_id and status='active';
      update billing_asaas_card_vault set status='active' where activation_attempt_id=new.id and status='pending';
    end if;
  elsif new.state in ('refunded','cancelled') then
    update billing_asaas_card_vault set status='inactive' where activation_attempt_id=new.id;
  end if;
  return new;
end $$;
create trigger activate_asaas_billing_vault after update of state on public.billing_card_attempts for each row execute function public.activate_asaas_billing_vault();
revoke all on function public.activate_asaas_billing_vault() from public,anon,authenticated;

create or replace function public.claim_managed_asaas_renewal(p_subscription uuid,p_payment uuid,p_attempt uuid,p_method uuid,p_expected_end timestamptz,p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.organization_subscriptions; p public.billing_payments; day date:=(p_now at time zone 'America/Sao_Paulo')::date; days integer; result jsonb;
begin
  perform 1 from public.organizations where id=(select organization_id from public.organization_subscriptions where id=p_subscription) for update;
  select * into s from public.organization_subscriptions where id=p_subscription for update;
  if not found or s.status<>'active' or s.current_period_end is distinct from p_expected_end or s.billing_provider<>'asaas'
    or s.provider_subscription_id is not null or s.metadata#>>'{commercial_terms,billing_cycle}'='one_time' then return null; end if;
  days:=(s.current_period_end at time zone 'America/Sao_Paulo')::date-day;
  if days not between 1 and 3 or extract(hour from p_now at time zone 'America/Sao_Paulo')<9 or p_now>=s.current_period_end then return null; end if;
  if not exists(select 1 from public.billing_asaas_card_vault where id=p_method and organization_id=s.organization_id and subscription_id=s.id and status='active') then return null; end if;
  if exists(select 1 from public.billing_card_attempts where subscription_id=s.id and automatic_period_end=p_expected_end and automatic_day=day) then return null; end if;
  select * into p from public.billing_payments where id=p_payment and subscription_id=s.id and organization_id=s.organization_id;
  if not found or p.provider<>'asaas' or p.payload->>'checkout_kind'<>'renewal'
    or (p.payload->>'previous_current_period_end')::timestamptz is distinct from p_expected_end or p.payload->>'auto_charge_disabled'='true'
    or p.payload->>'pix_creation_pending'='true' or p.payload->>'pix_qr_code' is not null then return null; end if;
  if exists(select 1 from public.billing_card_attempts where payment_id=p.id and state in ('processing','unknown','pending','approved')) then return null; end if;
  result:=public.claim_native_billing_card(s.organization_id,p.id,p_attempt,p.checkout_revision,p.amount_brl,p.amount_brl,'billing_card:'||p_attempt);
  if coalesce((result->>'claimed')::boolean,false) then
    update public.billing_card_attempts set automatic_day=day,automatic_period_end=p_expected_end,managed_renewal=true where id=p_attempt;
    update public.billing_payments set payload=payload||jsonb_build_object('managed_external_reference','billing_managed:'||p.id,'asaas_customer_id',(select customer_id from public.billing_asaas_card_vault where id=p_method)) where id=p.id;
    select jsonb_build_object('claimed',true,'attempt',to_jsonb(a)) into result from public.billing_card_attempts a where a.id=p_attempt;
  end if;
  return result;
end $$;
revoke all on function public.claim_managed_asaas_renewal(uuid,uuid,uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_managed_asaas_renewal(uuid,uuid,uuid,uuid,timestamptz,timestamptz) to service_role;

create or replace function public.archive_managed_billing_attempt() returns trigger language plpgsql security definer set search_path=public as $$
declare owner uuid;
begin
  select owner_id into owner from public.organizations where id=new.organization_id;
  if owner is not null then
    insert into public.platform_customer_journey(user_id,event_key,event_type,source_id,payload)
    values(owner,'billing_attempt:'||new.id||':'||new.state,'card_attempt_'||new.state,new.id,
      jsonb_build_object('subscription_id',new.subscription_id,'payment_id',new.payment_id,'amount',new.amount,'status',new.state,'automatic',new.managed_renewal,'scheduled_day',new.automatic_day))
    on conflict(event_key) do update set payload=excluded.payload;
  end if;
  return new;
end $$;
create trigger archive_managed_billing_attempt after insert or update of state,managed_renewal,automatic_day on public.billing_card_attempts for each row execute function public.archive_managed_billing_attempt();
revoke all on function public.archive_managed_billing_attempt() from public,anon,authenticated;

-- Preserve financial history; discontinue only future attempts using old stored cards.
update public.billing_payment_methods set status='inactive',is_default=false,metadata=coalesce(metadata,'{}')||jsonb_build_object('disabled_reason','gateway_retired','disabled_at',now()) where provider='pagbank' and status='active';
update public.platform_billing_settings set recurring_provider='asaas',metadata=coalesce(metadata,'{}')||jsonb_build_object('renewal_policy',coalesce(metadata->'renewal_policy','{}')||jsonb_build_object('pix_reminder_start_days',3,'card_charge_attempt_days',3,'grace_period_days',0,'suspend_after_days',0,'daily_whatsapp_reminders',true,'card_charge_attempt_enabled',true,'card_failure_uses_pix_fallback',true),'managed_renewal_policy','connectyhub-advance-3-2-1-v1') where setting_key='default';
-- A legacy contract has to authorize a new Asaas card before any unattended debit.
update public.organization_subscriptions set metadata=coalesce(metadata,'{}')||jsonb_build_object('previous_billing_provider',billing_provider,'asaas_card_setup_required',true),billing_provider='asaas'
  where billing_provider in ('admin_manual','pagbank','mercado_pago') and provider_subscription_id is null and status in ('active','past_due','pending','incomplete');
update public.billing_payments p set provider='asaas',payload=coalesce(p.payload,'{}')||jsonb_build_object('previous_billing_provider',p.provider,'billing_provider','asaas')
  from public.organization_subscriptions s where s.id=p.subscription_id and s.billing_provider='asaas' and s.provider_subscription_id is null
    and p.provider in ('pagbank','mercado_pago') and p.provider_payment_id is null and p.status in ('pending','rejected');
update public.billing_invoices i set provider='asaas',metadata=coalesce(i.metadata,'{}')||jsonb_build_object('previous_billing_provider',i.provider,'billing_provider','asaas')
  where i.provider in ('pagbank','mercado_pago') and i.provider_payment_id is null and i.status in ('open','draft','failed')
    and exists(select 1 from public.billing_payments p where p.invoice_id=i.id and p.provider='asaas');
