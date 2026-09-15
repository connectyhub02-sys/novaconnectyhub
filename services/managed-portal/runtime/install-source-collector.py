import pathlib,json,subprocess
R=pathlib.Path('/opt/connectyhub-managed-portal');assert json.loads((R/'owner.json').read_text())['kind']=='managed-portal-homolog-v1'
assert (R/'source-connection.json').exists()
units={
'connectyhub-managed-source.service':f'''[Unit]
Description=Read-only ConnectyHub inventory to private portal
After=docker.service connectyhub-managed-portal.service
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 {R}/source/services/managed-portal/runtime/collect-connectyhub.py
User=root
UMask=0077
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
MemoryMax=128M
CPUQuota=10%
TimeoutStartSec=60
''',
'connectyhub-managed-source.timer':'''[Unit]
Description=Refresh read-only ConnectyHub snapshot every minute
[Timer]
OnBootSec=3min
OnUnitActiveSec=60s
Unit=connectyhub-managed-source.service
[Install]
WantedBy=timers.target
'''}
for name,body in units.items():
 target=pathlib.Path('/etc/systemd/system')/name
 if target.exists():assert target.read_text()==body,'Unexpected unit'
 else:target.write_text(body)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','--now','connectyhub-managed-source.timer'],check=True)
subprocess.run(['systemctl','start','connectyhub-managed-source.service'],check=True)
print('source_collection_scheduled')
