#!/usr/bin/env python3
"""Explicit disposable-host test; run as root on the VPS. Never selects customer projects."""
import http.client
import json
from pathlib import Path
import socket
import subprocess
import time
import uuid

PROJECT = 'hosting-smoke-20261013'
NAME = 'connectyhub-hosting-smoke-20261013'
VOLUME = NAME + '-data'
DIRECTORY = Path('/opt/' + NAME)
CONFIG = Path('/opt/connectyhub/hosting/projects.json')


def run(*args):
    return subprocess.check_output(args, stderr=subprocess.DEVNULL).decode().strip()


class Unix(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(15)
        self.sock.connect('/opt/connectyhub/hosting/socket/control.sock')


def call(body=None):
    c = Unix('localhost')
    c.request('POST' if body else 'GET', '/projects/' + PROJECT, body=json.dumps(body) if body else None,
              headers={'Content-Type': 'application/json'})
    r = c.getresponse()
    data = json.loads(r.read())
    c.close()
    assert r.status == 200, data
    return data


def operation(action):
    p = call()
    assert action in p['actions'], p
    result = call({'action': action, 'revision': p['revision'], 'requestId': str(uuid.uuid4()), 'actor': str(uuid.uuid4())})
    for _ in range(60):
        result = call()
        if result['operation']['status'] != 'running':
            break
        time.sleep(1)
    assert result['operation']['status'] == 'completed', result
    print(action, result['state'], flush=True)


def main():
    assert str(DIRECTORY) == '/opt/connectyhub-hosting-smoke-20261013'
    cfg = json.loads(CONFIG.read_text())
    assert PROJECT not in cfg and not DIRECTORY.exists()
    assert NAME not in run('docker', 'ps', '-a', '--format', '{{.Names}}').splitlines()
    assert VOLUME not in run('docker', 'volume', 'ls', '-q').splitlines()
    DIRECTORY.mkdir()
    (DIRECTORY / 'marker.txt').write_text('disposable hosting verification')
    run('docker', 'volume', 'create', VOLUME)
    run('docker', 'run', '-d', '--name', NAME, '--restart', 'always', '--cpus', '.1', '--memory', '32m',
        '--mount', 'type=volume,source=' + VOLUME + ',target=/testdata', 'node:22-alpine', 'sleep', 'infinity')
    run('docker', 'exec', NAME, 'sh', '-c', 'echo hosting-test > /testdata/marker')
    cfg[PROJECT] = {'compose': {}, 'standalone': {NAME: 'node:22-alpine'}, 'directories': [str(DIRECTORY)], 'volumes': [VOLUME], 'allowDelete': True}
    CONFIG.write_text(json.dumps(cfg))
    run('systemctl', 'restart', 'connectyhub-hosting.service')
    time.sleep(2)
    operation('pause')
    assert run('docker', 'inspect', '--format', '{{.State.Running}} {{.HostConfig.RestartPolicy.Name}}', NAME) == 'false no'
    assert DIRECTORY.exists()
    operation('resume')
    assert run('docker', 'exec', NAME, 'cat', '/testdata/marker') == 'hosting-test'
    assert run('docker', 'inspect', '--format', '{{.State.Running}} {{.HostConfig.RestartPolicy.Name}}', NAME) == 'true always'
    operation('quarantine')
    operation('delete')
    assert not DIRECTORY.exists()
    assert NAME not in run('docker', 'ps', '-a', '--format', '{{.Names}}').splitlines()
    assert VOLUME not in run('docker', 'volume', 'ls', '-q').splitlines()
    del cfg[PROJECT]
    CONFIG.write_text(json.dumps(cfg))
    run('systemctl', 'restart', 'connectyhub-hosting.service')
    print('Disposable lifecycle passed; customer projects unchanged.', flush=True)


if __name__ == '__main__':
    main()
