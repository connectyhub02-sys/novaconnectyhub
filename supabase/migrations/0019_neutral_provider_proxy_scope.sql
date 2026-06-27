-- Public API scope naming must not expose upstream provider names.

update public.connectyhub_api_keys
set scopes = (
  select array_agg(
    case
      when scope = 'uazapi:proxy' then 'provider:proxy'
      else scope
    end
    order by ordinality
  )
  from unnest(scopes) with ordinality as items(scope, ordinality)
)
where scopes @> array['uazapi:proxy']::text[];

alter table public.connectyhub_api_keys
  alter column scopes set default array[
    'instances:read',
    'instances:write',
    'messages:send',
    'webhooks:read',
    'webhooks:write',
    'provider:proxy'
  ]::text[];
