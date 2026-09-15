"""Register the verified Betel customer in preparation; no production activation."""
import importlib.util
import json
import pathlib
import uuid

ROOT = pathlib.Path('/opt/connectyhub-managed-portal')
ORG = '66cb4c5a-35f2-4c08-9982-38bd72d2b9be'
VOICE = 'db9ec5c3-458b-451e-aad3-d42f0a6bbc34'
spec = importlib.util.spec_from_file_location('collector', ROOT / 'source/services/managed-portal/runtime/collect-connectyhub.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)
assert json.loads((ROOT / 'owner.json').read_text())['kind'] == 'managed-portal-homolog-v1'
identity = collector.query('supabase-db', 'postgres', f"""
begin read only;
select count(*) from public.organizations o join public.voice_projects p on p.organization_id=o.id
where o.id='{ORG}' and o.slug='betel-leiloes-mqy3l6sn' and p.id='{VOICE}' and p.name='Betel Voz';
rollback;
""")
assert identity == '1', 'Canonical customer identity not confirmed'
existing = collector.portal("select id from managed_projects where slug='betel-leiloes';")
if existing:
    uuid.UUID(existing)
    assert collector.portal(f"select organization_id from managed_projects where id='{existing}';") == ORG
    print(json.dumps({'project_id': existing, 'existing_preserved': True}))
else:
    project = str(uuid.uuid4())
    collector.portal(f"""
begin;
select pg_advisory_xact_lock(hashtext('portal-betel-preparation'));
insert into organizations(id,name) values('{ORG}','Betel Leiloes') on conflict(id) do nothing;
insert into managed_projects(id,organization_id,name,slug,status,storage_limit_bytes)
values('{project}','{ORG}','Betel Leilões','betel-leiloes','draft',0);
commit;
""")
    (ROOT / 'betel-preparation.json').write_text(json.dumps({
        'project_id': project, 'organization_id': ORG, 'source_voice_project_id': VOICE,
        'state': 'preparation', 'production_connected': False,
        'customer_access_granted': False, 'consumption_connected': False,
    }))
    print(json.dumps({'project_id': project, 'organization_id': ORG, 'state': 'draft', 'production_connected': False}))
