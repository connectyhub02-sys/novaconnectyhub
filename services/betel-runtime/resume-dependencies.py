"""After publishing Betel app, resume its existing API siblings; never recreate its DB."""
import json,pathlib,subprocess,time,urllib.request

ROOT=pathlib.Path('/opt/betel-isolated-rehearsal')
assert json.loads((ROOT/'owner.json').read_text())['kind']=='betel-isolated-rehearsal-20260915'
def state(name):return json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]['State']
assert state('betel-isolated-rehearsal-database-1')['Running'],'Database must already be running'
names=['betel-isolated-rehearsal-'+service+'-1' for service in ['auth','rest','storage','gateway']]
resumed=[]
for name in names:
    current=state(name)
    if not current['Running']:
        assert not current['OOMKilled'],'Investigate resource exhaustion before resuming'
        subprocess.run(['docker','start',name],check=True,capture_output=True)
        resumed.append(name)
assert all(state(name)['Running'] for name in names)
key=json.loads((ROOT/'secrets/api.json').read_text())['NEXT_PUBLIC_SUPABASE_ANON_KEY']
for attempt in range(30):
    try:
        request=urllib.request.Request('http://172.21.0.2:28100/auth/v1/health',headers={'apikey':key})
        with urllib.request.urlopen(request,timeout=2) as response:assert response.status==200
        break
    except Exception:
        if attempt==29:raise RuntimeError('Betel API is not ready') from None
        time.sleep(1)
print(json.dumps({'resumed':resumed,'auth_health':200,'database_recreated':False}))
