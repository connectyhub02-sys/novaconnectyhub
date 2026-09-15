"""Restore the portal dump into an ephemeral networkless PostgreSQL, never into live data."""
import base64,hashlib,json,pathlib,subprocess,tarfile,time,uuid
R=pathlib.Path('/opt/connectyhub-managed-portal');assert json.loads((R/'owner.json').read_text())['kind']=='managed-portal-homolog-v1'
backup=sorted((R/'backups').iterdir())[-1];assert backup.is_dir() and not backup.is_symlink()
manifest=json.loads((backup/'manifest.json').read_text());qa=json.loads((R/'secrets/qa-access.json').read_text())
for name,entry in manifest.items():assert pathlib.Path(name).name==name and hashlib.sha256((backup/name).read_bytes()).hexdigest()==entry['sha256']
expected=base64.b64decode(qa['content']);found=False
with tarfile.open(backup/'private-files.tar.gz') as archive:
    for member in archive:
        assert not member.name.startswith('/') and '..' not in pathlib.PurePosixPath(member.name).parts and not member.issym() and not member.islnk()
        if member.isfile() and member.name.startswith('objects/') and member.size==len(expected):
            if archive.extractfile(member).read()==expected:found=True
assert found,'QA object not recoverable'
connected_files_checked=0
if (backup/'connected-files-manifest.json').exists():
    selected=json.loads((backup/'connected-files-manifest.json').read_text())
    with tarfile.open(backup/'connected-files.tar.gz') as archive:
        for f in selected['selected_files']:
            uuid.UUID(f['id']);member=archive.getmember(f['id']+'.bin')
            assert member.isfile() and member.size==f['bytes'] and member.size<=20_000_000
            assert hashlib.sha256(archive.extractfile(member).read()).hexdigest()==f['sha256']
            connected_files_checked+=1
name='connectyhub-managed-portal-restore-'+uuid.uuid4().hex[:10]
def run(*args,**kwargs):return subprocess.run(args,check=True,capture_output=True,**kwargs)
container=None
try:
    container=run('docker','run','-d','--name',name,'--label','com.connectyhub.portal=restore-check','--network','none','--read-only','--user','70:70','--memory','512m','--memory-swap','512m','--cpus','0.5','--pids-limit','128','--cap-drop','ALL','--security-opt','no-new-privileges:true','--tmpfs','/var/lib/postgresql/data:size=512m,uid=70,gid=70,mode=0700','--tmpfs','/var/run/postgresql:size=8m,uid=70,gid=70','--tmpfs','/tmp:size=8m','-e','POSTGRES_DB=managed_portal','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17.11-alpine3.23@sha256:09f3fe6ab613dc2ba3f7584dcebdf4bb7acf98366169cd1805ebf9a65eab1041','postgres','-c','shared_buffers=32MB','-c','max_connections=20').stdout.decode().strip()
    for attempt in range(40):
        try:run('docker','exec',container,'pg_isready','-h','127.0.0.1','-U','postgres','-d','managed_portal');break
        except subprocess.CalledProcessError:time.sleep(1)
    roles=';'.join('create role '+role+' nologin' for role in ['anon','authenticated','service_role','authenticator','supabase_auth_admin'])+';'
    run('docker','exec','-i',container,'psql','-U','postgres','-d','managed_portal','-v','ON_ERROR_STOP=1',input=roles.encode())
    with (backup/'database.dump').open('rb') as source:subprocess.run(['docker','exec','-i',container,'pg_restore','-U','postgres','-d','managed_portal','--exit-on-error'],stdin=source,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True,timeout=120)
    for key in ['ua','record','pa','pb']:uuid.UUID(qa[key])
    query=f"select count(*) from managed_records where id='{qa['record']}';begin;set local role authenticated;select set_config('request.jwt.claims','{{\"sub\":\"{qa['ua']}\",\"role\":\"authenticated\"}}',true);select count(*) from managed_projects where id='{qa['pa']}';select count(*) from managed_projects where id='{qa['pb']}';rollback;"
    out=run('docker','exec','-i',container,'psql','-At','-U','postgres','-d','managed_portal','-v','ON_ERROR_STOP=1',input=query.encode()).stdout.decode().splitlines()
    assert out[0]=='1' and out[-3:-1]==['1','0'],out
    evidence={'backup':backup.name,'dump_restored':True,'private_object_restored':True,'rls_restored':True,'network':'none','production_database_touched':False}
    has_source=run('docker','exec',container,'psql','-At','-U','postgres','-d','managed_portal','-c',"select count(*) from information_schema.tables where table_schema='public' and table_name='portal_source_connections';").stdout.strip()==b'1'
    if has_source:
        owner=json.loads((R/'initialized.json').read_text())['owner_id'];uuid.UUID(owner)
        source_query=f"begin;set local role authenticated;select set_config('request.jwt.claims','{{\"sub\":\"{qa['ua']}\",\"role\":\"authenticated\"}}',true);select 'client='||count(*) from portal_source_connections;reset role;set local role authenticated;select set_config('request.jwt.claims','{{\"sub\":\"{owner}\",\"role\":\"authenticated\"}}',true);select 'admin='||count(*) from portal_source_connections where source_key='connectyhub-production' and snapshot is not null;rollback;"
        restored=run('docker','exec','-i',container,'psql','-At','-U','postgres','-d','managed_portal','-v','ON_ERROR_STOP=1',input=source_query.encode()).stdout.decode().splitlines()
        assert 'client=0' in restored and 'admin=1' in restored
        evidence['connected_source_and_admin_isolation_restored']=True
    evidence['connected_files_restored']=connected_files_checked
    (R/'backup-verification.json').write_text(json.dumps(evidence,indent=2));print(json.dumps(evidence))
finally:
    if container:
        assert run('docker','inspect','--format','{{index .Config.Labels "com.connectyhub.portal"}}',container).stdout.strip()==b'restore-check'
        run('docker','stop',container);run('docker','rm',container)
