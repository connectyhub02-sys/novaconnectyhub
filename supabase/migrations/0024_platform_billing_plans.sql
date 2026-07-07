create table if not exists public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null unique,
  name text not null,
  short_description text,
  status text not null default 'draft',
  sort_order integer not null default 100,
  highlighted boolean not null default false,
  monthly_price_brl numeric(18,2) not null default 0,
  included_credits numeric(18,6) not null default 0,
  overage_credit_price_brl numeric(18,4) not null default 0,
  auto_recharge_min_credits numeric(18,6) not null default 0,
  overage_limit_credits numeric(18,6) not null default 0,
  trial_days integer not null default 0,
  agent_limit integer,
  whatsapp_instance_limit integer,
  user_limit integer,
  module_codes text[] not null default '{}'::text[],
  mercado_pago_preapproval_plan_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (plan_code ~ '^[a-z0-9_-]{2,60}$'),
  check (status in ('draft', 'active', 'archived')),
  check (monthly_price_brl >= 0),
  check (included_credits >= 0),
  check (overage_credit_price_brl >= 0),
  check (auto_recharge_min_credits >= 0),
  check (overage_limit_credits >= 0),
  check (trial_days >= 0),
  check (agent_limit is null or agent_limit >= 0),
  check (whatsapp_instance_limit is null or whatsapp_instance_limit >= 0),
  check (user_limit is null or user_limit >= 0)
);

create table if not exists public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid references public.billing_plans(id) on delete set null,
  plan_code text not null,
  status text not null default 'pending',
  billing_provider text not null default 'mercado_pago',
  provider_subscription_id text,
  provider_plan_id text,
  payer_email text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_billing_at timestamptz,
  included_credits_granted numeric(18,6) not null default 0,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('pending', 'active', 'past_due', 'canceled', 'paused', 'incomplete')),
  check (included_credits_granted >= 0)
);

create unique index if not exists idx_organization_subscriptions_active
  on public.organization_subscriptions (organization_id)
  where status in ('pending', 'active', 'past_due', 'incomplete');

create table if not exists public.billing_cycles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.organization_subscriptions(id) on delete set null,
  plan_id uuid references public.billing_plans(id) on delete set null,
  cycle_start timestamptz not null,
  cycle_end timestamptz not null,
  included_credits numeric(18,6) not null default 0,
  used_credits numeric(18,6) not null default 0,
  overage_credits numeric(18,6) not null default 0,
  status text not null default 'open',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cycle_end > cycle_start),
  check (included_credits >= 0),
  check (used_credits >= 0),
  check (overage_credits >= 0),
  check (status in ('open', 'closed', 'void'))
);

create index if not exists idx_billing_cycles_org_period
  on public.billing_cycles (organization_id, cycle_start desc);

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.organization_subscriptions(id) on delete set null,
  cycle_id uuid references public.billing_cycles(id) on delete set null,
  status text not null default 'draft',
  currency text not null default 'BRL',
  subtotal_brl numeric(18,2) not null default 0,
  discount_brl numeric(18,2) not null default 0,
  total_brl numeric(18,2) not null default 0,
  due_at timestamptz,
  paid_at timestamptz,
  provider text not null default 'mercado_pago',
  provider_invoice_id text,
  provider_payment_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('draft', 'open', 'paid', 'failed', 'void', 'refunded')),
  check (subtotal_brl >= 0),
  check (discount_brl >= 0),
  check (total_brl >= 0)
);

create index if not exists idx_billing_invoices_org_created
  on public.billing_invoices (organization_id, created_at desc);

create table if not exists public.billing_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.billing_invoices(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_type text not null,
  description text not null,
  quantity numeric(18,6) not null default 1,
  unit_price_brl numeric(18,4) not null default 0,
  total_brl numeric(18,2) not null default 0,
  credit_amount numeric(18,6),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (item_type in ('plan', 'included_credits', 'overage_credits', 'credit_pack', 'adjustment')),
  check (quantity > 0),
  check (unit_price_brl >= 0),
  check (total_brl >= 0),
  check (credit_amount is null or credit_amount >= 0)
);

create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid references public.billing_invoices(id) on delete set null,
  subscription_id uuid references public.organization_subscriptions(id) on delete set null,
  provider text not null default 'mercado_pago',
  provider_payment_id text,
  provider_status text,
  status text not null default 'pending',
  amount_brl numeric(18,2) not null default 0,
  paid_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('pending', 'approved', 'rejected', 'refunded', 'canceled', 'in_process')),
  check (amount_brl >= 0)
);

create index if not exists idx_billing_payments_org_created
  on public.billing_payments (organization_id, created_at desc);

drop trigger if exists touch_billing_plans_updated_at on public.billing_plans;
create trigger touch_billing_plans_updated_at
before update on public.billing_plans
for each row execute function public.touch_updated_at();

drop trigger if exists touch_organization_subscriptions_updated_at on public.organization_subscriptions;
create trigger touch_organization_subscriptions_updated_at
before update on public.organization_subscriptions
for each row execute function public.touch_updated_at();

drop trigger if exists touch_billing_cycles_updated_at on public.billing_cycles;
create trigger touch_billing_cycles_updated_at
before update on public.billing_cycles
for each row execute function public.touch_updated_at();

drop trigger if exists touch_billing_invoices_updated_at on public.billing_invoices;
create trigger touch_billing_invoices_updated_at
before update on public.billing_invoices
for each row execute function public.touch_updated_at();

drop trigger if exists touch_billing_payments_updated_at on public.billing_payments;
create trigger touch_billing_payments_updated_at
before update on public.billing_payments
for each row execute function public.touch_updated_at();

alter table public.billing_plans enable row level security;
alter table public.organization_subscriptions enable row level security;
alter table public.billing_cycles enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_invoice_items enable row level security;
alter table public.billing_payments enable row level security;

drop policy if exists "billing plans visible to everyone logged in" on public.billing_plans;
create policy "billing plans visible to everyone logged in"
on public.billing_plans for select
using (auth.uid() is not null);

drop policy if exists "billing plans managed by platform admins" on public.billing_plans;
create policy "billing plans managed by platform admins"
on public.billing_plans for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "subscriptions visible to org members or platform admins" on public.organization_subscriptions;
create policy "subscriptions visible to org members or platform admins"
on public.organization_subscriptions for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "subscriptions managed by platform admins" on public.organization_subscriptions;
create policy "subscriptions managed by platform admins"
on public.organization_subscriptions for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "billing cycles visible to org members or platform admins" on public.billing_cycles;
create policy "billing cycles visible to org members or platform admins"
on public.billing_cycles for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "billing cycles managed by platform admins" on public.billing_cycles;
create policy "billing cycles managed by platform admins"
on public.billing_cycles for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "billing invoices visible to org members or platform admins" on public.billing_invoices;
create policy "billing invoices visible to org members or platform admins"
on public.billing_invoices for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "billing invoices managed by platform admins" on public.billing_invoices;
create policy "billing invoices managed by platform admins"
on public.billing_invoices for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "billing invoice items visible to org members or platform admins" on public.billing_invoice_items;
create policy "billing invoice items visible to org members or platform admins"
on public.billing_invoice_items for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "billing invoice items managed by platform admins" on public.billing_invoice_items;
create policy "billing invoice items managed by platform admins"
on public.billing_invoice_items for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "billing payments visible to org members or platform admins" on public.billing_payments;
create policy "billing payments visible to org members or platform admins"
on public.billing_payments for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "billing payments managed by platform admins" on public.billing_payments;
create policy "billing payments managed by platform admins"
on public.billing_payments for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

insert into public.billing_plans (
  plan_code,
  name,
  short_description,
  status,
  sort_order,
  highlighted,
  monthly_price_brl,
  included_credits,
  overage_credit_price_brl,
  auto_recharge_min_credits,
  overage_limit_credits,
  trial_days,
  agent_limit,
  whatsapp_instance_limit,
  user_limit,
  module_codes,
  metadata
)
values
  (
    'basic',
    'Basico',
    'Plano inicial configuravel para validar assinatura mensal e creditos.',
    'draft',
    10,
    true,
    97,
    50,
    1,
    10,
    100,
    0,
    1,
    1,
    2,
    array['whatsapp_agent', 'sales_catalog', 'crm_basic']::text[],
    '{"seed":"mvp","editable":true}'::jsonb
  ),
  (
    'pro',
    'Pro',
    'Plano intermediario em rascunho para clientes com mais agentes e volume.',
    'draft',
    20,
    false,
    197,
    150,
    1,
    20,
    300,
    0,
    3,
    2,
    5,
    array['whatsapp_agent', 'sales_catalog', 'crm_basic', 'automations']::text[],
    '{"seed":"mvp","editable":true}'::jsonb
  )
on conflict (plan_code) do update
set
  name = excluded.name,
  short_description = excluded.short_description,
  sort_order = excluded.sort_order,
  highlighted = excluded.highlighted,
  metadata = public.billing_plans.metadata || excluded.metadata,
  updated_at = now();
