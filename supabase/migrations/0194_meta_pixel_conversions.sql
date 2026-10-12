-- Tenant-scoped configuration and durable consent-aware outbox. No public DB access.
create table public.meta_pixel_connections (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 ad_account_id text not null,
 pixel_id text not null check (pixel_id ~ '^[0-9]+$'),
 pixel_name text not null,
 enabled boolean not null default false,
 test_event_code text,
 revision uuid not null default gen_random_uuid(),
 updated_at timestamptz not null default now()
);
create table public.meta_pixel_consents (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 visitor_id uuid not null,
 granted boolean not null,
 updated_at timestamptz not null default now(),
 primary key(organization_id,visitor_id)
);
create table public.meta_conversion_events (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 visitor_id uuid not null,
 pixel_id text not null,
 revision uuid not null,
 event_id text not null,
 event_name text not null check(event_name in ('PageView','ViewContent','AddToCart','InitiateCheckout','Purchase','Lead')),
 event_time bigint not null,
 payload jsonb not null,
 test_event_code text,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','cancelled')),
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 error_message text,
 receipt jsonb,
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 unique(organization_id,pixel_id,event_name,event_id),
 foreign key(organization_id,visitor_id) references public.meta_pixel_consents(organization_id,visitor_id)
);
create index on public.meta_conversion_events(next_attempt_at) where status in ('pending','failed','sending');
create table public.meta_checkout_attributions (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 session_id uuid not null references public.sales_catalog_payment_sessions(id) on delete cascade,
 visitor_id uuid not null,
 pixel_id text not null,
 revision uuid not null,
 source_url text not null,
 user_data jsonb not null,
 test_event_code text,
 completed boolean not null default false,
 created_at timestamptz not null default now(),
 primary key(organization_id,session_id),
 foreign key(organization_id,visitor_id) references public.meta_pixel_consents(organization_id,visitor_id)
);
alter table public.meta_pixel_connections enable row level security;
alter table public.meta_pixel_consents enable row level security;
alter table public.meta_conversion_events enable row level security;
alter table public.meta_checkout_attributions enable row level security;
revoke all on public.meta_pixel_connections,public.meta_pixel_consents,public.meta_conversion_events,public.meta_checkout_attributions from anon,authenticated;
grant all on public.meta_pixel_connections,public.meta_pixel_consents,public.meta_conversion_events,public.meta_checkout_attributions to service_role;
