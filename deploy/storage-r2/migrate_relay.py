#!/usr/bin/env python3
"""Copy Studio relay payloads to R2, retaining every local original."""
import hashlib
import json
from pathlib import Path
import subprocess
import migrate


def run():
    sql = "select coalesce(json_agg(x),'[]') from (select id,status,size_bytes,sha256,mime_type from public.studio_assets) x"
    rows = json.loads(subprocess.check_output(['docker', 'exec', 'supabase-db', 'psql',
                                               '-U', 'postgres', '-d', 'postgres', '-Atc', sql]))
    index = {str(r['id']): r for r in rows}
    root = Path('/var/lib/docker/volumes/connectyhub-ai-relay_relay_state/_data/studio-assets')
    if any(p.suffix != '.audio' for p in root.iterdir()):
        raise RuntimeError('Pending receipts or temporary uploads require reconciliation')
    manifest = []
    s3 = migrate.client()
    bucket = 'connectyhub-storage-private'
    for path in root.glob('*.audio'):
        row = index.get(path.stem)
        data = path.read_bytes()
        sha = hashlib.sha256(data).hexdigest()
        if not row or row['sha256'] != sha or row['size_bytes'] != len(data):
            raise RuntimeError('Asset metadata mismatch')
        key = 'studio-relay/assets/' + path.name
        try:
            head = s3.head_object(Bucket=bucket, Key=key)
            if head['Metadata'].get('sha256') != sha:
                raise RuntimeError('Destination conflict')
        except s3.exceptions.ClientError as ex:
            if ex.response['Error']['Code'] != '404':
                raise
            s3.put_object(Bucket=bucket, Key=key, Body=data, ContentType=row['mime_type'],
                          CacheControl='private, no-store', Metadata={'sha256': sha})
        if hashlib.sha256(s3.get_object(Bucket=bucket, Key=key)['Body'].read()).hexdigest() != sha:
            raise RuntimeError('Remote checksum mismatch')
        manifest.append({'id': path.stem, 'key': key, 'bytes': len(data), 'sha256': sha, 'status': row['status']})
    migrate.write_private(migrate.STATE / 'relay-manifest.json', manifest)
    result = {'relay_copied': len(manifest), 'bytes': sum(x['bytes'] for x in manifest),
              'hashes_match_database_and_r2': True}
    migrate.write_private(migrate.STATE / 'relay-summary.json', result)
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        run()
    except Exception as ex:
        print(json.dumps({'failed': True, 'error_type': type(ex).__name__}))
        raise SystemExit(1)
