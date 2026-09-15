"""Publish host metrics only to the private homologation receiver."""
import importlib.util,pathlib,json,urllib.request
R=pathlib.Path('/opt/connectyhub-managed-portal');p=R/'source/services/managed-worker/collect-host.py'
spec=importlib.util.spec_from_file_location('collector',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
key=(R/'secrets/telemetry-key').read_text().strip()
request=urllib.request.Request('http://127.0.0.1:3128/api/managed-telemetry',data=json.dumps(m.collect()).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
with urllib.request.urlopen(request,timeout=15) as response:assert response.status==200
print('telemetry_persisted')
