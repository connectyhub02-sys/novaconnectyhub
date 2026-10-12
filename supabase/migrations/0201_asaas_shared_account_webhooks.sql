-- Server-only shared authentication, independent of company/user/API key.
create table public.asaas_account_webhooks (
  mode text not null check (mode in ('sandbox','production')),
  provider_webhook_id text not null,
  webhook_url text not null,
  secret_encrypted text not null,
  secret_hash text not null,
  created_at timestamptz not null default now(),
  primary key (mode, provider_webhook_id)
);
alter table public.asaas_account_webhooks enable row level security;
revoke all on public.asaas_account_webhooks from public, anon, authenticated;
grant select, insert on public.asaas_account_webhooks to service_role;
comment on table public.asaas_account_webhooks is 'Canonical Asaas webhook secret; no tenant API credentials or payment ownership. Server-only. Reconnect must not rotate.';

-- Preserve existing live webhooks. Older tenants retain their own API keys and
-- ownership; readers use this canonical secret when the same provider ID matches.
insert into public.asaas_account_webhooks(mode,provider_webhook_id,webhook_url,secret_encrypted,secret_hash)
select distinct on (mode,metadata->>'webhook_provider_id')
  mode,metadata->>'webhook_provider_id',webhook_url,webhook_secret_encrypted,webhook_secret_hash
from public.sales_catalog_payment_integrations
where provider='asaas' and mode in ('production','sandbox')
  and nullif(metadata->>'webhook_provider_id','') is not null
  and webhook_url is not null and webhook_secret_encrypted is not null and webhook_secret_hash is not null
order by mode,metadata->>'webhook_provider_id',updated_at desc
on conflict do nothing;
notify pgrst, 'reload schema';
