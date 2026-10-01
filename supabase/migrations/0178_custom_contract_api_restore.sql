-- Restore only billing-guard pauses, preserving manual suspensions and revocations.
create function public.restore_custom_contract_api_access(p_organization uuid) returns void
language plpgsql security definer set search_path=public as $$
declare api record; target_table text;
begin
  if not coalesce((public.resolve_organization_contract_access(p_organization)->>'allowed')::boolean,false) then return; end if;
  if not exists(select 1 from public.organization_subscriptions where organization_id=p_organization
    and status='active' and metadata#>>'{commercial_terms,features,connectyhub_api}'='true') then return; end if;
  for api in select id from public.connectyhub_api_clients where organization_id=p_organization
    and (status='active' or (status='paused'
      and metadata#>>'{connectyhub_api_access_guard,paused_by}'='connectyhub_api_access_guard'
      and metadata#>>'{connectyhub_api_access_guard,allowed}'='false')) for update
  loop
    update public.connectyhub_api_clients set status='active',metadata=coalesce(metadata,'{}')||jsonb_build_object(
      'connectyhub_api_access_guard',coalesce(metadata->'connectyhub_api_access_guard','{}')||
      jsonb_build_object('allowed',true,'reason','custom_contract_activation','status',null,'checked_at',now(),'restored_at',now()))
    where id=api.id and status='paused';
    foreach target_table in array array['connectyhub_api_keys','connectyhub_webhook_endpoints'] loop
      execute format('update public.%I set status=''active'',metadata=coalesce(metadata,''{}'')||jsonb_build_object(
        ''connectyhub_api_access_guard'',coalesce(metadata->''connectyhub_api_access_guard'',''{}'')||
        jsonb_build_object(''allowed'',true,''reason'',''custom_contract_activation'',''status'',null,''checked_at'',now(),''restored_at'',now()))
        where client_id=$1 and status=''paused''
        and metadata#>>''{connectyhub_api_access_guard,paused_by}''=''connectyhub_api_access_guard''
        and metadata#>>''{connectyhub_api_access_guard,allowed}''=''false''',target_table) using api.id;
    end loop;
  end loop;
end $$;
revoke all on function public.restore_custom_contract_api_access(uuid) from public,anon,authenticated;

create function public.restore_custom_contract_api_on_activation() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  perform public.restore_custom_contract_api_access(new.organization_id);
  return new;
end $$;
revoke all on function public.restore_custom_contract_api_on_activation() from public,anon,authenticated;
create trigger restore_custom_contract_api_on_activation after insert on public.custom_contract_activations
for each row execute function public.restore_custom_contract_api_on_activation();

do $$ declare target record; begin
  for target in select distinct organization_id from public.custom_contract_activations loop
    perform public.restore_custom_contract_api_access(target.organization_id);
  end loop;
end $$;
