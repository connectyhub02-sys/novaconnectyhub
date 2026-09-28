-- The attendance chat must show only what the lead sent. The automatic media analysis
-- used to overwrite the lead's message text; it now lives in payload.media_analysis.text
-- (read by the agent), and the message text goes back to the original caption or empty.
update public.conversation_messages
set
  payload = jsonb_set(
    coalesce(payload, '{}'::jsonb),
    '{media_analysis}',
    coalesce(payload->'media_analysis', '{}'::jsonb)
      || jsonb_build_object(
        'text', trim(regexp_replace(text_content, '^Analise automatica de [^:]+:\s*', '', 'i')),
        'kind', coalesce(payload->'media_analysis'->>'kind', case
          when message_type ilike '%video%' then 'video'
          when message_type ilike '%document%' then 'document'
          else 'image' end)
      )
  ),
  text_content = nullif(trim(coalesce(payload->'message'->>'text', payload->'message'->'content'->>'caption', '')), '')
where text_content ilike 'Analise automatica de %';
