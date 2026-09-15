import json,pathlib,subprocess
R=pathlib.Path('/opt/connectyhub-managed-portal');assert json.loads((R/'owner.json').read_text())['kind']=='managed-portal-homolog-v1' and (R/'initialized.json').exists()
C=R/'source/services/managed-portal/runtime/compose.yml';B=R/'source/services/managed-portal/runtime'
units={
'connectyhub-managed-portal.service':f'''[Unit]
Description=ConnectyHub persistent isolated homologation portal
Requires=docker.service
After=docker.service network-online.target
RequiresMountsFor={R}/data
[Service]
Type=simple
ExecStart=/usr/bin/docker compose -f {C} up --abort-on-container-failure
ExecStop=/usr/bin/docker compose -f {C} stop
Restart=always
RestartSec=10
TimeoutStopSec=90
[Install]
WantedBy=multi-user.target
''',
'connectyhub-managed-portal-telemetry.service':f'''[Unit]
Description=Read-only host telemetry for private homologation
After=connectyhub-managed-portal.service
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 {B}/telemetry.py
User=root
UMask=0077
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
MemoryMax=128M
CPUQuota=10%
''',
'connectyhub-managed-portal-telemetry.timer':'''[Unit]
Description=Collect private homologation telemetry every minute
[Timer]
OnBootSec=2min
OnUnitActiveSec=60s
Unit=connectyhub-managed-portal-telemetry.service
[Install]
WantedBy=timers.target
''',
'connectyhub-managed-portal-backup.service':f'''[Unit]
Description=Consistent isolated homologation backup
[Service]
Type=oneshot
ExecStart=/usr/bin/flock -n /run/connectyhub-managed-portal-backup.lock /usr/bin/python3 {B}/backup.py
User=root
UMask=0077
Nice=10
IOSchedulingClass=idle
MemoryMax=512M
CPUQuota=25%
TimeoutStartSec=15min
''',
'connectyhub-managed-portal-backup.timer':'''[Unit]
Description=Daily private homologation backup (05:30 UTC)
[Timer]
OnCalendar=*-*-* 05:30:00 UTC
Persistent=true
Unit=connectyhub-managed-portal-backup.service
[Install]
WantedBy=timers.target
'''}
for name,body in units.items():
    target=pathlib.Path('/etc/systemd/system')/name
    if target.exists():assert target.read_text()==body,'Unexpected existing unit'
    else:target.write_text(body)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','--now','connectyhub-managed-portal.service','connectyhub-managed-portal-telemetry.timer','connectyhub-managed-portal-backup.timer'],check=True)
print(json.dumps({'installed_units':list(units),'database':'managed_portal','backup_time':'05:30 UTC'}))
