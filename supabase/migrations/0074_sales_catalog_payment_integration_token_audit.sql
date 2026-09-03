-- Sales catalog payment integration token audit fields
-- Adds optional credential metadata columns used by API-key and OAuth payment providers.

alter table public.sales_catalog_payment_integrations
  add column if not exists access_token_hash text,
  add column if not exists refresh_token_hash text,
  add column if not exists token_type text,
  add column if not exists webhook_secret_hash text;

notify pgrst, 'reload schema';
