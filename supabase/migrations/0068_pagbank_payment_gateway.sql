-- PagBank payment gateway rollout
-- Keeps Mercado Pago records valid while enabling PagBank as the active client checkout gateway.

alter table public.sales_catalog_payment_integrations
  drop constraint if exists sales_catalog_payment_integrations_provider_check;

alter table public.sales_catalog_payment_integrations
  add constraint sales_catalog_payment_integrations_provider_check
  check (provider in ('mercado_pago', 'pagbank'));

alter table public.sales_catalog_payment_sessions
  drop constraint if exists sales_catalog_payment_sessions_provider_check;

alter table public.sales_catalog_payment_sessions
  add constraint sales_catalog_payment_sessions_provider_check
  check (provider in ('mercado_pago', 'pagbank'));

alter table public.sales_catalog_payment_webhook_events
  drop constraint if exists sales_catalog_payment_webhook_events_provider_check;

alter table public.sales_catalog_payment_webhook_events
  add constraint sales_catalog_payment_webhook_events_provider_check
  check (provider in ('mercado_pago', 'pagbank'));

insert into public.integration_providers (
  id,
  name,
  category,
  status,
  mode,
  auth_type,
  headline,
  description,
  feature_flags
)
values
  (
    'pagbank',
    'PagBank',
    'payments',
    'active',
    'external',
    'oauth',
    'Recebimento por Pix no checkout WhatsApp',
    'Gateway principal da fase atual. O cliente autoriza a propria conta PagBank pelo Connect Authorization usando o link oficial/afiliado da ConnectyHub.',
    '{"source_table": "sales_catalog_payment_integrations", "primary_gateway": true, "affiliate_connect": true}'::jsonb
  )
on conflict (id) do update
set
  name = excluded.name,
  category = excluded.category,
  status = excluded.status,
  mode = excluded.mode,
  auth_type = excluded.auth_type,
  headline = excluded.headline,
  description = excluded.description,
  feature_flags = public.integration_providers.feature_flags || excluded.feature_flags,
  updated_at = now();

update public.integration_providers
set
  status = 'planned',
  description = 'Fluxo preservado em standby. Nao exibir como gateway principal ate a conta/aplicativo Mercado Pago da ConnectyHub ser destravado.',
  feature_flags = feature_flags || '{"protected_existing_flow": true, "standby": true}'::jsonb,
  updated_at = now()
where id = 'mercado-pago';
