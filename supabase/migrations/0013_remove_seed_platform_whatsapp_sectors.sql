-- Platform WhatsApp sectors must be created by admins.
-- Remove the legacy seeded sectors only when they have no linked agents or memory.

delete from public.platform_whatsapp_sectors sectors
where coalesce(sectors.metadata->>'seed', 'false') = 'true'
  and not exists (
    select 1
    from public.agent_registry agents
    where agents.scope = 'platform'
      and agents.organization_id is null
      and agents.sector_code = sectors.sector_code
      and agents.metadata @> '{"admin_whatsapp":true,"agent_kind":"whatsapp"}'::jsonb
  )
  and not exists (
    select 1
    from public.intelligence_memory memory
    where memory.scope = 'platform'
      and memory.organization_id is null
      and memory.metadata @> jsonb_build_object(
        'admin_whatsapp', true,
        'sector_id', sectors.id::text
      )
  );
