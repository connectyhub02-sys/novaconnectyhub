-- Allow account completion to support both person (CPF) and company (CNPJ) signups.

alter table public.profiles
  add column if not exists account_type text,
  add column if not exists document_type text;

update public.profiles
set account_type = 'person'
where account_type is null;

update public.profiles
set document_type = case
  when cpf_preview like '**.***.***/****-%' then 'cnpj'
  else 'cpf'
end
where cpf_hash is not null
  and document_type is null;

update public.profiles
set account_type = 'company'
where document_type = 'cnpj';

alter table public.profiles
  alter column account_type set default 'person',
  alter column account_type set not null;

do $do$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_account_type_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_account_type_check
      check (account_type in ('person', 'company'));
  end if;
end $do$;

do $do$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_document_type_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_document_type_check
      check (document_type is null or document_type in ('cpf', 'cnpj'));
  end if;
end $do$;

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
  raw_account_type text;
begin
  raw_phone := nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), '');
  normalized_phone := nullif(regexp_replace(coalesce(raw_phone, ''), '\D', '', 'g'), '');
  raw_account_type := lower(nullif(trim(coalesce(
    new.raw_user_meta_data->>'account_type',
    new.raw_user_meta_data->>'accountType',
    'person'
  )), ''));
  opt_in := case
    when lower(coalesce(new.raw_user_meta_data->>'trial_whatsapp_opt_in', '')) in ('true', '1', 'yes', 'sim')
      then true
    when lower(coalesce(new.raw_user_meta_data->>'trial_whatsapp_opt_in', '')) in ('false', '0', 'no', 'nao')
      then false
    else true
  end;

  if raw_account_type not in ('person', 'company') then
    raw_account_type := 'person';
  end if;

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
    account_type,
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
    raw_account_type,
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
    account_type = case
      when excluded.account_type = 'company' then 'company'
      else coalesce(public.profiles.account_type, excluded.account_type, 'person')
    end,
    trial_whatsapp_opt_in = coalesce(public.profiles.trial_whatsapp_opt_in, excluded.trial_whatsapp_opt_in),
    trial_whatsapp_opt_in_at = coalesce(public.profiles.trial_whatsapp_opt_in_at, excluded.trial_whatsapp_opt_in_at),
    trial_whatsapp_opt_in_source = coalesce(public.profiles.trial_whatsapp_opt_in_source, excluded.trial_whatsapp_opt_in_source),
    password_set_at = coalesce(public.profiles.password_set_at, excluded.password_set_at),
    updated_at = now();

  return new;
end;
$$;
