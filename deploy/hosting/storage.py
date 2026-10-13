#!/usr/bin/env python3
"""Read-only project storage accounting. No file contents or object names are published."""
import datetime
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import broker

ROOT = Path('/opt/connectyhub/hosting')
PUBLIC = Path('/opt/connectyhub/monitoring/public/storage.json')
LABELS = {'database': 'Banco de dados', 'automation': 'Históricos das automações',
          'applications': 'Aplicações e versões publicadas', 'files': 'Arquivos locais',
          'backups': 'Backups locais', 'configuration': 'Configurações e outros arquivos',
          'logs': 'Logs e registros dos serviços', 'writable': 'Gravações internas dos serviços',
          'images': 'Imagens', 'videos': 'Vídeos', 'audio': 'Áudios',
          'documents': 'Documentos', 'archives': 'Arquivos compactados', 'other': 'Outros arquivos'}
RULES = {'app': 'applications', 'storefront': 'applications', 'backups': 'backups',
         'demo/supabase/volumes/db/data': 'database', 'demo/supabase/volumes/storage': 'files'}


def timestamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def components(totals):
    return [dict(id=k, label=LABELS[k], bytes=v) for k, v in sorted(totals.items(), key=lambda x: -x[1]) if v > 0]


def partition(root, rules=RULES):
    """Disjoint roots: split only ancestors of reviewed category paths; never follow links."""
    result = []
    def walk(path, relative):
        if path.is_symlink():
            result.append((str(path), 'configuration'))
        elif relative in rules:
            result.append((str(path), rules[relative]))
        elif path.is_dir() and (not relative or any(k.startswith(relative + '/') for k in rules)):
            # du of children misses only the directory inode itself; account for it separately.
            result.append((None, ('configuration', path.stat().st_blocks * 512)))
            for child in path.iterdir():
                walk(child, str(child.relative_to(root)))
        else:
            result.append((str(path), 'configuration'))
    if root.exists():
        walk(root, '')
    return result


def measure_paths(parts):
    totals, paths = {}, {}
    for path, category in parts:
        if path is None:
            key, value = category
            totals[key] = totals.get(key, 0) + value
        else:
            if path in paths:
                raise ValueError('duplicate_path')
            paths[path] = category
    # One du invocation deduplicates hardlinks across all project roots. -P never follows links.
    if paths:
        raw = subprocess.check_output(['du', '-P', '-x', '-B1', '-s', '--null', '--', *paths], timeout=600, stderr=subprocess.DEVNULL)
        for record in raw.split(b'\0'):
            if not record:
                continue
            size, path = record.split(b'\t', 1)
            key = paths[os.fsdecode(path)]
            totals[key] = totals.get(key, 0) + int(size)
    return totals


def local_storage(project, all_containers):
    selected, volumes = broker.inventory(project, all_containers)
    for line in Path('/proc/self/mountinfo').read_text().splitlines():
        mount = re.sub(r'\\([0-7]{3})', lambda m: chr(int(m[1], 8)), line.split()[4])
        if any(broker.inside(mount, root) for root in broker.config(project)['directories']):
            raise ValueError('nested_mount_requires_review')
    parts = [part for root in broker.config(project)['directories'] for part in partition(Path(root))]
    for volume in json.loads(broker.docker('volume', 'inspect', *volumes)) if volumes else []:
        expected = '/var/lib/docker/volumes/' + volume['Name'] + '/_data'
        if volume['Driver'] != 'local' or volume.get('Options') or volume['Mountpoint'] != expected or str(Path(expected).resolve()) != expected:
            raise ValueError('unreviewed_volume')
        category = 'automation' if 'inngest' in volume['Name'] and 'postgres' in volume['Name'] else 'configuration'
        parts.append((expected, category))
    for c in selected:
        path = Path('/var/lib/docker/containers') / c['Id']
        if not re.fullmatch('[0-9a-f]{64}', c['Id']) or str(path.resolve()) != str(path):
            raise ValueError('invalid_container_path')
        if path.exists():
            parts.append((str(path), 'logs'))
    totals = measure_paths(parts)
    writable = 0
    for offset in range(0, len(selected), 100):
        rows = json.loads(broker.docker('inspect', '--size', *[c['Id'] for c in selected[offset:offset+100]], timeout=90))
        for row in rows:
            size = row.get('SizeRw')
            if not isinstance(size, int) or size < 0:
                raise ValueError('writable_unavailable')
            writable += size
    totals['writable'] = writable
    # A deploy or another project's mount must not silently change the attribution during collection.
    fresh, fresh_volumes = broker.inventory(project)
    if {c['Id'] for c in fresh} != {c['Id'] for c in selected} or fresh_volumes != volumes:
        raise ValueError('inventory_changed')
    return dict(status='ok', observedAt=timestamp(), bytes=sum(totals.values()), components=components(totals))


def object_category(key):
    suffix = Path(key.lower()).suffix
    for category, extensions in {'images': '.jpg .jpeg .png .webp .gif .svg .avif .heic .ico',
                                'videos': '.mp4 .mov .webm .avi .mkv .m4v',
                                'audio': '.mp3 .wav .ogg .opus .m4a .aac .flac',
                                'documents': '.pdf .doc .docx .xls .xlsx .ppt .pptx .txt .csv',
                                'archives': '.zip .gz .tar .7z .rar'}.items():
        if suffix and suffix in extensions.split():
            return category
    return 'other'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def list_page(account, bucket, access, secret, continuation=None):
    if not re.fullmatch('[0-9a-f]{32}', account) or not re.fullmatch('[a-z0-9][a-z0-9.-]{1,62}', bucket):
        raise ValueError('invalid_r2_scope')
    host = account + '.r2.cloudflarestorage.com'
    params = {'list-type': '2', 'max-keys': '1000', 'encoding-type': 'url'}
    if continuation:
        params['continuation-token'] = continuation
    query = '&'.join(urllib.parse.quote(k, safe='') + '=' + urllib.parse.quote(v, safe='') for k, v in sorted(params.items()))
    date = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    digest = hashlib.sha256(b'').hexdigest()
    signed = 'host;x-amz-content-sha256;x-amz-date'
    headers = f'host:{host}\nx-amz-content-sha256:{digest}\nx-amz-date:{date}\n'
    canonical = '\n'.join(['GET', '/' + bucket, query, headers, signed, digest])
    scope = date[:8] + '/auto/s3/aws4_request'
    to_sign = 'AWS4-HMAC-SHA256\n' + date + '\n' + scope + '\n' + hashlib.sha256(canonical.encode()).hexdigest()
    key = ('AWS4' + secret).encode()
    for value in [date[:8], 'auto', 's3', 'aws4_request']:
        key = hmac.new(key, value.encode(), hashlib.sha256).digest()
    signature = hmac.new(key, to_sign.encode(), hashlib.sha256).hexdigest()
    req = urllib.request.Request('https://' + host + '/' + bucket + '?' + query, headers={
        'x-amz-date': date, 'x-amz-content-sha256': digest,
        'Authorization': f'AWS4-HMAC-SHA256 Credential={access}/{scope}, SignedHeaders={signed}, Signature={signature}'})
    with urllib.request.build_opener(NoRedirect).open(req, timeout=25) as response:
        raw = response.read(4_000_001)
    if len(raw) > 4_000_000:
        raise ValueError('response_too_large')
    return ET.fromstring(raw)


def measure_bucket(account, bucket, access, secret):
    totals, count, continuation, seen = {}, 0, None, set()
    deadline = time.monotonic() + 240
    for _ in range(200):
        if time.monotonic() >= deadline:
            raise ValueError('listing_timeout')
        page = list_page(account, bucket, access, secret, continuation)
        if page.tag.split('}')[-1] != 'ListBucketResult':
            raise ValueError('invalid_list')
        for obj in page.findall('{*}Contents'):
            name, size = obj.findtext('{*}Key'), int(obj.findtext('{*}Size', '-1'))
            if name is None or size < 0:
                raise ValueError('invalid_object')
            category = object_category(urllib.parse.unquote(name))
            totals[category] = totals.get(category, 0) + size
            count += 1
        if page.findtext('{*}IsTruncated') == 'false':
            return totals, count
        if page.findtext('{*}IsTruncated') != 'true':
            raise ValueError('invalid_truncation')
        continuation = page.findtext('{*}NextContinuationToken')
        if not continuation or continuation in seen:
            raise ValueError('incomplete_listing')
        seen.add(continuation)
    raise ValueError('listing_limit')


def r2_sources(settings, containers):
    """Pinned bucket/account and project-owned credential source. No copied secrets on disk."""
    output, claimed = {}, set()
    by_name = {c['Name'].lstrip('/'): c for c in containers}
    for project, entries in settings.items():
        # Deleted hosting no longer has credential containers. Do not let its
        # retained R2 mapping invalidate measurements for the remaining projects.
        if broker.state(project)['state'] == 'deleted':
            continue
        output[project] = []
        for item in entries:
            c = by_name[item['container']]
            if not broker.belongs(c, broker.config(project)):
                raise ValueError('foreign_credentials')
            env = dict(v.split('=', 1) for v in c['Config']['Env'] if '=' in v)
            account, bucket = env[item['accountEnv']], env[item['bucketEnv']]
            if hashlib.sha256(account.encode()).hexdigest() != item['accountHash'] or bucket != item['bucket']:
                raise ValueError('r2_scope_changed')
            identity = (account, bucket)
            if identity in claimed:
                raise ValueError('shared_bucket')
            claimed.add(identity)
            output[project].append((account, bucket, env[item['accessEnv']], env[item['secretEnv']]))
    return output


def r2_storage(sources):
    totals, count = {}, 0
    for source in sources:
        amounts, objects = measure_bucket(*source)
        count += objects
        for key, value in amounts.items():
            totals[key] = totals.get(key, 0) + value
    return dict(status='ok', observedAt=timestamp(), bytes=sum(totals.values()), objects=count,
                buckets=len(sources), components=components(totals))


def collect():
    broker.PROJECTS = json.loads((ROOT / 'projects.json').read_text())
    broker.validate_config(broker.PROJECTS)
    settings = json.loads((ROOT / 'storage-r2.json').read_text())
    all_containers = broker.containers()
    try:
        sources = r2_sources(settings, all_containers)
    except Exception:
        sources = {}  # Mapping errors never expose a different bucket or previous tenant's metrics.
    try:
        previous = json.loads(PUBLIC.read_text()).get('projects', {})
    except (OSError, ValueError):
        previous = {}
    result = {}
    for project in broker.PROJECTS:
        entry = {}
        try:
            entry['local'] = local_storage(project, all_containers)
        except Exception as error:
            print(project, 'local_failed', type(error).__name__, flush=True)
            entry['local'] = dict(status='unavailable', observedAt=None, bytes=None, components=[])
        # Cache a full R2 enumeration for six hours; viewing the panel never calls Cloudflare.
        old = previous.get(project, {}).get('r2', {})
        scope_hash = hashlib.sha256(json.dumps(settings.get(project), sort_keys=True).encode()).hexdigest()
        try:
            age = time.time() - datetime.datetime.fromisoformat(old['observedAt']).timestamp()
        except (KeyError, TypeError, ValueError):
            age = float('inf')
        try:
            if not sources.get(project):
                raise ValueError('r2_unconfigured')
            entry['r2'] = old if old.get('status') == 'ok' and old.get('scopeHash') == scope_hash and 0 <= age < 6*3600 else r2_storage(sources[project])
            entry['r2']['scopeHash'] = scope_hash
        except Exception as error:
            print(project, 'r2_failed', type(error).__name__, flush=True)
            entry['r2'] = dict(status='unavailable', observedAt=None, bytes=None, components=[])
        result[project] = entry
        print(project, 'local=' + entry['local']['status'], 'r2=' + entry['r2']['status'], flush=True)
    broker.atomic(PUBLIC, dict(version=1, projects=result), 0o644)


if __name__ == '__main__':
    collect()
