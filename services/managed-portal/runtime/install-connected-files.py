"""Install only the private file gateway; no change to productive services."""
import json,pathlib,os,secrets,subprocess
R=pathlib.Path('/opt/connectyhub-managed-portal')
assert os.getuid()==0 and json.loads((R/'owner.json').read_text())['kind']=='managed-portal-homolog-v1'
key=R/'secrets/file-gateway-key'
if not key.exists():
    key.write_text(secrets.token_hex(32));os.chown(key,1000,1000);key.chmod(0o400)
unit='''[Unit]
Description=Private read-only ConnectyHub file gateway
After=docker.service
[Service]
ExecStart=/usr/bin/python3 /opt/connectyhub-managed-portal/source/services/managed-portal/runtime/connected-files.py
Restart=on-failure
User=root
UMask=0007
RuntimeDirectory=connectyhub-managed-files
RuntimeDirectoryMode=0755
RuntimeDirectoryPreserve=yes
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
MemoryMax=128M
CPUQuota=10%
ReadWritePaths=/run/connectyhub-managed-files
[Install]
WantedBy=multi-user.target
'''
p=pathlib.Path('/etc/systemd/system/connectyhub-managed-files.service')
if p.exists():assert p.read_text() in (unit,unit.replace('RuntimeDirectoryPreserve=yes\n','')),'Unexpected unit'
p.write_text(unit)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','--now','connectyhub-managed-files.service'],check=True)
print('private_file_gateway_ready')
