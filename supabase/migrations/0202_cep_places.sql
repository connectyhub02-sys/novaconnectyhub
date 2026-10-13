-- Public postal-code directory answers (ViaCEP/BrasilAPI): street, district and city of a CEP.
-- Shared by every company: a CEP is public geography, never customer data. Server-only, so the
-- WhatsApp agent, checkout and payment guard resolve the same district without a new network call.
create table public.cep_places (
  cep text primary key check (cep ~ '^[0-9]{8}$'),
  street text,
  neighborhood text,
  city text,
  uf text,
  source text not null check (source in ('viacep','brasilapi')),
  fetched_at timestamptz not null default now()
);
alter table public.cep_places enable row level security;
revoke all on public.cep_places from public, anon, authenticated, service_role;
grant select, insert, update on public.cep_places to service_role;
comment on table public.cep_places is 'Public CEP directory cache (street, district, city). No customer data. Server-only.';
notify pgrst, 'reload schema';
