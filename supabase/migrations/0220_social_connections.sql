-- OAuth social independente de Ads. Tokens nunca são retornados ao navegador.
begin;
create table if not exists public.social_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('youtube','tiktok')),
  status text not null default 'connected' check (status in ('connected','checking','reconnect')),
  encrypted_tokens text not null,
  scopes text[] not null default '{}',
  accounts jsonb not null default '[]'::jsonb,
  selected_account_id text,
  connected_by uuid references auth.users(id) on delete set null,
  checked_at timestamptz,
  operation_id uuid,
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);
create table if not exists public.social_oauth_attempts (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('youtube','tiktok')),
  user_id uuid not null references auth.users(id) on delete cascade,
  state_hash text not null unique,
  shell text not null check (shell in ('client','admin')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  primary key (organization_id, provider)
);
create index if not exists social_oauth_attempts_expiry on public.social_oauth_attempts(expires_at);
alter table public.social_connections enable row level security;
alter table public.social_oauth_attempts enable row level security;
revoke all on public.social_connections, public.social_oauth_attempts from anon, authenticated;
grant all on public.social_connections, public.social_oauth_attempts to service_role;
comment on table public.social_connections is 'Server-only OAuth social; authorization and organization scope checked on every operation. Connection does not authorize publishing.';

-- Complete only the currently claimed attempt, atomically with credential persistence.
-- Disconnect/reconnect cancels older callbacks, including ones already exchanging codes.
create or replace function public.complete_social_oauth(
  p_organization_id uuid, p_user_id uuid, p_provider text, p_state_hash text,
  p_encrypted_tokens text, p_scopes text[], p_accounts jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.social_oauth_attempts
  where organization_id = p_organization_id and provider = p_provider and user_id = p_user_id
    and state_hash = p_state_hash and consumed_at is not null and expires_at > now();
  if not found then raise exception 'social_authorization_cancelled'; end if;
  if jsonb_typeof(p_accounts) <> 'array' or jsonb_array_length(p_accounts) = 0 then
    raise exception 'social_accounts_required';
  end if;
  insert into public.social_connections(organization_id, provider, status, encrypted_tokens, scopes, accounts, selected_account_id, connected_by, checked_at)
  values (p_organization_id, p_provider, 'connected', p_encrypted_tokens, p_scopes, p_accounts, null, p_user_id, now())
  on conflict (organization_id, provider) do update set
    status = 'connected', encrypted_tokens = excluded.encrypted_tokens, scopes = excluded.scopes,
    accounts = excluded.accounts, selected_account_id = null, connected_by = excluded.connected_by,
    checked_at = now(), updated_at = now(), operation_id = null;
end;
$$;
revoke all on function public.complete_social_oauth(uuid,uuid,text,text,text,text[],jsonb) from public, anon, authenticated;
grant execute on function public.complete_social_oauth(uuid,uuid,text,text,text,text[],jsonb) to service_role;
commit;
