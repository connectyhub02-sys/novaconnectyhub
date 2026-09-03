-- Asaas payment gateway rollout
-- Adds Asaas as the preferred client checkout gateway while preserving PagBank and Mercado Pago records.

alter table public.sales_catalog_payment_integrations
  drop constraint if exists sales_catalog_payment_integrations_provider_check;

alter table public.sales_catalog_payment_integrations
  add constraint sales_catalog_payment_integrations_provider_check
  check (provider in ('mercado_pago', 'pagbank', 'asaas'));

alter table public.sales_catalog_payment_sessions
  drop constraint if exists sales_catalog_payment_sessions_provider_check;

alter table public.sales_catalog_payment_sessions
  add constraint sales_catalog_payment_sessions_provider_check
  check (provider in ('mercado_pago', 'pagbank', 'asaas'));

alter table public.sales_catalog_payment_webhook_events
  drop constraint if exists sales_catalog_payment_webhook_events_provider_check;

alter table public.sales_catalog_payment_webhook_events
  add constraint sales_catalog_payment_webhook_events_provider_check
  check (provider in ('mercado_pago', 'pagbank', 'asaas'));

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
    'asaas',
    'Asaas',
    'payments',
    'active',
    'external',
    'api_key',
    'Pix no WhatsApp e checkout de cartao',
    'Gateway recomendado para clientes ConnectyHub. A empresa conecta a API Key da propria conta Asaas; Pix e gerado como copia e cola dentro do WhatsApp e cartao segue por checkout seguro rastreado.',
    '{"source_table": "sales_catalog_payment_integrations", "primary_gateway": true, "affiliate_connect": true, "pix_whatsapp": true, "card_checkout": true, "api_key_connect": true}'::jsonb
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
  description = 'Gateway preservado como alternativa. Use quando uma loja ainda depender do fluxo PagBank ou quando Asaas nao estiver conectado.',
  feature_flags = feature_flags || '{"fallback_gateway": true, "protected_existing_flow": true}'::jsonb,
  updated_at = now()
where id = 'pagbank';
