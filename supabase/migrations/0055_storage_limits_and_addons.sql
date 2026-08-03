-- Storage quotas and add-on packages.
-- Storage is billed by organization and follows the active billing plan plus active add-ons.

alter table public.billing_plans
  add column if not exists storage_limit_bytes bigint not null default 0,
  add column if not exists storage_file_limit integer not null default 0,
  add column if not exists storage_image_max_bytes bigint not null default 0,
  add column if not exists storage_video_max_bytes bigint not null default 0,
  add column if not exists storage_file_max_bytes bigint not null default 0;

do $$
begin
  alter table public.billing_plans
    add constraint billing_plans_storage_limits_non_negative
    check (
      storage_limit_bytes >= 0
      and storage_file_limit >= 0
      and storage_image_max_bytes >= 0
      and storage_video_max_bytes >= 0
      and storage_file_max_bytes >= 0
    );
exception
  when duplicate_object then null;
end $$;

update public.billing_plans
set
  storage_limit_bytes = 250 * 1024::bigint * 1024,
  storage_file_limit = 100,
  storage_image_max_bytes = 5 * 1024::bigint * 1024,
  storage_video_max_bytes = 30 * 1024::bigint * 1024,
  storage_file_max_bytes = 25 * 1024::bigint * 1024,
  metadata = metadata || jsonb_build_object(
    'storage_policy_version', 'storage_limits_v1',
    'storage_limit_label', '250 MB',
    'storage_notes', 'Teste gratis com limite suficiente para validar catalogo, anexos e conhecimento inicial.'
  )
where plan_code = 'trial';

update public.billing_plans
set
  storage_limit_bytes = 1 * 1024::bigint * 1024 * 1024,
  storage_file_limit = 500,
  storage_image_max_bytes = 8 * 1024::bigint * 1024,
  storage_video_max_bytes = 50 * 1024::bigint * 1024,
  storage_file_max_bytes = 50 * 1024::bigint * 1024,
  metadata = metadata || jsonb_build_object(
    'storage_policy_version', 'storage_limits_v1',
    'storage_limit_label', '1 GB',
    'storage_notes', 'Plano de entrada para catalogo com imagens leves e documentos de conhecimento.'
  )
where plan_code = 'starter';

update public.billing_plans
set
  storage_limit_bytes = 5 * 1024::bigint * 1024 * 1024,
  storage_file_limit = 2500,
  storage_image_max_bytes = 12 * 1024::bigint * 1024,
  storage_video_max_bytes = 100 * 1024::bigint * 1024,
  storage_file_max_bytes = 100 * 1024::bigint * 1024,
  metadata = metadata || jsonb_build_object(
    'storage_policy_version', 'storage_limits_v1',
    'storage_limit_label', '5 GB',
    'storage_notes', 'Plano para operacao com catalogo maior, mais imagens e documentos comerciais.'
  )
where plan_code = 'pro';

update public.billing_plans
set
  storage_limit_bytes = 20 * 1024::bigint * 1024 * 1024,
  storage_file_limit = 10000,
  storage_image_max_bytes = 20 * 1024::bigint * 1024,
  storage_video_max_bytes = 250 * 1024::bigint * 1024,
  storage_file_max_bytes = 250 * 1024::bigint * 1024,
  metadata = metadata || jsonb_build_object(
    'storage_policy_version', 'storage_limits_v1',
    'storage_limit_label', '20 GB',
    'storage_notes', 'Plano para times com muitos produtos, videos curtos e biblioteca comercial maior.'
  )
where plan_code = 'scale';

create table if not exists public.storage_addon_packages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  storage_bytes bigint not null,
  file_limit integer not null default 0,
  monthly_price_brl numeric(18,2) not null,
  status text not null default 'active',
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (code ~ '^[a-z0-9_-]{2,80}$'),
  check (storage_bytes > 0),
  check (file_limit >= 0),
  check (monthly_price_brl >= 0),
  check (status in ('active', 'archived'))
);

drop trigger if exists touch_storage_addon_packages_updated_at on public.storage_addon_packages;
create trigger touch_storage_addon_packages_updated_at
before update on public.storage_addon_packages
for each row execute function public.touch_updated_at();

create table if not exists public.organization_storage_addons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  package_id uuid references public.storage_addon_packages(id) on delete set null,
  package_code text not null,
  quantity integer not null default 1,
  status text not null default 'active',
  provider text,
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (package_code ~ '^[a-z0-9_-]{2,80}$'),
  check (quantity > 0),
  check (status in ('active', 'pending', 'past_due', 'canceled', 'expired'))
);

create index if not exists idx_organization_storage_addons_org_status
  on public.organization_storage_addons (organization_id, status, created_at desc);

drop trigger if exists touch_organization_storage_addons_updated_at on public.organization_storage_addons;
create trigger touch_organization_storage_addons_updated_at
before update on public.organization_storage_addons
for each row execute function public.touch_updated_at();

create table if not exists public.organization_storage_usage (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  used_bytes bigint not null default 0,
  billable_file_count integer not null default 0,
  product_media_bytes bigint not null default 0,
  knowledge_bytes bigint not null default 0,
  import_source_bytes bigint not null default 0,
  generated_media_bytes bigint not null default 0,
  lead_file_bytes bigint not null default 0,
  other_bytes bigint not null default 0,
  last_recalculated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  check (used_bytes >= 0),
  check (billable_file_count >= 0),
  check (product_media_bytes >= 0),
  check (knowledge_bytes >= 0),
  check (import_source_bytes >= 0),
  check (generated_media_bytes >= 0),
  check (lead_file_bytes >= 0),
  check (other_bytes >= 0)
);

drop trigger if exists touch_organization_storage_usage_updated_at on public.organization_storage_usage;
create trigger touch_organization_storage_usage_updated_at
before update on public.organization_storage_usage
for each row execute function public.touch_updated_at();

alter table public.storage_addon_packages enable row level security;
alter table public.organization_storage_addons enable row level security;
alter table public.organization_storage_usage enable row level security;

drop policy if exists "storage addon packages visible to authenticated users" on public.storage_addon_packages;
create policy "storage addon packages visible to authenticated users"
on public.storage_addon_packages for select
using (auth.uid() is not null and (status = 'active' or public.is_platform_admin()));

drop policy if exists "storage addon packages managed by platform admins" on public.storage_addon_packages;
create policy "storage addon packages managed by platform admins"
on public.storage_addon_packages for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "organization storage addons visible by organization" on public.organization_storage_addons;
create policy "organization storage addons visible by organization"
on public.organization_storage_addons for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "organization storage addons managed by platform admins" on public.organization_storage_addons;
create policy "organization storage addons managed by platform admins"
on public.organization_storage_addons for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "organization storage usage visible by organization" on public.organization_storage_usage;
create policy "organization storage usage visible by organization"
on public.organization_storage_usage for select
using (public.is_platform_admin() or public.is_organization_member(organization_id));

drop policy if exists "organization storage usage managed by platform admins" on public.organization_storage_usage;
create policy "organization storage usage managed by platform admins"
on public.organization_storage_usage for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

insert into public.storage_addon_packages (
  code,
  name,
  description,
  storage_bytes,
  file_limit,
  monthly_price_brl,
  status,
  sort_order,
  metadata
)
values
  (
    'storage_5gb',
    '+5 GB de armazenamento',
    'Pacote leve para catalogos com mais imagens de produtos.',
    5 * 1024::bigint * 1024 * 1024,
    2500,
    19,
    'active',
    10,
    '{"target_margin":"high","recommended_for":"starter"}'::jsonb
  ),
  (
    'storage_20gb',
    '+20 GB de armazenamento',
    'Pacote para operacoes com muitos produtos e videos curtos.',
    20 * 1024::bigint * 1024 * 1024,
    10000,
    49,
    'active',
    20,
    '{"target_margin":"high","recommended_for":"pro"}'::jsonb
  ),
  (
    'storage_50gb',
    '+50 GB de armazenamento',
    'Pacote para catalogos robustos, marcas com muitas fotos e anexos.',
    50 * 1024::bigint * 1024 * 1024,
    25000,
    97,
    'active',
    30,
    '{"target_margin":"high","recommended_for":"scale"}'::jsonb
  ),
  (
    'storage_100gb',
    '+100 GB de armazenamento',
    'Pacote de escala para operacoes com alto volume de midia.',
    100 * 1024::bigint * 1024 * 1024,
    50000,
    147,
    'active',
    40,
    '{"target_margin":"high","recommended_for":"scale_plus"}'::jsonb
  )
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  storage_bytes = excluded.storage_bytes,
  file_limit = excluded.file_limit,
  monthly_price_brl = excluded.monthly_price_brl,
  status = excluded.status,
  sort_order = excluded.sort_order,
  metadata = public.storage_addon_packages.metadata || excluded.metadata,
  updated_at = now();

create or replace function public.get_organization_storage_entitlement(p_organization_id uuid)
returns table (
  organization_id uuid,
  plan_code text,
  plan_name text,
  plan_storage_limit_bytes bigint,
  plan_storage_file_limit integer,
  storage_image_max_bytes bigint,
  storage_video_max_bytes bigint,
  storage_file_max_bytes bigint,
  addon_storage_bytes bigint,
  addon_file_limit integer,
  total_storage_limit_bytes bigint,
  total_storage_file_limit integer
)
language sql
stable
security definer
set search_path = public
as $fn$
  with org as (
    select o.id, o.plan_code
    from public.organizations o
    where o.id = p_organization_id
      and (
        auth.uid() is null
        or public.is_platform_admin()
        or public.is_organization_member(o.id)
      )
  ),
  selected_plan as (
    select
      org.id as organization_id,
      coalesce(
        (
          select os.plan_code
          from public.organization_subscriptions os
          where os.organization_id = org.id
            and os.status in ('active', 'past_due')
          order by os.current_period_end desc nulls last, os.updated_at desc
          limit 1
        ),
        org.plan_code
      ) as plan_code
    from org
  ),
  addons as (
    select
      osa.organization_id,
      coalesce(sum(sap.storage_bytes * osa.quantity), 0)::bigint as storage_bytes,
      coalesce(sum(sap.file_limit * osa.quantity), 0)::integer as file_limit
    from public.organization_storage_addons osa
    join public.storage_addon_packages sap
      on sap.code = osa.package_code
    where osa.organization_id = p_organization_id
      and osa.status = 'active'
      and (osa.current_period_end is null or osa.current_period_end > now())
      and sap.status = 'active'
    group by osa.organization_id
  )
  select
    sp.organization_id,
    sp.plan_code,
    bp.name as plan_name,
    coalesce(bp.storage_limit_bytes, 0)::bigint as plan_storage_limit_bytes,
    coalesce(bp.storage_file_limit, 0)::integer as plan_storage_file_limit,
    coalesce(bp.storage_image_max_bytes, 0)::bigint as storage_image_max_bytes,
    coalesce(bp.storage_video_max_bytes, 0)::bigint as storage_video_max_bytes,
    coalesce(bp.storage_file_max_bytes, 0)::bigint as storage_file_max_bytes,
    coalesce(addons.storage_bytes, 0)::bigint as addon_storage_bytes,
    coalesce(addons.file_limit, 0)::integer as addon_file_limit,
    (coalesce(bp.storage_limit_bytes, 0) + coalesce(addons.storage_bytes, 0))::bigint as total_storage_limit_bytes,
    (coalesce(bp.storage_file_limit, 0) + coalesce(addons.file_limit, 0))::integer as total_storage_file_limit
  from selected_plan sp
  left join public.billing_plans bp
    on bp.plan_code = sp.plan_code
  left join addons
    on addons.organization_id = sp.organization_id;
$fn$;

grant execute on function public.get_organization_storage_entitlement(uuid) to authenticated;
grant execute on function public.get_organization_storage_entitlement(uuid) to service_role;

create or replace function public.record_organization_storage_usage(
  p_organization_id uuid,
  p_bytes bigint,
  p_file_count integer default 1,
  p_category text default 'other',
  p_metadata jsonb default '{}'::jsonb
)
returns public.organization_storage_usage
language plpgsql
security definer
set search_path = public
as $fn$
declare
  normalized_bytes bigint := greatest(coalesce(p_bytes, 0), 0);
  normalized_file_count integer := greatest(coalesce(p_file_count, 0), 0);
  normalized_category text := coalesce(nullif(trim(lower(p_category)), ''), 'other');
  usage_row public.organization_storage_usage%rowtype;
begin
  if auth.uid() is not null
    and not public.is_platform_admin()
    and not public.is_organization_admin(p_organization_id)
  then
    raise exception 'Acesso negado para registrar armazenamento.';
  end if;

  if normalized_category not in ('product_media', 'knowledge', 'import_source', 'generated_media', 'lead_file', 'other') then
    normalized_category := 'other';
  end if;

  insert into public.organization_storage_usage (
    organization_id,
    used_bytes,
    billable_file_count,
    product_media_bytes,
    knowledge_bytes,
    import_source_bytes,
    generated_media_bytes,
    lead_file_bytes,
    other_bytes,
    metadata,
    updated_at
  )
  values (
    p_organization_id,
    normalized_bytes,
    normalized_file_count,
    case when normalized_category = 'product_media' then normalized_bytes else 0 end,
    case when normalized_category = 'knowledge' then normalized_bytes else 0 end,
    case when normalized_category = 'import_source' then normalized_bytes else 0 end,
    case when normalized_category = 'generated_media' then normalized_bytes else 0 end,
    case when normalized_category = 'lead_file' then normalized_bytes else 0 end,
    case when normalized_category = 'other' then normalized_bytes else 0 end,
    jsonb_build_object('last_recorded_category', normalized_category) || coalesce(p_metadata, '{}'::jsonb),
    now()
  )
  on conflict (organization_id) do update
  set
    used_bytes = public.organization_storage_usage.used_bytes + normalized_bytes,
    billable_file_count = public.organization_storage_usage.billable_file_count + normalized_file_count,
    product_media_bytes = public.organization_storage_usage.product_media_bytes + case when normalized_category = 'product_media' then normalized_bytes else 0 end,
    knowledge_bytes = public.organization_storage_usage.knowledge_bytes + case when normalized_category = 'knowledge' then normalized_bytes else 0 end,
    import_source_bytes = public.organization_storage_usage.import_source_bytes + case when normalized_category = 'import_source' then normalized_bytes else 0 end,
    generated_media_bytes = public.organization_storage_usage.generated_media_bytes + case when normalized_category = 'generated_media' then normalized_bytes else 0 end,
    lead_file_bytes = public.organization_storage_usage.lead_file_bytes + case when normalized_category = 'lead_file' then normalized_bytes else 0 end,
    other_bytes = public.organization_storage_usage.other_bytes + case when normalized_category = 'other' then normalized_bytes else 0 end,
    metadata = public.organization_storage_usage.metadata
      || jsonb_build_object('last_recorded_category', normalized_category)
      || coalesce(p_metadata, '{}'::jsonb),
    updated_at = now()
  returning * into usage_row;

  return usage_row;
end;
$fn$;

grant execute on function public.record_organization_storage_usage(uuid, bigint, integer, text, jsonb) to service_role;

do $$
begin
  alter table public.billing_invoice_items
    drop constraint if exists billing_invoice_items_item_type_check;

  alter table public.billing_invoice_items
    add constraint billing_invoice_items_item_type_check
    check (item_type in ('plan', 'included_credits', 'overage_credits', 'credit_pack', 'storage_addon', 'adjustment'));
exception
  when undefined_table then null;
end $$;

with product_media as (
  select
    im.organization_id,
    coalesce(sum(case when (media_item.value ->> 'size') ~ '^[0-9]+$' then (media_item.value ->> 'size')::bigint else 0 end), 0)::bigint as bytes,
    count(*)::integer as file_count
  from public.intelligence_memory im
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(im.metadata -> 'media') = 'array' then im.metadata -> 'media' else '[]'::jsonb end
  ) media_item
  where im.organization_id is not null
    and im.memory_type = 'sales_catalog_item'
  group by im.organization_id
),
knowledge as (
  select
    im.organization_id,
    coalesce(sum(case when (im.metadata ->> 'size') ~ '^[0-9]+$' then (im.metadata ->> 'size')::bigint else 0 end), 0)::bigint as bytes,
    (count(*) filter (where (im.metadata ->> 'size') ~ '^[0-9]+$'))::integer as file_count
  from public.intelligence_memory im
  where im.organization_id is not null
    and im.memory_type = 'knowledge_file'
  group by im.organization_id
),
import_sources as (
  select
    sis.organization_id,
    coalesce(sum(coalesce(sis.file_size, 0)), 0)::bigint as bytes,
    (count(*) filter (where coalesce(sis.file_size, 0) > 0))::integer as file_count
  from public.sales_catalog_import_sources sis
  group by sis.organization_id
),
generated_media as (
  select
    gm.organization_id,
    coalesce(sum(coalesce(gm.bytes_size, 0)), 0)::bigint as bytes,
    (count(*) filter (where coalesce(gm.bytes_size, 0) > 0))::integer as file_count
  from public.generated_media gm
  group by gm.organization_id
),
lead_files as (
  select
    lf.organization_id,
    coalesce(sum(coalesce(lf.byte_size, 0)), 0)::bigint as bytes,
    (count(*) filter (where coalesce(lf.byte_size, 0) > 0))::integer as file_count
  from public.lead_files lf
  group by lf.organization_id
),
rollup as (
  select
    o.id as organization_id,
    coalesce(pm.bytes, 0)::bigint as product_media_bytes,
    coalesce(k.bytes, 0)::bigint as knowledge_bytes,
    coalesce(ims.bytes, 0)::bigint as import_source_bytes,
    coalesce(gm.bytes, 0)::bigint as generated_media_bytes,
    coalesce(lf.bytes, 0)::bigint as lead_file_bytes,
    (
      coalesce(pm.file_count, 0)
      + coalesce(k.file_count, 0)
      + coalesce(ims.file_count, 0)
      + coalesce(gm.file_count, 0)
      + coalesce(lf.file_count, 0)
    )::integer as file_count
  from public.organizations o
  left join product_media pm on pm.organization_id = o.id
  left join knowledge k on k.organization_id = o.id
  left join import_sources ims on ims.organization_id = o.id
  left join generated_media gm on gm.organization_id = o.id
  left join lead_files lf on lf.organization_id = o.id
)
insert into public.organization_storage_usage (
  organization_id,
  used_bytes,
  billable_file_count,
  product_media_bytes,
  knowledge_bytes,
  import_source_bytes,
  generated_media_bytes,
  lead_file_bytes,
  other_bytes,
  last_recalculated_at,
  metadata,
  updated_at
)
select
  organization_id,
  product_media_bytes + knowledge_bytes + import_source_bytes + generated_media_bytes + lead_file_bytes,
  file_count,
  product_media_bytes,
  knowledge_bytes,
  import_source_bytes,
  generated_media_bytes,
  lead_file_bytes,
  0,
  now(),
  jsonb_build_object('backfilled_by', '0055_storage_limits_and_addons'),
  now()
from rollup
where product_media_bytes + knowledge_bytes + import_source_bytes + generated_media_bytes + lead_file_bytes > 0
on conflict (organization_id) do update
set
  used_bytes = greatest(public.organization_storage_usage.used_bytes, excluded.used_bytes),
  billable_file_count = greatest(public.organization_storage_usage.billable_file_count, excluded.billable_file_count),
  product_media_bytes = greatest(public.organization_storage_usage.product_media_bytes, excluded.product_media_bytes),
  knowledge_bytes = greatest(public.organization_storage_usage.knowledge_bytes, excluded.knowledge_bytes),
  import_source_bytes = greatest(public.organization_storage_usage.import_source_bytes, excluded.import_source_bytes),
  generated_media_bytes = greatest(public.organization_storage_usage.generated_media_bytes, excluded.generated_media_bytes),
  lead_file_bytes = greatest(public.organization_storage_usage.lead_file_bytes, excluded.lead_file_bytes),
  last_recalculated_at = now(),
  metadata = public.organization_storage_usage.metadata || excluded.metadata,
  updated_at = now();
