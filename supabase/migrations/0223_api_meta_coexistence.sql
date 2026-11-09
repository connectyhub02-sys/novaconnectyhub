begin;
create table public.connectyhub_meta_coexistence (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.connectyhub_api_clients(id),
 organization_id uuid not null references public.organizations(id),
 instance_id uuid not null unique references public.whatsapp_instances(id),
 public_instance_id text not null unique,
 owner_phone text not null,
 state text not null default 'prepared' check(state in ('prepared','linked','disconnected')),
 callback_url text not null,
 callback_secret_encrypted text not null,
 nonce_hash text,
 nonce_expires_at timestamptz,
 nonce_key_id uuid,
 nonce_consumed_at timestamptz,
 app_id text not null,
 config_id text not null,
 waba_id text unique,
 phone_number_id text unique,
 token_encrypted text,
 token_expires_at timestamptz,
 linked_at timestamptz,
 webhook_subscribed boolean not null default false,
 campaigns_enabled boolean not null default false,
 history_sync_state text check(history_sync_state in ('requesting','requested','uncertain')),
 contacts_sync_state text check(contacts_sync_state in ('requesting','requested','uncertain')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.connectyhub_meta_coexistence_events (
 id uuid primary key default gen_random_uuid(),
 connection_id uuid not null references public.connectyhub_meta_coexistence(id),
 event_hash text not null,
 payload jsonb not null,
 received_at timestamptz not null default now(),
 delivered_at timestamptz,
 attempts integer not null default 0,
 last_error text,
 unique(connection_id,event_hash)
);
create index connectyhub_meta_coexistence_events_pending on public.connectyhub_meta_coexistence_events(received_at) where delivered_at is null;
alter table public.connectyhub_meta_coexistence enable row level security;
alter table public.connectyhub_meta_coexistence_events enable row level security;
revoke all on public.connectyhub_meta_coexistence,public.connectyhub_meta_coexistence_events from public,anon,authenticated;
grant all on public.connectyhub_meta_coexistence,public.connectyhub_meta_coexistence_events to service_role;
comment on table public.connectyhub_meta_coexistence is 'Managed Meta coexistence for explicitly enabled API clients. QR ownership and ordinary official-number separation remain unchanged.';
notify pgrst,'reload schema';
commit;
