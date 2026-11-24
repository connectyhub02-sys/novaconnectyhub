-- First company only: service-role RPC, serialized per account, no public grant.
-- Existing companies/contracts and trial dates are never rewritten by this function.
create or replace function public.create_initial_client_company(p_user_id uuid, p_name text, p_automatic boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  profile public.profiles;
  company public.organizations;
  company_name text;
  kind text;
  trial_start timestamptz;
  trial_days integer;
  trial_plan uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('initial-company:' || p_user_id::text, 0));
  select * into profile from public.profiles where id=p_user_id for share;
  if profile.id is null or profile.is_platform_admin then raise exception 'CLIENT_ACCOUNT_REQUIRED'; end if;
  if profile.signup_completed_at is null or nullif(trim(profile.full_name),'') is null
    or profile.phone_verified_at is null or profile.cpf_hash is null then raise exception 'ACCOUNT_COMPLETION_REQUIRED'; end if;
  kind := coalesce(profile.account_type, case when profile.document_type='cnpj'
    or (profile.document_type is null and profile.cpf_preview like '%/%') then 'company' else 'person' end);
  if p_automatic and kind <> 'company' then return null; end if;
  company_name := regexp_replace(trim(case when p_automatic then profile.company_name else p_name end), '\s+', ' ', 'g');
  if company_name is null or length(company_name)<2 or length(company_name)>120 then raise exception 'COMPANY_NAME_REQUIRED'; end if;

  select o.* into company from public.organization_members m join public.organizations o on o.id=m.organization_id
    where m.user_id=p_user_id order by m.created_at,m.id limit 1;
  if company.id is not null then return to_jsonb(company); end if;
  select * into company from public.organizations where owner_id=p_user_id order by created_at,id limit 1 for update;
  if company.id is not null then
    if company.plan_code='internal' or company.status in ('archived','blocked','cancelled','canceled') then
      raise exception 'EXISTING_ACCOUNT_REQUIRES_SUPPORT';
    end if;
    insert into public.organization_members(organization_id,user_id,role) values(company.id,p_user_id,'owner') on conflict do nothing;
    return to_jsonb(company);
  end if;

  trial_start := profile.signup_completed_at;
  select p.id,greatest(coalesce(p.trial_days,7),1) into trial_plan,trial_days from public.billing_plans p
    where p.plan_code='trial' and p.status in ('active','draft') limit 1;
  if trial_days is null then raise exception 'TRIAL_CONFIGURATION_UNAVAILABLE'; end if;
  insert into public.organizations(name,slug,owner_id,plan_code,status,metadata)
    values(company_name,'empresa-cliente-' || gen_random_uuid()::text,p_user_id,'trial',
      case when trial_start + make_interval(days=>trial_days)>now() then 'trial' else 'trial_expired' end,
      jsonb_build_object('initial_company_trial_start',trial_start)) returning * into company;
  insert into public.organization_members(organization_id,user_id,role) values(company.id,p_user_id,'owner');
  -- Creating a company later does not restart the signup's trial or grant expired credit.
  if company.status='trial' then
    perform public.grant_connectyhub_trial_credits(company.id,p_user_id,trial_start,'trial:' || company.id::text);
  else
    -- The access resolver uses cycle_end (otherwise it falls back to company.created_at).
    insert into public.billing_cycles(organization_id,plan_id,cycle_start,cycle_end,included_credits,status,metadata)
      values(company.id,trial_plan,trial_start,trial_start+make_interval(days=>trial_days),0,'closed',
        jsonb_build_object('source','initial_company_expired','plan_code','trial'));
  end if;
  return to_jsonb(company);
end $$;
revoke all on function public.create_initial_client_company(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.create_initial_client_company(uuid,text,boolean) to service_role;
