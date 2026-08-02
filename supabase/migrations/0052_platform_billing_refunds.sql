-- Platform billing refunds.
-- Allows admins to refund Mercado Pago payments and reverse granted credits
-- without inflating customer usage metrics.

create table if not exists public.billing_refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.organization_subscriptions(id) on delete set null,
  invoice_id uuid references public.billing_invoices(id) on delete set null,
  payment_id uuid references public.billing_payments(id) on delete set null,
  provider text not null default 'mercado_pago',
  provider_payment_id text not null,
  provider_refund_id text,
  status text not null default 'pending',
  refund_type text not null default 'full',
  amount_brl numeric(18,2) not null,
  requested_by uuid references auth.users(id) on delete set null,
  reason text,
  credit_reversal_transaction_id uuid references public.credit_transactions(id) on delete set null,
  reversed_credits numeric(18,6) not null default 0,
  uncovered_credits numeric(18,6) not null default 0,
  provider_response jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('pending', 'approved', 'processed', 'failed', 'canceled')),
  check (refund_type in ('full', 'partial')),
  check (amount_brl > 0),
  check (reversed_credits >= 0),
  check (uncovered_credits >= 0)
);

create index if not exists idx_billing_refunds_org_created
  on public.billing_refunds (organization_id, created_at desc);

create index if not exists idx_billing_refunds_payment
  on public.billing_refunds (payment_id);

create unique index if not exists idx_billing_refunds_provider_refund_unique
  on public.billing_refunds (provider, provider_refund_id)
  where provider_refund_id is not null;

drop trigger if exists touch_billing_refunds_updated_at on public.billing_refunds;
create trigger touch_billing_refunds_updated_at
before update on public.billing_refunds
for each row execute function public.touch_updated_at();

alter table public.billing_refunds enable row level security;

drop policy if exists "billing refunds visible to platform admins" on public.billing_refunds;
create policy "billing refunds visible to platform admins"
on public.billing_refunds for select
using (public.is_platform_admin());

drop policy if exists "billing refunds managed by platform admins" on public.billing_refunds;
create policy "billing refunds managed by platform admins"
on public.billing_refunds for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

create or replace function public.reverse_credit_wallet_for_refund(
  p_organization_id uuid,
  p_amount_credits numeric,
  p_external_reference text default null,
  p_description text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  transaction_id uuid,
  reversed_credits numeric(18,6),
  uncovered_credits numeric(18,6),
  balance_after_credits numeric(18,6)
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  wallet public.credit_wallets%rowtype;
  transaction_id_value uuid;
  current_balance numeric(18,6);
begin
  if p_amount_credits <= 0 then
    raise exception 'Refund credit amount must be greater than zero.';
  end if;

  perform public.ensure_credit_wallet(p_organization_id);

  select *
  into wallet
  from public.credit_wallets
  where organization_id = p_organization_id
  for update;

  current_balance := greatest(coalesce(wallet.balance_credits, 0), 0);
  reversed_credits := least(current_balance, p_amount_credits);
  uncovered_credits := greatest(p_amount_credits - reversed_credits, 0);
  balance_after_credits := current_balance - reversed_credits;

  update public.credit_wallets
  set
    balance_credits = balance_after_credits,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'last_refund_at', now(),
      'last_refund_requested_credits', p_amount_credits,
      'last_refund_reversed_credits', reversed_credits,
      'last_refund_uncovered_credits', case when uncovered_credits > 0 then uncovered_credits else null end,
      'last_refund_external_reference', p_external_reference
    )),
    updated_at = now()
  where id = wallet.id;

  if reversed_credits > 0 then
    insert into public.credit_transactions (
      organization_id,
      wallet_id,
      transaction_type,
      amount_credits,
      balance_after_credits,
      external_reference,
      description,
      metadata,
      created_by
    )
    values (
      p_organization_id,
      wallet.id,
      'refund',
      reversed_credits * -1,
      balance_after_credits,
      p_external_reference,
      p_description,
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'requested_refund_credits', p_amount_credits,
        'reversed_credits', reversed_credits,
        'uncovered_credits', uncovered_credits
      ),
      auth.uid()
    )
    returning id into transaction_id_value;
  end if;

  transaction_id := transaction_id_value;
  return next;
end;
$fn$;

grant execute on function public.reverse_credit_wallet_for_refund(uuid, numeric, text, text, jsonb) to authenticated;
grant execute on function public.reverse_credit_wallet_for_refund(uuid, numeric, text, text, jsonb) to service_role;
