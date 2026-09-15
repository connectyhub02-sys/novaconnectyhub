import pathlib,json,subprocess
R=pathlib.Path('/opt/connectyhub-managed-portal');assert json.loads((R/'owner.json').read_text())['kind']=='managed-portal-homolog-v1'
assert (R/'betel-preparation.json').exists()
units={
'connectyhub-managed-betel-source.service':f'''[Unit]
Description=Read-only Betel inventory to private portal
After=docker.service connectyhub-managed-portal.service
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 {R}/source/services/managed-portal/runtime/collect-betel.py
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
'connectyhub-managed-betel-source.timer':'''[Unit]
Description=Refresh read-only Betel snapshot every minute
[Timer]
OnBootSec=3min
OnUnitActiveSec=60s
Unit=connectyhub-managed-betel-source.service
[Install]
WantedBy=timers.target
'''}
for name,body in units.items():
 target=pathlib.Path('/etc/systemd/system')/name
 if target.exists():assert target.read_text()==body,'Unexpected unit'
 else:target.write_text(body)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','--now','connectyhub-managed-betel-source.timer'],check=True)
subprocess.run(['systemctl','start','connectyhub-managed-betel-source.service'],check=True)
print('source_collection_scheduled')
