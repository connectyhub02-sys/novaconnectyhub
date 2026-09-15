"""One fixed production link, verified by source identity; no production mutation."""
import importlib.util,json,pathlib,uuid
ROOT=pathlib.Path('/opt/connectyhub-managed-portal');RUNTIME=ROOT/'source/services/managed-portal/runtime'
spec=importlib.util.spec_from_file_location('collector',RUNTIME/'collect-connectyhub.py')
collector=importlib.util.module_from_spec(spec);spec.loader.exec_module(collector)
assert json.loads((ROOT/'owner.json').read_text())['kind']=='managed-portal-homolog-v1'
data=json.loads(collector.query('supabase-db','postgres',(RUNTIME/'collect-connectyhub.sql').read_text()))
org=data['organization'];assert org and org['id']==collector.SOURCE_ID and org['administrator_owner'] and org['plan_code']=='internal' and org['slug']=='connectyhub-platform-whatsapp'
existing=collector.portal("select project_id from portal_source_connections where source_key='connectyhub-production';")
if existing:
    uuid.UUID(existing)
    assert collector.portal(f"select source_organization_id from portal_source_connections where project_id='{existing}';")==collector.SOURCE_ID
    print('existing_connection_preserved')
else:
    project=str(uuid.uuid4())
    collector.portal(f"""begin;
    insert into organizations(id,name) values('{org['id']}','ConnectyHub Interno');
    insert into managed_projects(id,organization_id,name,slug,status,storage_limit_bytes) values('{project}','{org['id']}','ConnectyHub','connectyhub-producao','paused',0);
    insert into portal_source_connections(project_id,source_key,source_organization_id,source_name) values('{project}','connectyhub-production','{org['id']}','ConnectyHub Interno');
    commit;""")
    (ROOT/'source-connection.json').write_text(json.dumps({'project_id':project,'source_organization_id':org['id']}))
    print(json.dumps({'project_id':project,'source_read_only':True}))
collector.main()
