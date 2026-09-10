create table public.automation_destination_discovery (
 whatsapp_instance_id uuid primary key references public.whatsapp_instances(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 attempted_at timestamptz not null default now()
);
alter table public.automation_destination_discovery enable row level security;
revoke all on public.automation_destination_discovery from anon,authenticated;
grant all on public.automation_destination_discovery to service_role;
create function public.claim_automation_destination_discovery(p_org uuid,p_instance uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare claimed uuid;
begin
 if not exists(select 1 from public.whatsapp_instances where id=p_instance and organization_id=p_org) then raise exception 'INSTANCE_SCOPE';end if;
 insert into public.automation_destination_discovery(organization_id,whatsapp_instance_id) values(p_org,p_instance)
 on conflict(whatsapp_instance_id) do update set attempted_at=now()
 where automation_destination_discovery.attempted_at<now()-interval '30 minutes'
 returning whatsapp_instance_id into claimed;
 return claimed is not null;
end $$;
revoke all on function public.claim_automation_destination_discovery(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_automation_destination_discovery(uuid,uuid) to service_role;
