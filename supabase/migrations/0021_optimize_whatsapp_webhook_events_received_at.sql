-- Speed up the admin API WhatsApp panel, which reads recent provider webhook events globally.
create index if not exists idx_whatsapp_webhook_events_received_at_desc
  on public.whatsapp_webhook_events (received_at desc);
