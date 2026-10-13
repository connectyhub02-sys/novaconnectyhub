#!/usr/bin/env python3
"""Read-only host/cgroup v2 sampler. Writes only sanitized metrics, never env/logs."""
import datetime
import json
import os
from pathlib import Path
import socket
import subprocess
import time

ROOT = Path('/opt/connectyhub/monitoring')


def pairs(path):
    return {k.rstrip(':'): int(v.split()[0]) for k, v in
            (line.split(maxsplit=1) for line in Path(path).read_text().splitlines())}


def ratio(used, total):
    return round(max(0, min(100, used / total * 100)), 2) if total > 0 else None


def cpu_delta(current, previous):
    # guest and guest_nice are already included in user/nice.
    delta = [a - b for a, b in zip(current[:8], previous[:8])]
    if len(delta) < 8 or min(delta) < 0 or sum(delta) <= 0:
        return None, None
    total = sum(delta)
    return ratio(total - delta[3] - delta[4], total), ratio(delta[4], total)


def service_delta(current, previous, seconds):
    if not previous or not seconds or current['identity'] != previous.get('identity'):
        return None, None
    used = current['cpu'].get('usage_usec', 0) - previous['cpu'].get('usage_usec', 0)
    periods = current['cpu'].get('nr_periods', 0) - previous['cpu'].get('nr_periods', 0)
    throttled = current['cpu'].get('nr_throttled', 0) - previous['cpu'].get('nr_throttled', 0)
    return (round(used / seconds / 1e6, 4) if used >= 0 else None,
            ratio(throttled, periods) if periods > 0 and throttled >= 0 else None)


def group(name):
    if 'vision' in name:
        return 'Vision'
    if 'betel' in name:
        return 'Betel'
    if 'immov' in name:
        return 'Immov'
    if 'buildkit' in name:
        return 'Build'
    if 'managed-portal' in name:
        return 'Portal'
    if 'connectyhub' in name or 'supabase' in name:
        return 'ConnectyHub'
    return 'Outros'


def container_metrics(container):
    name = container['Name'].lstrip('/')
    state = container['State']
    result = dict(name=name, group=group(name), state=state['Status'],
                  health=state.get('Health', {}).get('Status', 'not-configured'),
                  cpuCores=None, cpuLimit=None, memoryUsed=None, memoryLimit=None,
                  throttlePercent=None)
    raw = None
    try:
        cg = Path(f"/proc/{state['Pid']}/cgroup").read_text().strip().split('0::')[1]
        root = Path('/sys/fs/cgroup') / cg.lstrip('/')
        quota, period = (root / 'cpu.max').read_text().split()
        result['cpuLimit'] = int(quota) / int(period) if quota != 'max' else None
        memory_limit = (root / 'memory.max').read_text().strip()
        result['memoryLimit'] = int(memory_limit) if memory_limit != 'max' else None
        memory = int((root / 'memory.current').read_text())
        result['memoryUsed'] = max(0, memory - pairs(root / 'memory.stat').get('inactive_file', 0))
        raw = dict(identity=container['Id'] + ':' + state['StartedAt'], cpu=pairs(root / 'cpu.stat'))
    except (OSError, ValueError, IndexError, KeyError):
        pass  # A restarting/exiting service has unknown metrics, never artificial zeros.
    return result, raw


def atomic_json(path, data, mode=0o644):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, separators=(',', ':'), allow_nan=False))
    temporary.chmod(mode)
    temporary.replace(path)


def collect():
    now = time.time()
    observed = datetime.datetime.fromtimestamp(now, datetime.timezone.utc).isoformat()
    boot = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
    ticks = [int(v) for v in Path('/proc/stat').read_text().splitlines()[0].split()[1:]]
    try:
        previous = json.loads((ROOT / 'state.json').read_text())
    except (OSError, ValueError):
        previous = {}
    seconds = now - previous.get('at', now)
    valid = previous.get('boot') == boot and 5 <= seconds <= 120
    cpu, io_wait = cpu_delta(ticks, previous['ticks']) if valid else (None, None)
    mem = pairs('/proc/meminfo')
    total, available = mem['MemTotal'] * 1024, mem['MemAvailable'] * 1024
    disk = os.statvfs('/')
    disk_total = disk.f_blocks * disk.f_frsize
    disk_used = (disk.f_blocks - disk.f_bfree) * disk.f_frsize
    disk_available = disk.f_bavail * disk.f_frsize
    services, service_state = [], {}
    services_available = True
    try:
        ids = subprocess.check_output(['docker', 'ps', '-q'], timeout=5, stderr=subprocess.DEVNULL).decode().split()
        if len(ids) > 300:
            raise ValueError('Too many containers')
        containers = json.loads(subprocess.check_output(['docker', 'inspect', *ids], timeout=12, stderr=subprocess.DEVNULL)) if ids else []
        for container in containers:
            result, raw = container_metrics(container)
            if raw:
                if valid:
                    result['cpuCores'], result['throttlePercent'] = service_delta(raw, previous.get('services', {}).get(result['name']), seconds)
                service_state[result['name']] = raw
            services.append(result)
    except (OSError, subprocess.SubprocessError, ValueError, KeyError):
        services_available = False
        services, service_state = [], {}
    snapshot = dict(version=1, observedAt=observed, sampleSeconds=round(seconds, 2) if valid else None,
                    host=socket.gethostname(),
                    cpu=dict(cores=os.cpu_count(), percent=cpu, ioWaitPercent=io_wait, load1=os.getloadavg()[0]),
                    memory=dict(total=total, available=available, used=total-available, percent=ratio(total-available, total)),
                    disk=dict(total=disk_total, used=disk_used, available=disk_available, percent=ratio(disk_used, disk_used+disk_available)),
                    services=sorted(services, key=lambda s: (s['group'], s['name'])), servicesAvailable=services_available)
    history = [p for p in previous.get('history', []) if datetime.datetime.fromisoformat(p['at']).timestamp() >= now-3600] if previous.get('boot') == boot else []
    history = (history + [dict(at=observed, cpu=cpu, memory=snapshot['memory']['percent'], disk=snapshot['disk']['percent'])])[-120:]
    snapshot['history'] = history
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'public').mkdir(exist_ok=True)
    atomic_json(ROOT / 'public/capacity.json', snapshot)
    atomic_json(ROOT / 'state.json', dict(at=now, boot=boot, ticks=ticks, services=service_state, history=history), 0o600)


if __name__ == '__main__':
    collect()
