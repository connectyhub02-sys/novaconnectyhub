-- 0158_platform_product_compliance_rules.sql
-- Controle dinâmico de compliance e restrição de produtos por país gerenciado exclusivamente pelo Administrador da Plataforma.

create table if not exists public.platform_product_compliance_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  category text not null default 'health_controlled',
  country_code text not null default 'BR',
  keywords text[] not null default '{}',
  intent_keywords text[] not null default '{}',
  action text not null default 'block_all',
  blocked_message text not null default '',
  is_enabled boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint compliance_rules_action_check check (action in ('block_all', 'block_checkout', 'warn')),
  constraint compliance_rules_category_check check (category in ('health_controlled', 'supplements', 'illicit_drugs', 'weapons', 'adult', 'custom'))
);

create index if not exists idx_compliance_rules_country_active
  on public.platform_product_compliance_rules (country_code, is_enabled);

drop trigger if exists trg_compliance_rules_updated_at on public.platform_product_compliance_rules;
create trigger trg_compliance_rules_updated_at
  before update on public.platform_product_compliance_rules
  for each row execute function public.touch_updated_at();

alter table public.platform_product_compliance_rules enable row level security;

drop policy if exists "compliance rules visible by platform admin" on public.platform_product_compliance_rules;
create policy "compliance rules visible by platform admin"
  on public.platform_product_compliance_rules for select
  using (public.is_platform_admin());

drop policy if exists "compliance rules modifiable by platform admin" on public.platform_product_compliance_rules;
create policy "compliance rules modifiable by platform admin"
  on public.platform_product_compliance_rules for all
  using (public.is_platform_admin());

-- Seed inicial de proteção para o Brasil com as substâncias atualmente mapeadas
insert into public.platform_product_compliance_rules (
  name,
  slug,
  category,
  country_code,
  keywords,
  intent_keywords,
  action,
  blocked_message,
  is_enabled,
  notes
) values (
  'Anabolizantes e Esteroides Controlados',
  'anabolizantes-esteroides-br',
  'health_controlled',
  'BR',
  array['anabolizante', 'anabolizantes', 'testosterona', 'testo', 'drostanolona', 'masteron', 'oxandrolona', 'trembolona', 'nandrolona', 'metenolona', 'primobolan', 'stanozolol', 'durateston'],
  array['recomenda', 'indica', 'preferencia', 'ganhar massa', 'massa seca', 'secar', 'injetavel', 'ciclo', 'kit'],
  'block_all',
  'Não posso recomendar combinações de anabolizantes para objetivos físicos nem organizar a compra desses medicamentos por aqui. Para avaliar indicação e tratamento, procure um profissional de saúde habilitado. Não vou gerar pedido ou pagamento para esses medicamentos.',
  true,
  'Substâncias sujeitas a controle especial conforme lista da Anvisa (Portaria 344/98). Pode ser desativada ou alterada pelo administrador a qualquer momento.'
) on conflict (slug) do nothing;
