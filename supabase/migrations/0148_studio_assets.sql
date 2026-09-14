-- Private input media on the relay VPS; no provider call or credit debit.
create table public.studio_assets (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.voice_projects(id),
 organization_id uuid not null references public.organizations(id), billing_organization_id uuid not null references public.organizations(id),
 key_id uuid references public.voice_api_keys(id), display_name text not null check(length(display_name) between 1 and 100),
 size_bytes integer not null check(size_bytes between 1 and 20000000),
 mime_type text not null check(mime_type in ('audio/wav','audio/mpeg','audio/mp4','audio/aac','audio/ogg','audio/flac','audio/webm')),
 status text not null default 'pending' check(status in ('pending','processing','ready','deleting','deleted','failed')),
 ticket_hash text, ticket_purpose text check(ticket_purpose in ('upload','download','delete')), ticket_expires_at timestamptz,
 duration_seconds numeric(12,6) check(duration_seconds>0 and duration_seconds<=1800),
 sha256 text check(sha256 ~ '^[a-f0-9]{64}$'), capacity_released boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index studio_assets_project_date on public.studio_assets(project_id,created_at desc);
alter table public.studio_assets enable row level security;
revoke all on public.studio_assets from public,anon,authenticated;
grant all on public.studio_assets to service_role;

create function public.create_studio_asset(p_project uuid,p_key uuid,p_name text,p_size integer,p_mime text,p_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.voice_projects; a public.studio_assets; access jsonb; e record; u public.organization_storage_usage; expired uuid;
begin
 select * into p from public.voice_projects where id=p_project;
 if p.id is null or p.status<>'active' then raise exception 'voice_project_inactive'; end if;
 access:=public.resolve_organization_contract_access(p.organization_id);
 if not coalesce((access->>'allowed')::boolean,false) then raise exception 'voice_contract_inactive'; end if;
 if p_key is not null and not exists(select 1 from public.voice_api_keys where id=p_key and project_id=p.id and status='active' and (expires_at is null or expires_at>now())) then raise exception 'voice_key_inactive'; end if;
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'voice_ticket_invalid'; end if;
 -- Record the capacity immediately, including an upload that has not arrived.
 -- The row lock is shared with normal storage accounting.
 perform public.record_organization_storage_usage((access->>'billing_organization_id')::uuid,0,0,'other','{}');
 select * into u from public.organization_storage_usage where organization_id=(access->>'billing_organization_id')::uuid for update;
 for expired in select id from public.studio_assets where billing_organization_id=u.organization_id and status='pending' and ticket_expires_at<=now() loop
  perform public.finish_studio_asset(expired,'failed');
 end loop;
 select * into u from public.organization_storage_usage where organization_id=u.organization_id;
 select * into e from public.get_organization_storage_entitlement(p.organization_id);
 if e.total_storage_limit_bytes is null or e.total_storage_limit_bytes<=0 or p_size>e.storage_file_max_bytes
 or u.used_bytes+p_size>e.total_storage_limit_bytes
 or (e.total_storage_file_limit>0 and u.billable_file_count+1>e.total_storage_file_limit) then raise exception 'voice_storage_limit'; end if;
 if (select count(*) from public.studio_assets where billing_organization_id=u.organization_id and status in ('pending','processing'))>=2 then raise exception 'voice_upload_limit'; end if;
 insert into public.studio_assets(project_id,organization_id,billing_organization_id,key_id,display_name,size_bytes,mime_type,ticket_hash,ticket_purpose,ticket_expires_at)
 values(p.id,p.organization_id,u.organization_id,p_key,p_name,p_size,p_mime,p_hash,'upload',now()+interval '2 minutes') returning * into a;
 perform public.record_organization_storage_usage(u.organization_id,p_size,1,'other',jsonb_build_object('studio_asset_id',a.id,'reserved',true));
 return to_jsonb(a);
end $$;

create function public.consume_studio_asset_ticket(p_id uuid,p_hash text,p_purpose text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.studio_assets; access jsonb;
begin
 select * into a from public.studio_assets where id=p_id for update;
 if a.id is null or a.ticket_hash is null or p_hash is distinct from a.ticket_hash or p_purpose is distinct from a.ticket_purpose
 or a.ticket_expires_at is null or a.ticket_expires_at<=now() then raise exception 'voice_ticket_invalid'; end if;
 access:=public.resolve_organization_contract_access(a.organization_id);
 if not coalesce((access->>'allowed')::boolean,false) or (access->>'billing_organization_id')::uuid<>a.billing_organization_id then raise exception 'voice_contract_inactive'; end if;
 if not exists(select 1 from public.voice_projects where id=a.project_id and status='active')
 or (a.key_id is not null and not exists(select 1 from public.voice_api_keys where id=a.key_id and status='active' and (expires_at is null or expires_at>now()))) then raise exception 'voice_key_inactive'; end if;
 if (p_purpose='upload' and a.status<>'pending') or (p_purpose='download' and a.status<>'ready')
 or (p_purpose='delete' and a.status not in ('ready','pending','failed','deleting')) then raise exception 'voice_asset_state'; end if;
 update public.studio_assets set ticket_hash=null,ticket_expires_at=null,
 status=case p_purpose when 'upload' then 'processing' when 'delete' then 'deleting' else status end,updated_at=now() where id=a.id returning * into a;
 return to_jsonb(a);
end $$;

create function public.finish_studio_asset(p_id uuid,p_status text,p_duration numeric default null,p_sha256 text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.studio_assets;
begin
 -- Same lock order as creation/accounting: storage row, then receipt.
 select * into a from public.studio_assets where id=p_id;
 if a.id is null then raise exception 'voice_asset_not_found'; end if;
 perform 1 from public.organization_storage_usage where organization_id=a.billing_organization_id for update;
 select * into a from public.studio_assets where id=p_id for update;
 if a.status=p_status and (p_status<>'ready' or (a.sha256=p_sha256 and a.duration_seconds=p_duration)) then return to_jsonb(a); end if;
 if p_status='ready' then
  if a.status<>'processing' or p_duration is null or p_duration::text in ('NaN','Infinity','-Infinity') or p_duration<=0 or p_duration>1800 or p_sha256 is null or p_sha256!~'^[a-f0-9]{64}$' then raise exception 'voice_asset_state'; end if;
 elsif p_status='failed' and a.status in ('pending','processing') then
  if not a.capacity_released then perform public.release_organization_storage_usage(a.billing_organization_id,a.size_bytes,1,'other',jsonb_build_object('studio_asset_id',a.id)); end if;
 elsif p_status='deleted' and a.status='deleting' then
  if not a.capacity_released then perform public.release_organization_storage_usage(a.billing_organization_id,a.size_bytes,1,'other',jsonb_build_object('studio_asset_id',a.id)); end if;
 else raise exception 'voice_asset_state'; end if;
 update public.studio_assets set status=p_status,duration_seconds=case when p_status='ready' then p_duration else duration_seconds end,
 sha256=case when p_status='ready' then p_sha256 else sha256 end,capacity_released=p_status in ('deleted','failed'),ticket_hash=null,ticket_expires_at=null,updated_at=now() where id=a.id returning * into a;
 return to_jsonb(a);
end $$;
revoke all on function public.create_studio_asset(uuid,uuid,text,integer,text,text),public.consume_studio_asset_ticket(uuid,text,text),public.finish_studio_asset(uuid,text,numeric,text) from public,anon,authenticated;
grant execute on function public.create_studio_asset(uuid,uuid,text,integer,text,text),public.consume_studio_asset_ticket(uuid,text,text),public.finish_studio_asset(uuid,text,numeric,text) to service_role;
