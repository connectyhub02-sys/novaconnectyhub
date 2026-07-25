-- Account completion, CPF storage and WhatsApp verification.
-- Keeps OAuth signups in onboarding until the required commercial data is confirmed.

alter table public.profiles
  add column if not exists phone_normalized text,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists phone_verification_required boolean not null default true,
  add column if not exists phone_whatsapp_exists boolean,
  add column if not exists phone_whatsapp_checked_at timestamptz,
  add column if not exists cpf_encrypted text,
  add column if not exists cpf_hash text,
  add column if not exists cpf_preview text,
  add column if not exists cpf_verified_at timestamptz,
  add column if not exists signup_completed_at timestamptz,
  add column if not exists signup_completion_source text,
  add column if not exists password_set_at timestamptz;

create unique index if not exists idx_profiles_cpf_hash_unique
  on public.profiles (cpf_hash)
  where cpf_hash is not null;

create unique index if not exists idx_profiles_phone_verified_unique
  on public.profiles (phone_normalized)
  where phone_normalized is not null and phone_verified_at is not null;

update public.profiles
set phone_normalized = case
  when length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) in (10, 11)
    and left(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 2) <> '55'
    then '55' || regexp_replace(coalesce(phone, ''), '\D', '', 'g')
  else nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')
end
where phone is not null
  and phone_normalized is null;

create table if not exists public.account_phone_verification_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone text not null,
  phone_normalized text not null,
  code_hash text not null,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'expired', 'failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  expires_at timestamptz not null,
  sent_at timestamptz,
  verified_at timestamptz,
  provider_message_id text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_account_phone_codes_user_pending
  on public.account_phone_verification_codes (user_id, status, expires_at desc);

create index if not exists idx_account_phone_codes_phone
  on public.account_phone_verification_codes (phone_normalized, created_at desc);

drop trigger if exists touch_account_phone_verification_codes_updated_at
  on public.account_phone_verification_codes;

create trigger touch_account_phone_verification_codes_updated_at
  before update on public.account_phone_verification_codes
  for each row execute function public.touch_updated_at();

alter table public.account_phone_verification_codes enable row level security;

drop policy if exists "phone verification visible to owner" on public.account_phone_verification_codes;
create policy "phone verification visible to owner"
  on public.account_phone_verification_codes for select
  using (auth.uid() = user_id);

drop policy if exists "phone verification managed by owner" on public.account_phone_verification_codes;
create policy "phone verification managed by owner"
  on public.account_phone_verification_codes for insert
  with check (auth.uid() = user_id);

drop policy if exists "phone verification updated by owner" on public.account_phone_verification_codes;
create policy "phone verification updated by owner"
  on public.account_phone_verification_codes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "phone verification visible to platform admins" on public.account_phone_verification_codes;
create policy "phone verification visible to platform admins"
  on public.account_phone_verification_codes for select
  using (public.is_platform_admin());

drop policy if exists "phone verification managed by platform admins" on public.account_phone_verification_codes;
create policy "phone verification managed by platform admins"
  on public.account_phone_verification_codes for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_phone text;
  normalized_phone text;
  opt_in boolean;
begin
  raw_phone := nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), '');
  normalized_phone := nullif(regexp_replace(coalesce(raw_phone, ''), '\D', '', 'g'), '');
  opt_in := case
    when lower(coalesce(new.raw_user_meta_data->>'trial_whatsapp_opt_in', '')) in ('true', '1', 'yes', 'sim')
      then true
    when lower(coalesce(new.raw_user_meta_data->>'trial_whatsapp_opt_in', '')) in ('false', '0', 'no', 'nao')
      then false
    else true
  end;

  if normalized_phone is not null
    and length(normalized_phone) in (10, 11)
    and left(normalized_phone, 2) <> '55' then
    normalized_phone := '55' || normalized_phone;
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    phone,
    phone_normalized,
    company_name,
    trial_whatsapp_opt_in,
    trial_whatsapp_opt_in_at,
    trial_whatsapp_opt_in_source,
    password_set_at
  )
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    raw_phone,
    normalized_phone,
    nullif(trim(coalesce(new.raw_user_meta_data->>'company_name', '')), ''),
    opt_in,
    case
      when new.raw_user_meta_data ? 'trial_whatsapp_opt_in_at'
        then nullif(new.raw_user_meta_data->>'trial_whatsapp_opt_in_at', '')::timestamptz
      else null
    end,
    nullif(trim(coalesce(new.raw_user_meta_data->>'trial_whatsapp_opt_in_source', '')), ''),
    case
      when new.raw_user_meta_data ? 'password_set_at'
        then nullif(new.raw_user_meta_data->>'password_set_at', '')::timestamptz
      else null
    end
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    phone = coalesce(public.profiles.phone, excluded.phone),
    phone_normalized = coalesce(public.profiles.phone_normalized, excluded.phone_normalized),
    company_name = coalesce(public.profiles.company_name, excluded.company_name),
    trial_whatsapp_opt_in = coalesce(public.profiles.trial_whatsapp_opt_in, excluded.trial_whatsapp_opt_in),
    trial_whatsapp_opt_in_at = coalesce(public.profiles.trial_whatsapp_opt_in_at, excluded.trial_whatsapp_opt_in_at),
    trial_whatsapp_opt_in_source = coalesce(public.profiles.trial_whatsapp_opt_in_source, excluded.trial_whatsapp_opt_in_source),
    password_set_at = coalesce(public.profiles.password_set_at, excluded.password_set_at),
    updated_at = now();

  return new;
end;
$$;

grant select, insert, update on public.account_phone_verification_codes to authenticated;
grant all on public.account_phone_verification_codes to service_role;
