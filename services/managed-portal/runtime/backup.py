"""Private daily backup of homologation only. Stops this portal during consistent export."""
import hashlib,json,os,pathlib,subprocess,tarfile,time,importlib.util,io
R=pathlib.Path('/opt/connectyhub-managed-portal');C=R/'source/services/managed-portal/runtime/compose.yml'
assert os.getuid()==0 and json.loads((R/'owner.json').read_text())['kind']=='managed-portal-homolog-v1'
out=R/'backups';out.mkdir(mode=0o700,exist_ok=True);stamp=time.strftime('%Y%m%dT%H%M%SZ',time.gmtime());folder=out/stamp;folder.mkdir(mode=0o700)
def run(*args,**kwargs):return subprocess.run(args,check=True,capture_output=True,**kwargs)
def compose(*args):return run('docker','compose','-f',str(C),*args)
active=run('systemctl','is-active','connectyhub-managed-portal.service').stdout.strip()==b'active'
try:
    run('systemctl','stop','connectyhub-managed-portal.service')
    compose('up','-d','database')
    for attempt in range(30):
        try:compose('exec','-T','database','pg_isready','-h','127.0.0.1','-U','postgres','-d','managed_portal');break
        except subprocess.CalledProcessError:time.sleep(1)
    with (folder/'database.dump').open('xb') as target:
        subprocess.run(['docker','compose','-f',str(C),'exec','-T','database','pg_dump','-U','postgres','-d','managed_portal','-Fc'],stdout=target,stderr=subprocess.PIPE,check=True,timeout=300)
    with tarfile.open(folder/'private-files.tar.gz','w:gz') as archive:
        archive.add(R/'data/objects',arcname='objects');archive.add(R/'secrets',arcname='secrets');archive.add(C,arcname='compose.yml')
    # Selected production files remain in their existing stores. Preserve a bounded recovery copy.
    source_files=[]
    binding=R/'source-connection.json'
    if binding.exists():
        spec=importlib.util.spec_from_file_location('file_backup_reader',R/'source/services/managed-portal/runtime/connected-files.py')
        reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
        result=compose('exec','-T','database','psql','-X','-qAt','-U','postgres','-d','managed_portal','-c',"select coalesce(snapshot->'files','[]'::jsonb) from portal_source_connections where source_key='connectyhub-production';")
        selected=json.loads(result.stdout);total=0
        with tarfile.open(folder/'connected-files.tar.gz','w:gz') as archive:
            for f in selected:
                if f.get('source')!='lead_files' or f.get('availability')!='registered':continue
                data,size=reader.read_file(f['id']);total+=size
                if total>50_000_000:raise RuntimeError('Selected file backup exceeds 50 MB; choose a larger backup destination')
                entry=tarfile.TarInfo(f['id']+'.bin');entry.size=size;entry.mode=0o600;archive.addfile(entry,io.BytesIO(data))
                source_files.append({'id':f['id'],'bytes':size,'sha256':hashlib.sha256(data).hexdigest()})
        (folder/'connected-files-manifest.json').write_text(json.dumps({'selected_files':source_files,'complete_selected_set':len(source_files)==len(selected),'scope':'selected lead_files only, not all production storage'}))
    manifest={p.name:{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size} for p in folder.iterdir()}
    (folder/'manifest.json').write_text(json.dumps(manifest,indent=2))
    for p in folder.iterdir():p.chmod(0o600)
finally:
    compose('stop','database')
    if active:run('systemctl','start','connectyhub-managed-portal.service')
# Do not silently prune; retention review is an operator action until off-host export is confirmed.
print(json.dumps({'backup':str(folder),'consistent_export':True,'off_host':False,'retention':'manual; review storage weekly'}))
