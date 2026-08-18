create or replace function public.release_organization_storage_usage(
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
    raise exception 'Acesso negado para liberar armazenamento.';
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
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    jsonb_build_object('last_released_category', normalized_category) || coalesce(p_metadata, '{}'::jsonb),
    now()
  )
  on conflict (organization_id) do update
  set
    used_bytes = greatest(0, public.organization_storage_usage.used_bytes - normalized_bytes),
    billable_file_count = greatest(0, public.organization_storage_usage.billable_file_count - normalized_file_count),
    product_media_bytes = case
      when normalized_category = 'product_media' then greatest(0, public.organization_storage_usage.product_media_bytes - normalized_bytes)
      else public.organization_storage_usage.product_media_bytes
    end,
    knowledge_bytes = case
      when normalized_category = 'knowledge' then greatest(0, public.organization_storage_usage.knowledge_bytes - normalized_bytes)
      else public.organization_storage_usage.knowledge_bytes
    end,
    import_source_bytes = case
      when normalized_category = 'import_source' then greatest(0, public.organization_storage_usage.import_source_bytes - normalized_bytes)
      else public.organization_storage_usage.import_source_bytes
    end,
    generated_media_bytes = case
      when normalized_category = 'generated_media' then greatest(0, public.organization_storage_usage.generated_media_bytes - normalized_bytes)
      else public.organization_storage_usage.generated_media_bytes
    end,
    lead_file_bytes = case
      when normalized_category = 'lead_file' then greatest(0, public.organization_storage_usage.lead_file_bytes - normalized_bytes)
      else public.organization_storage_usage.lead_file_bytes
    end,
    other_bytes = case
      when normalized_category = 'other' then greatest(0, public.organization_storage_usage.other_bytes - normalized_bytes)
      else public.organization_storage_usage.other_bytes
    end,
    metadata = public.organization_storage_usage.metadata
      || jsonb_build_object('last_released_category', normalized_category)
      || coalesce(p_metadata, '{}'::jsonb),
    updated_at = now()
  returning * into usage_row;

  return usage_row;
end;
$fn$;

grant execute on function public.release_organization_storage_usage(uuid, bigint, integer, text, jsonb) to service_role;
