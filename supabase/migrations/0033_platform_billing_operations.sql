create table if not exists public.platform_billing_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique default 'default',
  billing_whatsapp_agent_id uuid references public.agent_registry(id) on delete set null,
  notification_whatsapp_enabled boolean not null default true,
  pix_automatic_required boolean not null default true,
  checkout_mode text not null default 'subscription',
  recurring_provider text not null default 'mercado_pago',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (setting_key ~ '^[a-z0-9_-]{2,80}$'),
  check (checkout_mode in ('subscription', 'manual_review')),
  check (recurring_provider in ('mercado_pago'))
);

drop trigger if exists touch_platform_billing_settings_updated_at on public.platform_billing_settings;
create trigger touch_platform_billing_settings_updated_at
before update on public.platform_billing_settings
for each row execute function public.touch_updated_at();

alter table public.platform_billing_settings enable row level security;

drop policy if exists "platform billing settings visible to platform admins" on public.platform_billing_settings;
create policy "platform billing settings visible to platform admins"
on public.platform_billing_settings for select
using (public.is_platform_admin());

drop policy if exists "platform billing settings managed by platform admins" on public.platform_billing_settings;
create policy "platform billing settings managed by platform admins"
on public.platform_billing_settings for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

insert into public.platform_billing_settings (
  setting_key,
  notification_whatsapp_enabled,
  pix_automatic_required,
  checkout_mode,
  recurring_provider,
  metadata
)
values (
  'default',
  true,
  true,
  'subscription',
  'mercado_pago',
  '{"seed":"platform_billing_operations","phase":"admin_billing"}'::jsonb
)
on conflict (setting_key) do nothing;

create table if not exists public.billing_notification_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  invoice_id uuid references public.billing_invoices(id) on delete set null,
  payment_id uuid references public.billing_payments(id) on delete set null,
  subscription_id uuid references public.organization_subscriptions(id) on delete set null,
  event_type text not null,
  dedupe_key text,
  channel text not null default 'whatsapp',
  status text not null default 'pending',
  selected_agent_id uuid references public.agent_registry(id) on delete set null,
  recipient_phone text,
  message_preview text,
  provider_message_id text,
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (channel in ('whatsapp')),
  check (status in ('pending', 'sent', 'failed', 'skipped')),
  check (attempts >= 0)
);

create unique index if not exists idx_billing_notification_events_dedupe
  on public.billing_notification_events (dedupe_key)
  where dedupe_key is not null;

create index if not exists idx_billing_notification_events_status
  on public.billing_notification_events (status, created_at desc);

create index if not exists idx_billing_notification_events_org_created
  on public.billing_notification_events (organization_id, created_at desc);

drop trigger if exists touch_billing_notification_events_updated_at on public.billing_notification_events;
create trigger touch_billing_notification_events_updated_at
before update on public.billing_notification_events
for each row execute function public.touch_updated_at();

alter table public.billing_notification_events enable row level security;

drop policy if exists "billing notification events visible to platform admins" on public.billing_notification_events;
create policy "billing notification events visible to platform admins"
on public.billing_notification_events for select
using (public.is_platform_admin());

drop policy if exists "billing notification events managed by platform admins" on public.billing_notification_events;
create policy "billing notification events managed by platform admins"
on public.billing_notification_events for all
using (public.is_platform_admin())
with check (public.is_platform_admin());
