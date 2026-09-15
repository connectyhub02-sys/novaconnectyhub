"""Two fixed read-only sources: Betel staging catalog and its own CH usage only."""
import importlib.util,json,pathlib,sqlite3
ROOT=pathlib.Path('/opt/connectyhub-managed-portal')
RUNTIME=ROOT/'source/services/managed-portal/runtime'
ORG='66cb4c5a-35f2-4c08-9982-38bd72d2b9be'
PROJECT='9349f704-bdaa-41f1-957f-23f3317ba969'
spec=importlib.util.spec_from_file_location('collector',RUNTIME/'collect-connectyhub.py')
collector=importlib.util.module_from_spec(spec);spec.loader.exec_module(collector)
assert json.loads((ROOT/'owner.json').read_text())['kind']=='managed-portal-homolog-v1'
assert collector.portal(f"select source_organization_id from portal_source_connections where project_id='{PROJECT}' and source_key='betel-production';")==ORG
try:
    catalog=json.loads(collector.query('betel-isolated-rehearsal-database-1','postgres',"""
begin isolation level repeatable read read only;
set local statement_timeout='8s';
with tables as (
 select schemaname as schema,relname as name,n_live_tup as estimated_rows,pg_total_relation_size(relid)::text as bytes
 from pg_stat_user_tables where schemaname in ('public','auth','storage') order by schemaname,relname limit 400
)
select jsonb_build_object('collected_at',now(),'database',jsonb_build_object('name',current_database(),
 'bytes',pg_database_size(current_database())::text,'table_count',(select count(*) from tables),
 'tables',coalesce((select jsonb_agg(tables) from tables),'[]'::jsonb)));
rollback;
"""))
    financial=json.loads(collector.query('supabase-db','postgres',f"""
begin isolation level repeatable read read only;
set local statement_timeout='8s';
with org as (select id,name,slug,billing_organization_id from organizations where id='{ORG}' and slug='betel-leiloes-mqy3l6sn'),
consumption as (select u.currency,u.billing_mode,u.status,count(*) as events,sum(u.provider_cost)::text as recorded_provider_cost,
count(*) filter(where u.provider_cost is null) as missing_cost_events,sum(u.connecty_charge_credits)::text as recorded_credits,
sum(u.input_tokens)::text as input_tokens,sum(u.output_tokens)::text as output_tokens
from usage_events u join org on org.id=u.organization_id where occurred_at>=now()-interval '30 days' group by u.currency,u.billing_mode,u.status),
resources as (select id::text,'IA'::text as kind,name,status from ai_projects where organization_id='{ORG}'
union all select id::text,'Voz',name,status from voice_projects where organization_id='{ORG}')
select jsonb_build_object('organization',(select to_jsonb(org) from org),
'consumption',coalesce((select jsonb_agg(consumption) from consumption),'[]'::jsonb),
'counts',jsonb_build_object('usage_events_30d',(select coalesce(sum(events),0) from consumption)),
'wallet',(select jsonb_build_object('organization_id',w.organization_id,'balance_credits',w.balance_credits::text,'reserved_credits',w.reserved_credits::text,'updated_at',w.updated_at) from credit_wallets w where w.organization_id='{ORG}'),
'resources',coalesce((select jsonb_agg(resources) from resources),'[]'::jsonb));
rollback;
"""))
    assert financial['organization']['id']==ORG and financial['organization']['billing_organization_id'] is None
    data={'version':1,**catalog,**financial,'files':[],'buckets':[],'agents':[],'storage_accounting':None}
    spec=importlib.util.spec_from_file_location('betel_engine',RUNTIME/'collect-betel-inngest.py');engine=importlib.util.module_from_spec(spec);spec.loader.exec_module(engine)
    data['inngest']=engine.collect()
    private=pathlib.Path('/opt/betel-isolated-rehearsal/secrets')
    broker=json.loads((private/'production-broker.json').read_text())
    app=json.loads((private/'app-production-runtime.json').read_text())
    inbox=json.loads(pathlib.Path('/opt/betel-webhook-inbox/secrets/config.json').read_text())
    db=sqlite3.connect('file:/var/lib/betel-webhook-inbox/inbox.sqlite?mode=ro',uri=True)
    try: held=db.execute("select count(*) from events where state='held'").fetchone()[0]
    finally: db.close()
    data['operation']={'broker_live':broker.get('live') is True,
        'automations_paused':app.get('BETEL_AUTOMATIONS_PAUSED')!='0',
        'webhooks_forward_new':inbox.get('forward_new') is True,
        'active_from':broker.get('activeFrom',0),'historical_inbox_held':held,
        'scraper_paused':app.get('BETEL_SCRAPER_PAUSED')=='1',
        'analysis_delivery_paused':app.get('BETEL_ANALYSIS_DELIVERY_PAUSED')=='1'}
    encoded=json.dumps(data).replace("'","''");assert len(encoded.encode())<524288
    collector.portal(f"update portal_source_connections set snapshot='{encoded}'::jsonb,collected_at=('{encoded}'::jsonb->>'collected_at')::timestamptz,attempted_at=now(),collection_status='ok' where project_id='{PROJECT}' and source_key='betel-production';")
    print(json.dumps({'project_id':PROJECT,'migration_state':collector.portal(f"select migration_state from portal_source_connections where project_id='{PROJECT}';"),'tables':catalog['database']['table_count'],'scoped_usage_events_30d':financial['counts']['usage_events_30d'],'writes_to_source':False}))
except Exception:
    collector.portal(f"update portal_source_connections set collection_status='failed',attempted_at=now() where project_id='{PROJECT}';")
    raise RuntimeError('Betel collection failed; previous snapshot preserved') from None
