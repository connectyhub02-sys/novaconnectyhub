create table if not exists public.billing_payment_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.organization_subscriptions(id) on delete cascade,
  provider text not null,
  method_type text not null,
  status text not null default 'active',
  is_default boolean not null default true,
  provider_token_encrypted text not null,
  provider_card_id text,
  brand text,
  first_digits text,
  last_digits text,
  exp_month text,
  exp_year text,
  holder_name text,
  holder_tax_id text,
  recurring_reference_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider in ('pagbank', 'mercado_pago')),
  check (method_type in ('card')),
  check (status in ('active', 'inactive', 'expired', 'failed')),
  check (first_digits is null or first_digits ~ '^[0-9]{4,8}$'),
  check (last_digits is null or last_digits ~ '^[0-9]{2,8}$'),
  check (exp_month is null or exp_month ~ '^[0-9]{1,2}$'),
  check (exp_year is null or exp_year ~ '^[0-9]{2,4}$')
);

create index if not exists idx_billing_payment_methods_org_status
  on public.billing_payment_methods (organization_id, status, updated_at desc);

create index if not exists idx_billing_payment_methods_subscription
  on public.billing_payment_methods (subscription_id, status, updated_at desc);

create unique index if not exists idx_billing_payment_methods_default_subscription
  on public.billing_payment_methods (organization_id, subscription_id, provider, method_type)
  where is_default and status = 'active' and subscription_id is not null;

create unique index if not exists idx_billing_payment_methods_default_org
  on public.billing_payment_methods (organization_id, provider, method_type)
  where is_default and status = 'active' and subscription_id is null;

drop trigger if exists touch_billing_payment_methods_updated_at on public.billing_payment_methods;
create trigger touch_billing_payment_methods_updated_at
before update on public.billing_payment_methods
for each row execute function public.touch_updated_at();

alter table public.billing_payment_methods enable row level security;

drop policy if exists "billing payment methods managed by platform admins" on public.billing_payment_methods;
create policy "billing payment methods managed by platform admins"
on public.billing_payment_methods for all
using (public.is_platform_admin())
with check (public.is_platform_admin());
