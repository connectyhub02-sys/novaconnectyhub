begin;

-- Keep the user's original media/drafts and delivery outcome, not provider data
-- after disconnect. A tombstone prevents late workers or manual retries from
-- restoring erased identifiers or upload sessions.
alter table public.social_deliveries add column api_data_deleted_at timestamptz;
alter table public.social_deliveries add constraint social_erased_data_stays_erased check (
 api_data_deleted_at is null or (
  account_id = '' and connection_id is null and progress = '{}'::jsonb
  and provider_id is null and result_url is null and error_message is null
  and status not in ('queued','processing') and lease_id is null and lease_until is null
 )
);

create function public.erase_social_provider_data(p_org uuid, p_provider text, p_before timestamptz default null)
returns integer language plpgsql security definer set search_path=public as $$
declare erased integer;
begin
 if p_provider not in ('youtube','tiktok') then raise exception 'Invalid provider'; end if;
 update public.social_deliveries set
  status=case when status='queued' and attempts=0 then 'cancelled'
              when status in ('queued','processing') then 'uncertain' else status end,
  account_id='',connection_id=null,progress='{}',provider_id=null,result_url=null,
  error_message=null,lease_id=null,lease_until=null,api_data_deleted_at=now(),updated_at=now()
 where organization_id=p_org and target=p_provider and api_data_deleted_at is null
 and (p_before is null or created_at < p_before);
 get diagnostics erased = row_count;
 if p_provider='tiktok' and p_before is null then
  update public.social_posts set draft=draft #- '{tiktok,accountId}',updated_at=now()
  where organization_id=p_org and draft #> '{tiktok,accountId}' is not null;
 end if;
 return erased;
end $$;

create function public.social_connection_deleted()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform public.erase_social_provider_data(old.organization_id,old.provider);
 delete from public.social_oauth_attempts where organization_id=old.organization_id and provider=old.provider;
 return old;
end $$;
create trigger social_connection_data_cleanup before delete on public.social_connections
for each row execute function public.social_connection_deleted();

-- Serialize approval with disconnect. A connection that disappears between
-- review and queue insertion must not leave a newly authorized delivery behind.
create function public.social_delivery_connection_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.target in ('youtube','tiktok') then
  perform 1 from public.social_connections where id=new.connection_id
   and organization_id=new.organization_id and provider=new.target
   and status='connected' and selected_account_id=new.account_id for update;
  if not found then raise exception 'Social connection changed; review again'; end if;
 end if;
 return new;
end $$;
create trigger social_delivery_requires_connection before insert on public.social_deliveries
for each row execute function public.social_delivery_connection_guard();

create function public.expire_social_api_data()
returns jsonb language plpgsql security definer set search_path=public as $$
declare item record; connections integer; deliveries integer:=0;
begin
 -- Six days without successful revalidation: remove authorization and its data.
 delete from public.social_connections
 where coalesce(checked_at,updated_at) < now()-interval '6 days';
 get diagnostics connections = row_count;
 -- A 29-day ceiling leaves a margin before the provider's 30-day requirement.
 for item in select distinct organization_id,target from public.social_deliveries
  where target in ('youtube','tiktok') and api_data_deleted_at is null
   and created_at < now()-interval '29 days'
 loop
  deliveries:=deliveries+public.erase_social_provider_data(item.organization_id,item.target,now()-interval '29 days');
 end loop;
 -- Draft account bindings are API data too; the editor fetches a fresh binding.
 update public.social_posts set draft=draft #- '{tiktok,accountId}'
 where draft #> '{tiktok,accountId}' is not null and updated_at < now()-interval '29 days';
 delete from public.social_oauth_attempts where expires_at < now();
 return jsonb_build_object('connectionsRemoved',connections,'deliveriesCleared',deliveries);
end $$;

revoke all on function public.erase_social_provider_data(uuid,text,timestamptz),public.social_connection_deleted(),public.social_delivery_connection_guard(),public.expire_social_api_data() from public,anon,authenticated;
grant execute on function public.erase_social_provider_data(uuid,text,timestamptz),public.expire_social_api_data() to service_role;
commit;
