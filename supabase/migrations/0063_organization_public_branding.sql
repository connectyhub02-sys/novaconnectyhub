-- Organization public branding
-- Stores the shop identity shown on public product and checkout pages.

alter table public.organizations
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_organizations_brand_logo_url
  on public.organizations ((metadata->>'brand_logo_url'))
  where metadata ? 'brand_logo_url';
