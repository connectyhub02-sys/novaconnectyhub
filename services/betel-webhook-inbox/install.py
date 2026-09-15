"""Install only the Betel HOLD service; does not route public traffic or freeze origin."""
import json,pathlib,subprocess,sys
root=pathlib.Path('/opt/betel-webhook-inbox')
assert json.loads(pathlib.Path('/opt/betel-isolated-rehearsal/owner.json').read_text())['kind']=='betel-isolated-rehearsal-20260915'
assert not (root/'installed.json').exists(),'Already installed; preserve state and credentials'
secret=json.load(sys.stdin)['secret'];assert isinstance(secret,str) and len(secret)>=16
secrets=root/'secrets';secrets.mkdir(mode=0o700,exist_ok=True)
config=secrets/'config.json';assert not config.exists()
config.write_text(json.dumps({'host':'127.0.0.1','port':28112,'database':'/var/lib/betel-webhook-inbox/inbox.sqlite','secret':secret}));config.chmod(0o600)
unit='''[Unit]
Description=Betel authenticated durable webhook HOLD inbox
After=network.target
[Service]
Type=simple
DynamicUser=true
StateDirectory=betel-webhook-inbox
StateDirectoryMode=0700
LoadCredential=config.json:/opt/betel-webhook-inbox/secrets/config.json
Environment=INBOX_CONFIG=%d/config.json
ExecStart=/usr/bin/python3 /opt/betel-webhook-inbox/inbox.py
Restart=on-failure
RestartSec=3
UMask=0077
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictAddressFamilies=AF_UNIX AF_INET
IPAddressDeny=any
IPAddressAllow=localhost
MemoryMax=192M
CPUQuota=20%
TasksMax=32
[Install]
WantedBy=multi-user.target
'''
path=pathlib.Path('/etc/systemd/system/betel-webhook-inbox.service');assert not path.exists();path.write_text(unit)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','--now',path.name],check=True,capture_output=True)
(root/'installed.json').write_text(json.dumps({'kind':'betel-webhook-held-v1','forwarding':False,'business_calls':0}))
print('Betel inbox installed in HOLD; no origin changes')
