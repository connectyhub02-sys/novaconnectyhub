#!/usr/bin/env python3
"""Bounded retention of reproducible releases. Never stops containers or touches volumes/backups."""
import argparse
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time

DAY = 86400
KEEP_DAYS = 7
KEEP_NEWEST = 5
ROOTS = (Path('/opt/vision/app/releases'), Path('/opt/connectyhub/app/releases'))
STATE = Path('/var/lib/connectyhub-artifact-retention')
PUBLIC = Path('/opt/connectyhub/monitoring/public/artifact-retention.json')
CONTAINER = re.compile(r'^vision-demo-admin-(candidate|rollback|failed)-[a-zA-Z0-9_-]+$')


def docker(*args):
    return subprocess.check_output(['docker', *args], timeout=180, stderr=subprocess.DEVNULL).decode().strip()


def inventory():
    ids = docker('ps', '-aq').split()
    if len(ids) > 2000:
        raise RuntimeError('inventory_limit')
    return json.loads(docker('inspect', *ids)) if ids else []


def timestamp(value):
    try:
        return dt.datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()
    except (ValueError, TypeError):
        return float('inf')


def inside(path, root):
    return path == root or root in path.parents


def eligible_container(row, now):
    if not CONTAINER.fullmatch(row['Name'].lstrip('/')) or row['State']['Status'] != 'exited':
        return False
    if row['State'].get('Running') or row['State'].get('Restarting'):
        return False
    if max(timestamp(row['Created']), timestamp(row['State']['FinishedAt'])) >= now - KEEP_DAYS * DAY:
        return False
    mounts = row.get('Mounts', [])
    # Only old node application containers; refuse databases, volumes and unrelated bind mounts.
    return (row['Config']['Image'] == 'node:22-alpine' and len(mounts) == 1
            and mounts[0]['Type'] == 'bind'
            and Path(mounts[0]['Source']).parent == ROOTS[0]
            and Path(mounts[0]['Source']).resolve() == Path(mounts[0]['Source'])
            and Path(mounts[0]['Source']).name.startswith('release-'))


def container_candidates(rows, now):
    protected = set()
    for kind in ('candidate', 'rollback', 'failed'):
        family = [r for r in rows if r['Name'].startswith('/vision-demo-admin-' + kind + '-')]
        protected.update(r['Id'] for r in sorted(family, key=lambda r: r['Created'], reverse=True)[:KEEP_NEWEST])
    return [r for r in rows if r['Id'] not in protected and eligible_container(r, now)]


def protected_paths(rows):
    return {Path(m['Source']).resolve() for r in rows for m in r.get('Mounts', []) if m['Type'] == 'bind'}


def release_candidates(root, rows, now):
    if not root.is_dir() or root.is_symlink() or root.resolve() != root:
        return []
    children = [p for p in root.iterdir() if p.is_dir() and not p.is_symlink()]
    keep = set(sorted(children, key=lambda p: p.stat().st_mtime, reverse=True)[:KEEP_NEWEST])
    mounted = protected_paths(rows)
    images = {r['Config']['Image'].split(':')[-1] for r in rows}
    result = []
    for path in children:
        if path in keep or path.name in images or path.stat().st_mtime >= now - KEEP_DAYS * DAY:
            continue
        if any(inside(m, path) or inside(path, m) for m in mounted):
            continue
        if root == ROOTS[0]:
            valid = bool(re.fullmatch(r'release-20\d{6}-[a-zA-Z0-9_-]+', path.name)) and (path / 'server.js').is_file()
        else:
            valid = bool(re.fullmatch(r'[a-f0-9]{40}', path.name)) and (path / 'package.json').is_file()
        if not valid or any((path / name).exists() for name in ('uploads', 'data', 'storage', 'backups', '.git', 'public/uploads', 'public/storage', 'public/user-content')):
            continue
        result.append(path)
    return sorted(result)


def verify_delete_path(path, root):
    if path.parent != root or path.is_symlink() or path.resolve() != path or root.resolve() != root:
        raise RuntimeError('unsafe_release_path')
    for line in Path('/proc/self/mountinfo').read_text().splitlines():
        mount = Path(re.sub(r'\\([0-7]{3})', lambda m: chr(int(m[1], 8)), line.split()[4]))
        if inside(mount, path):
            raise RuntimeError('mounted_release')


def image_candidates(rows, images, now):
    used = {r['Image'] for r in rows}
    own = [r for r in images if r.get('RepoTags') and all(re.fullmatch(r'connectyhub-app:[a-f0-9]{40}', t) for t in r['RepoTags'])]
    keep = {r['Id'] for r in sorted(own, key=lambda r: r['Created'], reverse=True)[:KEEP_NEWEST]}
    return [r for r in own if r['Id'] not in used | keep and timestamp(r['Created']) < now - KEEP_DAYS * DAY]


def image_inventory():
    ids = sorted(set(docker('image', 'ls', '-q', 'connectyhub-app').split()))
    return json.loads(docker('image', 'inspect', *ids)) if ids else []


def atomic(path, value, mode):
    temporary = path.with_suffix('.tmp')
    with open(temporary, 'w') as handle:
        os.chmod(temporary, mode)
        json.dump(value, handle)
    temporary.replace(path)


def run(apply=False):
    now = time.time()
    rows = inventory()
    containers = container_candidates(rows, now)
    remaining = [r for r in rows if r['Id'] not in {c['Id'] for c in containers}]
    releases = [(root, p) for root in ROOTS for p in release_candidates(root, remaining, now)]
    images = image_candidates(remaining, image_inventory(), now)
    plan = dict(containers=[r['Name'] for r in containers], releases=[str(p) for _, p in releases], images=[r['Id'] for r in images])
    if not apply:
        print(json.dumps(dict(plan=plan, counts={k: len(v) for k, v in plan.items()})), flush=True)
        return
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(STATE, 0o700)
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    before = shutil.disk_usage('/')
    result = dict(status='running', startedAt=started, finishedAt=None, removedContainers=0, removedReleases=0, removedImages=0,
                  keepDays=KEEP_DAYS, keepNewest=KEEP_NEWEST, freeBytesBefore=before.free)
    atomic(STATE / 'plan.json', plan, 0o600)
    atomic(PUBLIC, result, 0o644)
    try:
        # No force and no -v: Docker refuses a container that started since inspection.
        for old in containers:
            current = json.loads(docker('inspect', old['Id']))[0]
            if not eligible_container(current, time.time()):
                continue
            docker('rm', current['Id'])
            result['removedContainers'] += 1
            if result['removedContainers'] % 25 == 0:
                atomic(PUBLIC, result, 0o644)
                print(json.dumps(dict(removedContainers=result['removedContainers'])), flush=True)
        rows = inventory()
        for root in ROOTS:
            # A fresh inventory and eligibility check before each bounded batch protects new candidates.
            allowed = set(release_candidates(root, rows, now))
            for index, (_, path) in enumerate([(r, p) for r, p in releases if r == root and p in allowed]):
                if index % 10 == 0:
                    current = inventory()
                if path not in release_candidates(root, current, time.time()):
                    continue
                verify_delete_path(path, root)
                shutil.rmtree(path)
                result['removedReleases'] += 1
                if result['removedReleases'] % 10 == 0:
                    atomic(PUBLIC, result, 0o644)
                    print(json.dumps({k: result[k] for k in ('removedContainers', 'removedReleases')}), flush=True)
        for item in images:
            # Removal by tag without force refuses newly referenced images and retains shared layers.
            current = inventory()
            allowed = {r['Id'] for r in image_candidates(current, image_inventory(), time.time())}
            if item['Id'] not in allowed:
                continue
            for tag in item['RepoTags']:
                docker('image', 'rm', tag)
            result['removedImages'] += 1
        # Reproducible cache only. Docker retains in-use entries; never prune volumes or runtime images globally.
        docker('buildx', 'prune', '--builder', 'connectyhub-build', '--max-used-space', '3GB', '--reserved-space', '1GB', '--force')
        result['status'] = 'complete'
    except Exception as error:
        result['status'] = 'failed'
        result['error'] = type(error).__name__
        raise
    finally:
        after = shutil.disk_usage('/')
        result.update(finishedAt=dt.datetime.now(dt.timezone.utc).isoformat(), freeBytesAfter=after.free,
                      releasedBytesObserved=after.free - before.free, usedPercent=round(after.used / after.total * 100, 2))
        atomic(STATE / 'last-run.json', result, 0o600)
        with open(STATE / 'history.jsonl', 'a') as history:
            history.write(json.dumps(result) + '\n')
        atomic(PUBLIC, result, 0o644)
        print(json.dumps(result), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    # Same lock as ConnectyHub deployments; separate lock prevents two retention runs.
    with open('/opt/connectyhub/app/release.lock', 'a') as deployment, open('/run/lock/connectyhub-artifact-retention.lock', 'a') as lock, open('/opt/vision/app/release.lock', 'a') as vision:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fcntl.flock(deployment, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fcntl.flock(vision, fcntl.LOCK_EX | fcntl.LOCK_NB)
        run(args.apply)


if __name__ == '__main__':
    main()
