-- Google tag (GA4 and Google Ads conversion) for each client's public store.
-- Public IDs only; no tokens. Read and written by the service role behind tenant checks.
create table public.google_store_tags (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 measurement_id text check (measurement_id ~ '^G-[A-Z0-9]{4,20}$'),
 ads_conversion_id text check (ads_conversion_id ~ '^AW-[0-9]{6,15}$'),
 lead_label text check (lead_label ~ '^[A-Za-z0-9_-]{4,64}$'),
 enabled boolean not null default false,
 updated_by uuid,
 updated_at timestamptz not null default now(),
 check (not enabled or measurement_id is not null or ads_conversion_id is not null),
 check (lead_label is null or ads_conversion_id is not null)
);
alter table public.google_store_tags enable row level security;
revoke all on public.google_store_tags from anon, authenticated;
grant all on public.google_store_tags to service_role;
