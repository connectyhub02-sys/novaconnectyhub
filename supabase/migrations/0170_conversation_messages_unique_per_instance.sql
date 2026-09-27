-- The same WhatsApp message reaches every connected number in a group (and both numbers when two of the
-- platform's numbers talk). A message id is unique per connected number, not globally: with the old rule the
-- second number's copy failed with "duplicate key" and that agent never saw the question. Messages without a
-- connected number (Instagram/Facebook) keep being unique by id (nulls not distinct).
create unique index if not exists idx_conversation_messages_instance_provider_message
  on public.conversation_messages (provider, whatsapp_instance_id, provider_message_id) nulls not distinct
  where provider_message_id is not null;

do $$
declare
  definition text;
  old_conflict constant text := 'on conflict(provider,provider_message_id) where provider_message_id is not null do nothing';
  new_conflict constant text := 'on conflict(provider,whatsapp_instance_id,provider_message_id) where provider_message_id is not null do nothing';
begin
  definition := pg_get_functiondef('public.archive_platform_customer_journey(integer)'::regprocedure);
  if position(new_conflict in definition) = 0 then
    if position(old_conflict in definition) = 0 then raise exception 'archive_platform_customer_journey sem o conflito esperado'; end if;
    execute replace(definition, old_conflict, new_conflict);
  end if;
end $$;

drop index if exists public.idx_conversation_messages_provider_message;

notify pgrst, 'reload schema';
