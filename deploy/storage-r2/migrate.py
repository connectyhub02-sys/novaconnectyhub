#!/usr/bin/env python3
"""One-time, copy-only native Supabase file -> private R2 migration.

Run on the VPS. No secrets or object names are printed. Reconcile once more
with Storage stopped before cutover. Originals are never deleted by this tool.
"""
import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

PROJECTS = {
    'connectyhub': ('supabase-storage', 'supabase-db',
                   '/opt/connectyhub/supabase/volumes/storage', 'connectyhub-storage-private'),
    'vision': ('vision-demo-supabase-storage-1', 'vision-demo-supabase-db-1',
               '/opt/vision/demo/supabase/volumes/storage', 'vision-voice-private'),
}
STATE = Path('/var/lib/connectyhub-storage-r2')


def inspect(name):
    return json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]


def environment(name):
    return dict(v.split('=', 1) for v in inspect(name)['Config']['Env'] if '=' in v)


def credentials(project='connectyhub'):
    if project == 'vision':
        e = environment('vision-demo-admin-app')
        return {**e, 'R2_ENDPOINT': 'https://' + e['R2_ACCOUNT_ID'] + '.r2.cloudflarestorage.com',
                'R2_ACCESS_KEY_ID': e['CONNECTYHUB_VOICE_R2_ACCESS_KEY_ID'],
                'R2_SECRET_ACCESS_KEY': e['CONNECTYHUB_VOICE_R2_SECRET_ACCESS_KEY']}
    for name in ('connectyhub-app-b-app-1', 'connectyhub-app-a-app-1'):
        d = inspect(name)
        if d['State']['Running']:
            e = environment(name)
            if e.get('R2_ENDPOINT') and e.get('R2_SECRET_ACCESS_KEY'):
                return e
    raise RuntimeError('R2 credentials unavailable')


def client(project='connectyhub'):
    e = credentials(project)
    return boto3.client('s3', endpoint_url=e['R2_ENDPOINT'],
                        aws_access_key_id=e['R2_ACCESS_KEY_ID'],
                        aws_secret_access_key=e['R2_SECRET_ACCESS_KEY'], region_name='auto',
                        config=Config(signature_version='s3v4', max_pool_connections=4,
                                      connect_timeout=10, read_timeout=90,
                                      retries={'max_attempts': 3}))


def metadata(db):
    sql = "SELECT coalesce(json_agg(x),'[]'::json) FROM (SELECT bucket_id,name,version,metadata FROM storage.objects) x"
    return json.loads(subprocess.check_output(['docker', 'exec', db, 'psql', '-U',
                                               'postgres', '-d', 'postgres', '-Atc', sql]))


def sha_file(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def write_private(path, data):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(data, f)
    os.replace(tmp, path)


def migrate(project, reconcile=False):
    container, db, source, target = PROJECTS[project]
    e = environment(container)
    if e['STORAGE_BACKEND'] != 'file':
        raise RuntimeError('Only file backend can be migrated')
    if reconcile and inspect(container)['State']['Running']:
        raise RuntimeError('Stop Storage before final reconciliation')
    previous_path = STATE / (project + '-manifest.json')
    previous = {v['key']: v for v in json.loads(previous_path.read_text())} if reconcile and previous_path.exists() else {}
    root = Path(source).resolve() / e['GLOBAL_S3_BUCKET']
    rows = metadata(db)
    separator = '-$v-' if e.get('TUS_USE_FILE_VERSION_SEPARATOR') == 'true' else '/'
    manifest = []
    for row in rows:
        key = f"{e['TENANT_ID']}/{row['bucket_id']}/{row['name']}"
        if row['version']:
            key += separator + row['version']
        path = (root / key).resolve()
        if not path.is_relative_to(root) or not path.is_file() or path.is_symlink():
            raise RuntimeError('Missing or unsafe source object; no changes applied')
        size = path.stat().st_size
        if size != int(row['metadata']['size']):
            raise RuntimeError('Source size does not match metadata')
        manifest.append({'key': key, 'bytes': size, 'sha256': sha_file(path)})
    # Unmapped files (including incomplete multiparts) require review before switch.
    all_files = {p.resolve() for p in Path(source).rglob('*') if p.is_file()}
    if all_files != {(root / item['key']).resolve() for item in manifest}:
        raise RuntimeError('Unmapped local payloads; inspect before cutover')
    s3 = client(project)
    s3.head_bucket(Bucket=target)

    def copy(item):
        path = root / item['key']
        try:
            head = s3.head_object(Bucket=target, Key=item['key'])
        except ClientError as ex:
            if ex.response['Error']['Code'] not in ('404', 'NoSuchKey'):
                raise
            head = None
        if head is not None:
            if head.get('Metadata', {}).get('migration-sha256') != item['sha256']:
                raise RuntimeError('Destination conflict; refusing overwrite')
            if (previous.get(item['key']) == item and
                    head['ContentLength'] == item['bytes']):
                return item  # Full GET/hash verified in the preceding online copy.
        else:
            content_type = os.getxattr(path, 'user.supabase.content-type').decode()
            cache_control = os.getxattr(path, 'user.supabase.cache-control').decode()
            with path.open('rb') as f:
                s3.put_object(Bucket=target, Key=item['key'], Body=f,
                              ContentType=content_type, CacheControl=cache_control,
                              Metadata={'migration-sha256': item['sha256']})
        result = s3.get_object(Bucket=target, Key=item['key'])
        h = hashlib.sha256()
        count = 0
        with result['Body'] as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                h.update(chunk)
                count += len(chunk)
        if count != item['bytes'] or h.hexdigest() != item['sha256'] or sha_file(path) != item['sha256']:
            raise RuntimeError('Verification failed; local originals preserved')
        return item

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        verified = list(pool.map(copy, manifest))
    write_private(STATE / (project + '-manifest.json'), verified)
    summary = {'project': project, 'objects': len(verified),
               'bytes': sum(i['bytes'] for i in verified), 'all_sha256_verified': True}
    write_private(STATE / (project + '-summary.json'), summary)
    print(json.dumps(summary))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('project', choices=PROJECTS)
    parser.add_argument('--reconcile', action='store_true')
    args = parser.parse_args()
    try:
        migrate(args.project, args.reconcile)
    except Exception as ex:
        # SDK and filesystem exceptions can include private object names.
        print(json.dumps({'project': args.project, 'failed': True, 'error_type': type(ex).__name__}))
        raise SystemExit(1)
