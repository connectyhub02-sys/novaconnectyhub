-- Birthday present chosen by the owner (one choice and one number) and the benefits a lead receives.
-- Additive: without a choice the company keeps "only the congratulations".

alter table public.automation_policies
  add column if not exists birthday_gift_kind text not null default 'none'
    check (birthday_gift_kind in ('none','favorites_discount','order_discount','gift_product')),
  add column if not exists birthday_gift_percent numeric(4,2)
    check (birthday_gift_percent is null or (birthday_gift_percent>0 and birthday_gift_percent<=30)),
  add column if not exists birthday_gift_product_id uuid;

-- A benefit is used once, in one order, inside its validity. Reusable by future campaigns.
create table if not exists public.lead_benefits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  source text not null check (source in ('birthday')),
  benefit_kind text not null check (benefit_kind in ('favorites_discount','order_discount','gift_product')),
  percent numeric(4,2) check (percent is null or (percent>0 and percent<=30)),
  product_ids uuid[] not null default '{}',
  gift_product_id uuid,
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  used_order_id uuid references public.sales_catalog_orders(id),
  used_at timestamptz,
  request_key text not null check (length(request_key) between 1 and 180),
  created_at timestamptz not null default now(),
  check (valid_until>valid_from),
  check ((benefit_kind='gift_product')=(gift_product_id is not null)),
  check (benefit_kind='gift_product' or percent is not null),
  unique (organization_id, request_key)
);
create index if not exists lead_benefits_active on public.lead_benefits(organization_id, lead_id, valid_until) where used_order_id is null;
alter table public.lead_benefits enable row level security;
revoke all on public.lead_benefits from public, anon, authenticated;
grant all on public.lead_benefits to service_role;

notify pgrst, 'reload schema';
