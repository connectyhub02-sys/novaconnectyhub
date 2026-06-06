create unique index if not exists idx_integration_credentials_platform_unique
on public.integration_credentials (integration_id, env_name)
where scope = 'platform' and organization_id is null;

create unique index if not exists idx_integration_credentials_organization_unique
on public.integration_credentials (organization_id, integration_id, env_name)
where scope = 'organization';
