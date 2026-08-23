-- Prevent simultaneous WhatsApp agent runs from replying to the same conversation.

create index if not exists idx_agent_runs_whatsapp_running_conversation
  on public.agent_runs (agent_id, (metadata->>'conversationId'))
  where trigger_source = 'connectyhub/whatsapp.message.received'
    and run_status = 'running'
    and metadata ? 'conversationId';

create index if not exists idx_agent_runs_whatsapp_completed_inbound
  on public.agent_runs (agent_id, (metadata->>'conversationId'), (metadata->>'providerMessageId'), created_at desc)
  where trigger_source = 'connectyhub/whatsapp.message.received'
    and run_status = 'completed'
    and metadata ? 'conversationId'
    and metadata ? 'providerMessageId';

create or replace function public.claim_whatsapp_agent_run(p_run_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_run record;
  target_conversation_id text;
begin
  select id, agent_id, trigger_source, metadata
    into target_run
  from public.agent_runs
  where id = p_run_id
    and run_status = 'queued'
  for update;

  if target_run.id is null then
    return false;
  end if;

  target_conversation_id := target_run.metadata->>'conversationId';

  if target_run.trigger_source = 'connectyhub/whatsapp.message.received'
    and target_conversation_id is not null
    and exists (
      select 1
      from public.agent_runs active_run
      where active_run.id <> target_run.id
        and active_run.agent_id = target_run.agent_id
        and active_run.trigger_source = 'connectyhub/whatsapp.message.received'
        and active_run.run_status = 'running'
        and active_run.metadata->>'conversationId' = target_conversation_id
      limit 1
    )
  then
    return false;
  end if;

  update public.agent_runs
  set run_status = 'running',
      started_at = now()
  where id = target_run.id
    and run_status = 'queued';

  return found;
end;
$$;

revoke all on function public.claim_whatsapp_agent_run(uuid) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_agent_run(uuid) to service_role;
