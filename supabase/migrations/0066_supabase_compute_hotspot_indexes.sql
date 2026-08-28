-- Indexes added after production pg_stat_statements showed CPU-heavy
-- conversation, webhook delivery, and stale agent-run queries.

create index if not exists idx_connectyhub_webhook_deliveries_endpoint_event
  on public.connectyhub_webhook_deliveries (endpoint_id, webhook_event_id)
  where webhook_event_id is not null;

create index if not exists idx_conversation_messages_outbound_agent_run_id
  on public.conversation_messages ((payload->>'agent_run_id'))
  where direction = 'outbound';

create index if not exists idx_conversation_messages_org_conversation_time
  on public.conversation_messages (organization_id, conversation_id, occurred_at desc);

create index if not exists idx_conversation_messages_occurred_at_desc
  on public.conversation_messages (occurred_at desc);

create index if not exists idx_agent_runs_status_started_created
  on public.agent_runs (run_status, started_at, created_at);
