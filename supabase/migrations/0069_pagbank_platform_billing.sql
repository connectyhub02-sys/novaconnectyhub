-- PagBank passa a ser o provedor principal para cobranca dos planos ConnectyHub.
-- Mercado Pago permanece preservado para conciliacao de pagamentos antigos e reativacao futura.

alter table public.platform_billing_settings
  drop constraint if exists platform_billing_settings_recurring_provider_check;

alter table public.platform_billing_settings
  add constraint platform_billing_settings_recurring_provider_check
  check (recurring_provider in ('mercado_pago', 'pagbank'));

alter table public.platform_billing_settings
  alter column recurring_provider set default 'pagbank';

alter table public.organization_subscriptions
  alter column billing_provider set default 'pagbank';

alter table public.billing_invoices
  alter column provider set default 'pagbank';

alter table public.billing_payments
  alter column provider set default 'pagbank';

update public.platform_billing_settings
set
  recurring_provider = 'pagbank',
  metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object(
      'phase', 'pagbank_platform_billing',
      'previous_recurring_provider', recurring_provider,
      'pagbank_billing_webhook_url', 'https://www.connectyhub.com.br/api/webhooks/pagbank/platform-billing'
    ),
  updated_at = now()
where setting_key = 'default';

insert into public.integration_providers (
  id,
  name,
  category,
  status,
  mode,
  auth_type,
  headline,
  description,
  plan_codes,
  feature_flags,
  metadata
)
values (
  'pagbank-billing',
  'PagBank / Cobranca ConnectyHub',
  'payments',
  'active',
  'internal',
  'api_key',
  'Cobranca de planos ConnectyHub pela conta CNPJ PagBank.',
  'Credenciais internas para cobrar planos, pacotes e creditos da plataforma pela conta CNPJ PagBank da ConnectyHub.',
  '{}'::text[],
  '{"platform_billing":true,"pix":true}'::jsonb,
  '{"owner":"Setor Financeiro IA","webhook_url":"https://www.connectyhub.com.br/api/webhooks/pagbank/platform-billing"}'::jsonb
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
  metadata = public.integration_providers.metadata || excluded.metadata,
  updated_at = now();
