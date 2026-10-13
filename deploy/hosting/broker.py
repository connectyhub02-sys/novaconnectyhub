#!/usr/bin/env python3
"""Finite hosting operations over a private Unix socket. Never accepts commands or paths.

Root-reviewed configuration owns the inventory. Runtime state and receipts survive restarts.
No billing automation: every state transition originates from a confirmed admin request.
"""
import datetime
import hashlib
import http.server
import json
import os
from pathlib import Path
import re
import shutil
import socketserver
import subprocess
import threading
import time

ROOT = Path('/opt/connectyhub/hosting')
PUBLIC = Path('/opt/connectyhub/monitoring/public/hosting.json')
SOCKET = Path('/opt/connectyhub/hosting/socket/control.sock')
LOCK = threading.RLock()
PROJECTS = {}
EXCLUSIONS = ['Arquivos em serviços externos (como R2), domínios e DNS.',
              'Backups externos, cadastro do cliente, contratos e auditoria.',
              'Proxy compartilhado e imagens Docker que podem servir a outros projetos.']


class Rejected(Exception):
    pass


def docker(*args, timeout=90):
    return subprocess.check_output(['docker', *args], timeout=timeout, stderr=subprocess.DEVNULL).decode().strip()


def atomic(path, data, mode=0o600):
    temporary = path.with_suffix('.tmp')
    with temporary.open('w') as f:
        json.dump(data, f, separators=(',', ':'))
        f.flush()
        os.fsync(f.fileno())
    temporary.chmod(mode)
    temporary.replace(path)
    fd = os.open(path.parent, os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def state(project):
    path = ROOT / 'state' / (project + '.json')
    return json.loads(path.read_text()) if path.exists() else {'state': 'active', 'saved': {}, 'receipts': {}}


def save(project, value):
    atomic(ROOT / 'state' / (project + '.json'), value)


def config(project):
    if project not in PROJECTS or project == 'connectyhub':
        raise Rejected('Recursos exclusivos ainda não conferidos para este projeto.')
    return PROJECTS[project]


def inside(path, root):
    return path == root or path.startswith(root + '/')


def belongs(container, cfg):
    labels = container['Config'].get('Labels') or {}
    compose = labels.get('com.docker.compose.project')
    if compose in cfg['compose']:
        return labels.get('com.docker.compose.project.working_dir') == cfg['compose'][compose]
    name = container['Name'].lstrip('/')
    return name in cfg['standalone'] and container['Config']['Image'] == cfg['standalone'][name]


def containers(running_only=False):
    ids = docker('ps', '-q' if running_only else '-aq').split()
    if len(ids) > 2000:
        raise Rejected('Inventário excede o limite de conferência.')
    return json.loads(docker('inspect', *ids, timeout=30)) if ids else []


def inventory(project, all_containers=None):
    cfg = config(project)
    all_containers = containers() if all_containers is None else all_containers
    selected = [c for c in all_containers if belongs(c, cfg)]
    ids = {c['Id'] for c in selected}
    roots = cfg['directories']
    # All bind sources must be inside this reviewed project root. No nested mount escape.
    for root in roots:
        if not root.startswith('/opt/') or root in ['/opt/connectyhub', '/opt'] or str(Path(root).resolve()) != root:
            raise Rejected('Diretório não exclusivo ou redirecionado; revisão necessária.')
    volumes = set(cfg['volumes'])
    for c in selected:
        for mount in c['Mounts']:
            if mount['Type'] == 'bind' and not any(inside(str(Path(mount['Source']).resolve()), root) for root in roots):
                raise Rejected('Serviço usa um diretório fora do escopo revisado.')
            if mount['Type'] == 'volume' and mount['Name'] not in volumes:
                raise Rejected('Volume ainda não revisado; operação bloqueada.')
    # Include stopped containers when checking ownership; deleting their data is unsafe too.
    for c in all_containers:
        if c['Id'] in ids:
            continue
        for mount in c['Mounts']:
            shared = mount['Type'] == 'volume' and mount.get('Name') in volumes
            source = str(Path(mount['Source']).resolve())
            shared = shared or (mount['Type'] == 'bind' and any(inside(source, root) or inside(root, source) for root in roots))
            if shared:
                raise Rejected('Recursos usados por outro serviço; operação bloqueada.')
    existing = set(docker('volume', 'ls', '-q').split())
    return selected, sorted(volumes & existing)


def preview(project, selected=None, volumes=None):
    cfg = config(project)
    s = state(project)
    if s.get('operation', {}).get('status') == 'running' and s.get('pendingPreview'):
        return dict(s['pendingPreview'], state=s['state'], actions=[], operation=s['operation'])
    if selected is None:
        selected, volumes = inventory(project)
    fingerprint = {'containers': sorted((c['Id'], c['Name'], c['State']['Running'], c['HostConfig']['RestartPolicy']) for c in selected),
                   'volumes': volumes, 'config': cfg, 'state': s}
    revision = hashlib.sha256(json.dumps(fingerprint, sort_keys=True).encode()).hexdigest()
    busy = s.get('operation', {}).get('status') == 'running'
    actions = []
    if not busy and s['state'] != 'deleted' and selected:
        if s['state'] == 'active':
            actions = ['pause', 'quarantine']
        elif s['state'] == 'paused':
            actions = ['resume', 'quarantine']
        elif s['state'] == 'quarantined':
            actions = ['resume'] + (['delete'] if cfg.get('allowDelete') else [])
        # Interrupted/partial operations require private review. Never silently retry a delete.
    return {'project': project, 'revision': revision, 'state': s['state'], 'services': [{'name': c['Name'].lstrip('/'), 'running': c['State']['Running']} for c in selected],
            'volumes': volumes, 'directories': cfg['directories'], 'actions': actions, 'exclusions': EXCLUSIONS + cfg.get('exclusions', []), 'operation': s.get('operation')}


def apply(project, payload):
    with LOCK:
        config(project)
        if set(payload) != {'action', 'revision', 'requestId', 'actor'} or payload['action'] not in ['pause', 'quarantine', 'resume', 'delete']:
            raise Rejected('Operação inválida.')
        for field in ['requestId', 'actor']:
            if not isinstance(payload[field], str) or not re.fullmatch(r'[0-9a-f-]{36}', payload[field]):
                raise Rejected('Identidade inválida.')
        s = state(project)
        previous = s['receipts'].get(payload['requestId'])
        if previous:
            if previous['action'] != payload['action'] or previous['actor'] != payload['actor']:
                raise Rejected('Recibo pertence a outra solicitação.')
            return preview(project)
        selected, volumes = inventory(project)
        p = preview(project, selected, volumes)
        if p['revision'] != payload['revision'] or payload['action'] not in p['actions']:
            raise Rejected('O estado mudou ou a ação está bloqueada. Atualize a prévia.')
        if payload['action'] in ['pause', 'quarantine'] and s['state'] == 'active':
            s['saved'] = {c['Id']: {'running': c['State']['Running'], 'restart': c['HostConfig']['RestartPolicy']} for c in selected}
        operation = {'id': payload['requestId'], 'action': payload['action'], 'status': 'running', 'actor': payload['actor']}
        s['operation'] = operation
        s['receipts'][payload['requestId']] = operation.copy()
        s['pendingPreview'] = p
        save(project, s)  # Durable intent before any Docker call.
        threading.Thread(target=execute, args=(project, payload, selected, volumes), daemon=True).start()
        return preview(project, selected, volumes)


def execute(project, payload, selected, volumes):
    s = state(project)
    try:
        action = payload['action']
        # Revalidate the inventory after accepting the intent, before effects.
        current, fresh_volumes = inventory(project)
        if {c['Id'] for c in current} != {c['Id'] for c in selected} or fresh_volumes != volumes:
            raise Rejected('Inventário mudou durante a solicitação.')
        if action in ['pause', 'quarantine']:
            for c in selected:
                docker('update', '--restart=no', c['Id'])
            for c in selected:
                if c['State']['Running']:
                    docker('stop', '--time=45', c['Id'])
            if any(c['State']['Running'] for c in inventory(project)[0]):
                raise Rejected('Ainda há serviços em execução.')
            s['state'] = 'paused' if action == 'pause' else 'quarantined'
        elif action == 'resume':
            if {c['Id'] for c in selected} != set(s['saved']):
                raise Rejected('Serviços recriados; retomada exige revisão no servidor.')
            # Databases start before applications; health remains independently measured.
            ordered = sorted(selected, key=lambda c: (0 if any(x in c['Name'] for x in ['postgres', '-db-', 'redis']) else 1))
            for c in ordered:
                saved = s['saved'][c['Id']]
                policy = saved['restart']['Name'] or 'no'
                if policy == 'on-failure' and saved['restart']['MaximumRetryCount']:
                    policy += ':' + str(saved['restart']['MaximumRetryCount'])
                docker('update', '--restart=' + policy, c['Id'])
                if saved['running']:
                    docker('start', c['Id'])
            s['state'] = 'active'
        elif action == 'delete':
            if s['state'] != 'quarantined' or any(c['State']['Running'] for c in selected):
                raise Rejected('Exclusão exige quarentena com todos os serviços parados.')
            for c in selected:
                docker('rm', c['Id'])  # No force, no shared image pruning.
            # Recheck mounts after removing containers and before touching stored data.
            inventory(project)
            for volume in volumes:
                docker('volume', 'rm', volume)
            for directory in config(project)['directories']:
                path = Path(directory)
                if path.exists():
                    if path.is_symlink() or str(path.resolve()) != directory:
                        raise Rejected('Diretório mudou durante a exclusão.')
                    # Refuse nested filesystem mounts (rmtree must not cross them).
                    mounts = Path('/proc/self/mountinfo').read_text().splitlines()
                    if any(inside(line.split()[4], directory) for line in mounts):
                        raise Rejected('Diretório contém um filesystem montado.')
                    shutil.rmtree(path)
            s['state'] = 'deleted'
        s['operation']['status'] = 'completed'
    except Exception:
        s['state'] = 'error'
        s['operation']['status'] = 'failed_review_required'
    s['receipts'][payload['requestId']] = s['operation'].copy()
    s.pop('pendingPreview', None)
    with LOCK:
        save(project, s)


def publish():
    all_containers = containers(running_only=True)
    projects = {}
    for project, cfg in PROJECTS.items():
        s = state(project)
        selected = [c for c in all_containers if belongs(c, cfg)]
        # Unexpected restarts invalidate a stopped status. Do not claim that everything stopped.
        actual = s['state']
        if actual in ['paused', 'quarantined', 'deleted'] and any(c['State']['Running'] for c in selected):
            actual = 'error'
        projects[project] = {'state': actual, 'services': [c['Name'].lstrip('/') for c in selected if c['State']['Running']]}
    atomic(PUBLIC, {'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'projects': projects}, 0o644)


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def respond(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_request(self, mutation=False):
        try:
            match = re.fullmatch(r'/projects/([a-z0-9-]{1,64})', self.path)
            if not match:
                raise Rejected('Projeto inválido.')
            if mutation:
                size = int(self.headers.get('Content-Length', '0'))
                if size < 1 or size > 4096:
                    raise Rejected('Solicitação inválida.')
                result = apply(match[1], json.loads(self.rfile.read(size)))
            else:
                with LOCK:
                    result = preview(match[1])
            self.respond(200, result)
        except Rejected as e:
            self.respond(409, {'error': str(e)})
        except Exception:
            self.respond(503, {'error': 'Executor indisponível. Confira o recibo antes de repetir.'})

    def do_GET(self):
        self.handle_request()

    def do_POST(self):
        self.handle_request(True)


class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True


def main():
    global PROJECTS
    PROJECTS = json.loads((ROOT / 'projects.json').read_text())
    (ROOT / 'state').mkdir(mode=0o700, exist_ok=True)
    SOCKET.parent.mkdir(mode=0o750, exist_ok=True)
    os.chown(SOCKET.parent, 0, 1000)
    if SOCKET.exists():
        SOCKET.unlink()
    # A crash must never leave a running receipt looking completed or automatically retried.
    for project in PROJECTS:
        s = state(project)
        if s.get('operation', {}).get('status') == 'running':
            s['operation']['status'] = 'interrupted_review_required'
            s['state'] = 'error'
            s['receipts'][s['operation']['id']] = s['operation'].copy()
            save(project, s)
    server = Server(str(SOCKET), Handler)
    os.chown(SOCKET, 0, 1000)
    SOCKET.chmod(0o660)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    while True:
        try:
            publish()
        except Exception:
            pass  # Old timestamp intentionally becomes stale; never publish guessed zeros.
        time.sleep(30)


if __name__ == '__main__':
    main()
