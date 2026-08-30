-- Commerce agent foundation
-- Connects WhatsApp leads to storefront, cart, checkout, agent messages, and audited commerce actions.

create table if not exists public.lead_web_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  identity_type text not null
    check (identity_type in ('visitor_cookie', 'session_cookie', 'tracking_link', 'push_endpoint', 'external')),
  identity_value text not null,
  confidence numeric(4,3) not null default 0.850
    check (confidence >= 0 and confidence <= 1),
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, identity_type, identity_value)
);

create table if not exists public.commerce_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  visitor_cookie_id text,
  session_cookie_id text,
  tracking_link_id uuid references public.intelligence_memory(id) on delete set null,
  order_id uuid references public.sales_catalog_orders(id) on delete set null,
  payment_session_id uuid references public.sales_catalog_payment_sessions(id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'converted', 'abandoned', 'expired', 'merged')),
  landing_url text,
  current_url text,
  current_path text,
  referrer text,
  last_surface text
    check (last_surface is null or last_surface in ('store', 'product', 'cart', 'checkout', 'unknown')),
  lead_name text,
  lead_phone text,
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commerce_cart_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  commerce_session_id uuid references public.commerce_sessions(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  order_id uuid references public.sales_catalog_orders(id) on delete set null,
  payment_session_id uuid references public.sales_catalog_payment_sessions(id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'checkout_created', 'converted', 'abandoned', 'cleared')),
  currency text not null default 'BRL',
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  shipping_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commerce_agent_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  commerce_session_id uuid references public.commerce_sessions(id) on delete cascade,
  cart_session_id uuid references public.commerce_cart_sessions(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  created_by_agent_id uuid references public.agent_registry(id) on delete set null,
  action_type text not null
    check (action_type in (
      'suggest_product',
      'add_to_cart',
      'remove_from_cart',
      'apply_order_bump',
      'create_checkout',
      'update_checkout',
      'return_to_whatsapp',
      'idle_nudge',
      'message'
    )),
  status text not null default 'suggested'
    check (status in ('suggested', 'accepted', 'rejected', 'applied', 'failed', 'cancelled')),
  surface text
    check (surface is null or surface in ('store', 'product', 'cart', 'checkout', 'unknown')),
  catalog_item_id uuid references public.intelligence_memory(id) on delete set null,
  sku_id uuid references public.sales_catalog_skus(id) on delete set null,
  order_id uuid references public.sales_catalog_orders(id) on delete set null,
  payment_session_id uuid references public.sales_catalog_payment_sessions(id) on delete set null,
  request_payload jsonb not null default '{}'::jsonb,
  result_payload jsonb not null default '{}'::jsonb,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commerce_cart_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cart_session_id uuid not null references public.commerce_cart_sessions(id) on delete cascade,
  catalog_item_id uuid references public.intelligence_memory(id) on delete set null,
  sku_id uuid references public.sales_catalog_skus(id) on delete set null,
  agent_action_id uuid references public.commerce_agent_actions(id) on delete set null,
  sku_code text,
  title text not null,
  tag text,
  quantity numeric(12,3) not null default 1
    check (quantity > 0 and quantity <= 100000),
  unit_price numeric(14,2),
  sale_price numeric(14,2),
  total numeric(14,2),
  attributes jsonb not null default '[]'::jsonb,
  source text not null default 'lead'
    check (source in ('lead', 'agent', 'system', 'imported')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commerce_agent_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  commerce_session_id uuid references public.commerce_sessions(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  role text not null
    check (role in ('lead', 'assistant', 'system', 'tool')),
  channel text not null default 'storefront'
    check (channel in ('storefront', 'product', 'cart', 'checkout', 'whatsapp_mirror')),
  surface text
    check (surface is null or surface in ('store', 'product', 'cart', 'checkout', 'unknown')),
  content text not null check (char_length(content) <= 4000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_web_identities_lead
  on public.lead_web_identities (lead_id, last_seen_at desc)
  where lead_id is not null;

create index if not exists idx_lead_web_identities_org_seen
  on public.lead_web_identities (organization_id, last_seen_at desc);

create index if not exists idx_commerce_sessions_org_seen
  on public.commerce_sessions (organization_id, last_seen_at desc);

create index if not exists idx_commerce_sessions_lead_seen
  on public.commerce_sessions (lead_id, last_seen_at desc)
  where lead_id is not null;

create index if not exists idx_commerce_sessions_conversation_seen
  on public.commerce_sessions (conversation_id, last_seen_at desc)
  where conversation_id is not null;

create index if not exists idx_commerce_sessions_cookie
  on public.commerce_sessions (organization_id, session_cookie_id, last_seen_at desc)
  where session_cookie_id is not null;

create index if not exists idx_commerce_cart_sessions_session
  on public.commerce_cart_sessions (commerce_session_id, updated_at desc)
  where commerce_session_id is not null;

create index if not exists idx_commerce_cart_sessions_org_status
  on public.commerce_cart_sessions (organization_id, status, updated_at desc);

create index if not exists idx_commerce_cart_items_cart
  on public.commerce_cart_items (cart_session_id, created_at);

create index if not exists idx_commerce_agent_actions_session
  on public.commerce_agent_actions (commerce_session_id, created_at desc)
  where commerce_session_id is not null;

create index if not exists idx_commerce_agent_actions_org_status
  on public.commerce_agent_actions (organization_id, status, created_at desc);

create index if not exists idx_commerce_agent_messages_session
  on public.commerce_agent_messages (commerce_session_id, created_at)
  where commerce_session_id is not null;

create index if not exists idx_commerce_agent_messages_lead
  on public.commerce_agent_messages (lead_id, created_at desc)
  where lead_id is not null;

drop trigger if exists trg_lead_web_identities_updated_at on public.lead_web_identities;
create trigger trg_lead_web_identities_updated_at
before update on public.lead_web_identities
for each row execute function public.touch_updated_at();

drop trigger if exists trg_commerce_sessions_updated_at on public.commerce_sessions;
create trigger trg_commerce_sessions_updated_at
before update on public.commerce_sessions
for each row execute function public.touch_updated_at();

drop trigger if exists trg_commerce_cart_sessions_updated_at on public.commerce_cart_sessions;
create trigger trg_commerce_cart_sessions_updated_at
before update on public.commerce_cart_sessions
for each row execute function public.touch_updated_at();

drop trigger if exists trg_commerce_cart_items_updated_at on public.commerce_cart_items;
create trigger trg_commerce_cart_items_updated_at
before update on public.commerce_cart_items
for each row execute function public.touch_updated_at();

drop trigger if exists trg_commerce_agent_actions_updated_at on public.commerce_agent_actions;
create trigger trg_commerce_agent_actions_updated_at
before update on public.commerce_agent_actions
for each row execute function public.touch_updated_at();

alter table public.lead_web_identities enable row level security;
alter table public.commerce_sessions enable row level security;
alter table public.commerce_cart_sessions enable row level security;
alter table public.commerce_cart_items enable row level security;
alter table public.commerce_agent_actions enable row level security;
alter table public.commerce_agent_messages enable row level security;

drop policy if exists "lead web identities visible by organization" on public.lead_web_identities;
create policy "lead web identities visible by organization"
on public.lead_web_identities for select
using (
  public.is_platform_admin()
  or public.is_organization_member(organization_id)
);

drop policy if exists "lead web identities managed by organization admins" on public.lead_web_identities;
create policy "lead web identities managed by organization admins"
on public.lead_web_identities for all
using (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
)
with check (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
);

drop policy if exists "commerce sessions visible by organization" on public.commerce_sessions;
create policy "commerce sessions visible by organization"
on public.commerce_sessions for select
using (
  public.is_platform_admin()
  or public.is_organization_member(organization_id)
);

drop policy if exists "commerce sessions managed by organization admins" on public.commerce_sessions;
create policy "commerce sessions managed by organization admins"
on public.commerce_sessions for all
using (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
)
with check (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
);

drop policy if exists "commerce cart sessions visible by organization" on public.commerce_cart_sessions;
create policy "commerce cart sessions visible by organization"
on public.commerce_cart_sessions for select
using (
  public.is_platform_admin()
  or public.is_organization_member(organization_id)
);

drop policy if exists "commerce cart sessions managed by organization admins" on public.commerce_cart_sessions;
create policy "commerce cart sessions managed by organization admins"
on public.commerce_cart_sessions for all
using (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
)
with check (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
);

drop policy if exists "commerce cart items visible by organization" on public.commerce_cart_items;
create policy "commerce cart items visible by organization"
on public.commerce_cart_items for select
using (
  public.is_platform_admin()
  or public.is_organization_member(organization_id)
);

drop policy if exists "commerce cart items managed by organization admins" on public.commerce_cart_items;
create policy "commerce cart items managed by organization admins"
on public.commerce_cart_items for all
using (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
)
with check (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
);

drop policy if exists "commerce agent actions visible by organization" on public.commerce_agent_actions;
create policy "commerce agent actions visible by organization"
on public.commerce_agent_actions for select
using (
  public.is_platform_admin()
  or public.is_organization_member(organization_id)
);

drop policy if exists "commerce agent actions managed by organization admins" on public.commerce_agent_actions;
create policy "commerce agent actions managed by organization admins"
on public.commerce_agent_actions for all
using (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
)
with check (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
);

drop policy if exists "commerce agent messages visible by organization" on public.commerce_agent_messages;
create policy "commerce agent messages visible by organization"
on public.commerce_agent_messages for select
using (
  public.is_platform_admin()
  or public.is_organization_member(organization_id)
);

drop policy if exists "commerce agent messages managed by organization admins" on public.commerce_agent_messages;
create policy "commerce agent messages managed by organization admins"
on public.commerce_agent_messages for all
using (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
)
with check (
  public.is_platform_admin()
  or public.is_organization_admin(organization_id)
);
