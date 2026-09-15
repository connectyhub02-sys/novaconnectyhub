"""Portal-only rollback test. No production statements, data writes or customer sends."""
import json,pathlib,subprocess,uuid
ROOT=pathlib.Path('/opt/connectyhub-managed-portal')
owner=json.loads((ROOT/'initialized.json').read_text())['owner_id']
qa=json.loads((ROOT/'secrets/qa-access.json').read_text())
binding=json.loads((ROOT/'source-connection.json').read_text())
project=binding['project_id'];org=binding['source_organization_id'];client=qa['ua']
for value in [owner,project,org,client]:uuid.UUID(value)
def role(user):return f"set local role authenticated;select set_config('request.jwt.claims','{{\"sub\":\"{user}\",\"role\":\"authenticated\"}}',true);"
body=f"""begin;
update managed_projects set status='active' where id='{project}';
insert into organization_members(organization_id,user_id,role) values('{org}','{client}','member');
insert into managed_project_members(project_id,organization_id,user_id,role) values('{project}','{org}','{client}','operator');
{role(client)}
select 'client_source='||count(*) from portal_source_connections where project_id='{project}';
select 'client_project='||count(*) from managed_projects where id='{project}';
select 'client_write='||can_access_managed_project('{project}',true);
reset role;
{role(owner)}
select 'admin_source='||count(*) from portal_source_connections where project_id='{project}' and collection_status='ok' and snapshot->'organization'->>'id'='{org}';
select 'admin_project='||count(*) from managed_projects where id='{project}';
select 'admin_write='||can_access_managed_project('{project}',true);
rollback;
"""
p=subprocess.run(['docker','exec','-i','connectyhub-managed-portal-database-1','psql','-X','-qAt','-U','postgres','-d','managed_portal','-v','ON_ERROR_STOP=1'],input=body,text=True,capture_output=True,timeout=30)
assert p.returncode==0,'Portal isolation test failed'
expected=['client_source=0','client_project=0','client_write=false','admin_source=1','admin_project=1','admin_write=false']
for line in expected:assert line in p.stdout.splitlines(),line
print(json.dumps({'isolation_checks':len(expected),'explicit_client_operator_denied':True,'admin_source_read':True,'production_writes':False,'portal_fixture_rolled_back':True}))
