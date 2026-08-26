-- Keep WhatsApp ingest, monitoring, and recovery reads off sequential scans as volume grows.

create index if not exists idx_conversation_messages_created_at_desc
  on public.conversation_messages (created_at desc);

create index if not exists idx_conversation_messages_instance_created
  on public.conversation_messages (whatsapp_instance_id, created_at desc)
  where whatsapp_instance_id is not null;

create index if not exists idx_agent_runs_whatsapp_created
  on public.agent_runs (created_at desc)
  where trigger_source = 'connectyhub/whatsapp.message.received';

create index if not exists idx_agent_runs_whatsapp_status_created
  on public.agent_runs (run_status, created_at desc)
  where trigger_source = 'connectyhub/whatsapp.message.received';

create index if not exists idx_whatsapp_webhook_events_event_received
  on public.whatsapp_webhook_events (event_type, received_at desc);
