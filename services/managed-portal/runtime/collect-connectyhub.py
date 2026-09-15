"""Fixed read-only production inventory; writes only a minimized portal snapshot."""
import json,pathlib,subprocess,uuid,importlib.util,datetime
ROOT=pathlib.Path('/opt/connectyhub-managed-portal')
RUNTIME=ROOT/'source/services/managed-portal/runtime'
SOURCE_ID='c5b8e371-b60d-4a17-94da-0a93e69a285d'

def query(container,database,body):
    result=subprocess.run(['docker','exec','-i',container,'psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],input=body,text=True,capture_output=True,timeout=30)
    if result.returncode:raise RuntimeError('Source query unavailable')
    return result.stdout.strip()

def portal(body):return query('connectyhub-managed-portal-database-1','managed_portal',body)

def main():
    assert json.loads((ROOT/'owner.json').read_text())['kind']=='managed-portal-homolog-v1'
    target=portal("select project_id from portal_source_connections where source_key='connectyhub-production';")
    uuid.UUID(target)
    try:
        payload=json.loads(query('supabase-db','postgres',(RUNTIME/'collect-connectyhub.sql').read_text()))
        org=payload.get('organization') or {}
        assert org.get('id')==SOURCE_ID and org.get('administrator_owner') and org.get('slug')=='connectyhub-platform-whatsapp'
        try:
            spec=importlib.util.spec_from_file_location('engine_collector',RUNTIME/'collect-inngest.py')
            engine=importlib.util.module_from_spec(spec);spec.loader.exec_module(engine)
            payload['inngest']=engine.collect()
        except Exception:
            previous=portal(f"select coalesce(snapshot->'inngest','{{}}'::jsonb) from portal_source_connections where project_id='{target}';")
            payload['inngest']={**json.loads(previous),'status':'failed','attempted_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        encoded=json.dumps(payload).replace("'","''")
        assert len(encoded.encode())<524288
        portal(f"update portal_source_connections set snapshot='{encoded}'::jsonb,collected_at=('{encoded}'::jsonb->>'collected_at')::timestamptz,attempted_at=now(),collection_status='ok' where project_id='{target}' and source_organization_id='{SOURCE_ID}';")
        print(json.dumps({'source':'connectyhub-production','collected':True,'read_only':True,'tables':payload['database']['table_count'],'scoped_usage_events_30d':payload['counts']['usage_events_30d']}))
    except Exception:
        portal(f"update portal_source_connections set attempted_at=now(),collection_status='failed' where project_id='{target}';")
        raise RuntimeError('Collection failed; previous snapshot preserved') from None

if __name__=='__main__':main()
