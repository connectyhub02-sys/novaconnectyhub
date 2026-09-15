-- Fixed SELECT allowlist. No browser input, identifiers or arbitrary SQL.
begin isolation level repeatable read read only;
set local statement_timeout='8s';
set local lock_timeout='1s';
with org as (
 select o.id,o.name,o.slug,o.plan_code,o.status,o.billing_organization_id,
        exists(select 1 from public.profiles p where p.id=o.owner_id and p.is_platform_admin) as administrator_owner
 from public.organizations o
 where o.id='c5b8e371-b60d-4a17-94da-0a93e69a285d' and o.slug='connectyhub-platform-whatsapp' and o.plan_code='internal'
), tables as (
 select schemaname as schema,relname as name,n_live_tup as estimated_rows,pg_total_relation_size(relid)::text as bytes
 from pg_stat_user_tables where schemaname in ('public','auth','storage') order by schemaname,relname limit 400
), consumption as (
 select u.currency,u.billing_mode,u.status,count(*) as events,
 sum(u.provider_cost)::text as recorded_provider_cost,
 count(*) filter(where u.provider_cost is null) as missing_cost_events,
 sum(u.connecty_charge_credits)::text as recorded_credits,
 sum(u.input_tokens)::text as input_tokens,sum(u.output_tokens)::text as output_tokens
 from public.usage_events u join org on org.id=u.organization_id
 where u.occurred_at>=now()-interval '30 days' group by u.currency,u.billing_mode,u.status
), files as (
 select id::text,'lead_files'::text as source,file_type as kind,mime_type,byte_size as bytes,created_at
 from public.lead_files where organization_id=(select id from org)
 union all
 select id::text,'studio_assets','studio',mime_type,size_bytes,created_at
 from public.studio_assets where organization_id=(select id from org)
), resources as (
 select id::text,'IA'::text as kind,name,status from public.ai_projects where organization_id=(select id from org)
 union all select id::text,'Voz',name,status from public.voice_projects where organization_id=(select id from org)
), agents as (
 select id,name,scope,status,sector_name,updated_at from public.agent_registry
 where organization_id=(select id from org) or (scope='platform' and organization_id is null)
 order by name limit 100
)
select jsonb_build_object(
 'version',1,'collected_at',now(),'organization',(select to_jsonb(org) from org),
 'database',jsonb_build_object('name',current_database(),'bytes',pg_database_size(current_database())::text,
   'table_count',(select count(*) from pg_stat_user_tables where schemaname in ('public','auth','storage')),
   'tables',coalesce((select jsonb_agg(tables) from tables),'[]'::jsonb)),
 'counts',jsonb_build_object(
   'members',(select count(*) from public.organization_members where organization_id=(select id from org)),
   'leads',(select count(*) from public.leads where organization_id=(select id from org)),
   'files',(select count(*) from files),
   'usage_events_30d',(select coalesce(sum(events),0) from consumption)),
 'wallet',(select jsonb_build_object('organization_id',w.organization_id,'balance_credits',w.balance_credits::text,'reserved_credits',w.reserved_credits::text,'updated_at',w.updated_at) from public.credit_wallets w where w.organization_id=(select id from org)),
 'consumption',coalesce((select jsonb_agg(consumption) from consumption),'[]'::jsonb),
 'files',coalesce((select jsonb_agg(f) from (select * from files order by created_at desc limit 50)f),'[]'::jsonb),
 'storage_accounting',(select jsonb_build_object('used_bytes',used_bytes::text,'billable_file_count',billable_file_count,'last_recalculated_at',last_recalculated_at) from public.organization_storage_usage where organization_id=(select id from org)),
 'buckets',coalesce((select jsonb_agg(b) from (select id,name,public from storage.buckets order by id limit 50)b),'[]'::jsonb),
 'resources',coalesce((select jsonb_agg(r) from (select * from resources limit 100)r),'[]'::jsonb),
 'agents',coalesce((select jsonb_agg(agents) from agents),'[]'::jsonb)
);
rollback;
