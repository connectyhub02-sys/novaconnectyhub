-- Reset legacy manual prompts for customer WhatsApp agents.
-- Connected instances are intentionally untouched; when prompt is empty the app
-- now renders/runs the guided prompt template saved in agent metadata.

with target_agents as (
  select
    id,
    prompt,
    metadata
  from public.agent_registry
  where scope = 'organization'
    and coalesce(prompt, '') <> ''
    and (
      metadata @> '{"agent_kind":"whatsapp"}'::jsonb
      or metadata @> '{"client_created":true}'::jsonb
      or tools @> array['whatsapp']::text[]
      or triggers @> array['connectyhub/whatsapp.message.received']::text[]
    )
)
update public.agent_registry agents
set
  prompt = '',
  metadata = jsonb_set(
    jsonb_set(
      agents.metadata,
      '{legacy_prompt_reset}',
      coalesce(
        agents.metadata->'legacy_prompt_reset',
        jsonb_build_object(
          'reset_by', '0054_reset_client_whatsapp_agent_prompts',
          'reset_at', now(),
          'previous_prompt', target_agents.prompt,
          'previous_prompt_length', char_length(target_agents.prompt)
        )
      ),
      true
    ),
    '{prompt_control}',
    coalesce(agents.metadata->'prompt_control', '{}'::jsonb) || jsonb_build_object(
      'last_updated_at', now(),
      'source', 'migration_reset_client_whatsapp_agent_prompts',
      'previous_length', char_length(target_agents.prompt),
      'current_length', 0
    ),
    true
  ),
  updated_at = now()
from target_agents
where agents.id = target_agents.id;
