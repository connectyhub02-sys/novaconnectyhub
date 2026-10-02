-- Voice phase C: developer API.
-- 1) Receipts of long texts can hold whole e-books (up to 250,000 characters and
--    250 MB); single generations stay limited to 4,800 characters by the API.
-- 2) Output format and timestamps (alignment) per generation.
-- 3) Project webhooks with an encrypted signing secret and a delivery log.

alter table public.voice_generations drop constraint if exists voice_generations_characters_check;
alter table public.voice_generations add constraint voice_generations_characters_check check (characters between 1 and 250000);
alter table public.voice_generations drop constraint if exists voice_generations_bytes_size_check;
alter table public.voice_generations add constraint voice_generations_bytes_size_check check (bytes_size between 1 and 250000000);

alter table public.voice_generations add column if not exists output_format text not null default 'mp3_44100_128';
alter table public.voice_generations add column if not exists alignment_path text;
alter table public.voice_generations drop constraint if exists voice_generations_output_format_check;
alter table public.voice_generations add constraint voice_generations_output_format_check check (output_format in (
  'mp3_44100_128', 'mp3_44100_64', 'mp3_22050_32', 'pcm_16000', 'pcm_22050', 'pcm_24000', 'ulaw_8000', 'opus_48000_64'));

alter table public.voice_projects add column if not exists webhook_url text;
alter table public.voice_projects add column if not exists webhook_secret_ciphertext text;
alter table public.voice_projects add column if not exists webhook_updated_at timestamptz;
alter table public.voice_projects drop constraint if exists voice_projects_webhook_url_check;
alter table public.voice_projects add constraint voice_projects_webhook_url_check check (
  webhook_url is null or (webhook_url ~ '^https://[^\s/$.?#][^\s]*$' and length(webhook_url) <= 500));

create table if not exists public.voice_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.voice_projects(id) on delete cascade,
  generation_id uuid not null references public.voice_generations(id) on delete cascade,
  event_type text not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts integer not null default 0,
  response_status integer,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  last_attempt_at timestamptz,
  unique (generation_id, event_type)
);
alter table public.voice_webhook_deliveries enable row level security;
revoke all on public.voice_webhook_deliveries from public, anon, authenticated;
grant select, insert, update on public.voice_webhook_deliveries to service_role;

-- New output formats and alignment files in the private voice bucket (server cap is 50 MB).
update storage.buckets set file_size_limit = 40000000,
  allowed_mime_types = array['audio/mpeg', 'audio/pcm', 'audio/basic', 'audio/ogg', 'application/json']
where id = 'connectyhub-voice';

-- Finished asynchronous operations of projects with a webhook, not yet delivered.
-- Failed deliveries are retried with a growing pause (5, 10, 20, 40 minutes).
create or replace function public.voice_webhook_pending(p_limit integer, p_max_attempts integer)
returns table(generation_id uuid, project_id uuid, status text, operation text, model_id text, charged_credits numeric,
  reserved_credits numeric, quoted_credits numeric, error_code text, created_at timestamptz, updated_at timestamptz,
  webhook_url text, webhook_secret_ciphertext text, delivery_status text, attempts integer)
language sql stable security definer set search_path = public as $$
  select g.id, g.project_id, g.status, s.operation, g.model_id, g.charged_credits, g.reserved_credits, g.quoted_credits,
    g.error_code, g.created_at, g.updated_at, p.webhook_url, p.webhook_secret_ciphertext, d.status, d.attempts
  from public.voice_generations g
  join public.studio_operations s on s.id = g.id
  join public.voice_projects p on p.id = g.project_id
  left join public.voice_webhook_deliveries d on d.generation_id = g.id
    and d.event_type = case when g.status = 'completed' then 'voice.operation.completed' else 'voice.operation.failed' end
  where g.operation = 'studio' and g.status in ('completed', 'failed') and g.updated_at > now() - interval '2 days'
    and p.webhook_url is not null and p.webhook_secret_ciphertext is not null
    and p.webhook_updated_at is not null and g.updated_at >= p.webhook_updated_at - interval '1 hour'
    and (d.id is null or (d.status = 'failed' and d.attempts < p_max_attempts
      and d.last_attempt_at < now() - make_interval(mins => 5 * power(2, greatest(d.attempts - 1, 0))::integer)))
  order by g.updated_at
  limit least(greatest(p_limit, 1), 50)
$$;
revoke all on function public.voice_webhook_pending(integer, integer) from public, anon, authenticated;
grant execute on function public.voice_webhook_pending(integer, integer) to service_role;
