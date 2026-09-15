"""Read-only Linux host snapshot. Prints allowlisted metrics; never reads container env or customer logs."""
import json, os, shutil, subprocess, time
from datetime import datetime, timezone

def cpu():
    with open('/proc/stat', encoding='utf8') as source:
        values = [int(n) for n in source.readline().split()[1:9]]
    return sum(values), values[3] + values[4]

def collect():
    first = cpu(); time.sleep(0.25); last = cpu()
    cpu_percent = 100 * (1 - (last[1] - first[1]) / (last[0] - first[0])) if last[0] > first[0] else None
    with open('/proc/meminfo', encoding='utf8') as source:
        memory = {line.split(':')[0]: int(line.split()[1])*1024 for line in source}
    disk = shutil.disk_usage('/')
    rx = tx = 0
    with open('/proc/net/dev', encoding='utf8') as source:
        for line in list(source)[2:]:
            name, fields = line.split(':'); fields = fields.split()
            if name.strip() != 'lo' and os.path.exists('/sys/class/net/' + name.strip() + '/device'):
                rx += int(fields[0]); tx += int(fields[8])
    services = []
    allowed = {'supabase-db', 'supabase-auth', 'supabase-storage', 'supabase-studio', 'connectyhub-inngest-inngest-1', 'connectyhub-inngest-postgres-1', 'connectyhub-inngest-redis-1'}
    try:
        result = subprocess.run(['docker', 'ps', '-a', '--format', '{{.Names}}'], capture_output=True, text=True, timeout=5, check=True)
        for name in result.stdout.splitlines():
            if name in allowed:
                state = subprocess.run(['docker','inspect','--format','{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',name], capture_output=True,text=True,timeout=5,check=True).stdout.strip()
                services.append({'name': name, 'status': state if state in {'healthy','unhealthy','starting','running','exited','restarting'} else 'unknown'})
    except (subprocess.SubprocessError, FileNotFoundError):
        services.append({'name':'container-collector','status':'unavailable'})
    return dict(measured_at=datetime.now(timezone.utc).isoformat(), cpu_percent=cpu_percent, memory_total=memory['MemTotal'],memory_available=memory['MemAvailable'],disk_total=disk.total,disk_used=disk.used,network_rx_bytes=rx,network_tx_bytes=tx,services=services)

if __name__ == '__main__':
    print(json.dumps(collect()))
