drop index if exists public.idx_conversations_org_provider_chat;

create unique index if not exists idx_conversations_org_instance_provider_chat
  on public.conversations (organization_id, whatsapp_instance_id, provider, provider_chat_id)
  where provider_chat_id is not null and whatsapp_instance_id is not null;

create index if not exists idx_conversations_lead_instance_recent
  on public.conversations (organization_id, lead_id, whatsapp_instance_id, last_message_at desc)
  where lead_id is not null and whatsapp_instance_id is not null;
