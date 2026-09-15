-- Independent portal only. Betel remains a draft until cutover is verified.
begin;
do $$ begin if current_database()<>'managed_portal' then raise exception 'Wrong database'; end if; end $$;
alter table public.portal_source_connections drop constraint portal_source_connections_source_key_check;
alter table public.portal_source_connections add constraint portal_source_connections_source_key_check
 check(source_key in ('connectyhub-production','betel-production'));
alter table public.portal_source_connections add column migration_state text not null default 'operational'
 check(migration_state in ('preparing','operational'));
insert into public.portal_source_connections(project_id,source_key,source_organization_id,source_name,migration_state)
select id,'betel-production',organization_id,'Betel Leiloes','preparing'
from public.managed_projects where id='9349f704-bdaa-41f1-957f-23f3317ba969'
and organization_id='66cb4c5a-35f2-4c08-9982-38bd72d2b9be' and status='draft';
do $$ begin if not exists(select 1 from public.portal_source_connections where source_key='betel-production' and migration_state='preparing') then raise exception 'Missing verified Betel draft'; end if; end $$;
notify pgrst,'reload schema';
commit;
