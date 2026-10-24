#!/usr/bin/env python3
"""Verify private Storage CRUD, denial, signed/range reads and migrated hashes."""
import argparse
import base64
import concurrent.futures
import hashlib
import hmac
import json
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

import migrate


def verify(project):
    name, db, source, target = migrate.PROJECTS[project]
    d = migrate.inspect(name)
    e = migrate.environment(name)
    assert e['STORAGE_BACKEND'] == 's3'
    ip = next(iter(d['NetworkSettings']['Networks'].values()))['IPAddress']
    base = 'http://' + ip + ':5000'

    def request(method, path, token=None, payload=None, headers=None):
        head = dict(headers or {})
        if token:
            head['Authorization'] = 'Bearer ' + token
        if isinstance(payload, dict):
            payload = json.dumps(payload).encode()
            head['Content-Type'] = 'application/json'
        req = urllib.request.Request(base + path, method=method, data=payload, headers=head)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as er:
            return er.code, b''

    service = e['SERVICE_KEY']
    bucket = 'r2-migration-check-' + uuid.uuid4().hex[:12]
    path = '/object/' + bucket + '/probe.bin'
    data = b'ConnectyHub private R2 migration canary. No customer data.'
    assert request('POST', '/bucket', service, {'id': bucket, 'name': bucket, 'public': False})[0] == 200
    try:
        assert request('POST', path, service, data, {'Content-Type': 'application/octet-stream'})[0] == 200
        assert request('GET', path, service) == (200, data)
        assert request('GET', path, e['ANON_KEY'])[0] in (400, 401, 403, 404)
        assert request('GET', '/object/public/' + bucket + '/probe.bin')[0] in (400, 401, 403, 404)
        enc = lambda v: base64.urlsafe_b64encode(json.dumps(v, separators=(',', ':')).encode()).rstrip(b'=').decode()
        now = int(time.time())
        unsigned = enc({'alg': 'HS256', 'typ': 'JWT'}) + '.' + enc({'role': 'authenticated', 'sub': str(uuid.uuid4()), 'aud': 'authenticated', 'iat': now, 'exp': now + 120})
        token = unsigned + '.' + base64.urlsafe_b64encode(hmac.new(e['AUTH_JWT_SECRET'].encode(), unsigned.encode(), hashlib.sha256).digest()).rstrip(b'=').decode()
        assert request('GET', path, token)[0] in (400, 401, 403, 404)
        status, payload = request('POST', '/object/sign/' + bucket + '/probe.bin', service, {'expiresIn': 60})
        assert status == 200
        signed = json.loads(payload)['signedURL']
        assert request('GET', signed) == (200, data)
        assert request('GET', signed, headers={'Range': 'bytes=0-9'}) == (206, data[:10])
        rows = [r for r in migrate.metadata(db) if r['bucket_id'] == bucket]
        assert len(rows) == 1
        key = e['TENANT_ID'] + '/' + bucket + '/probe.bin/' + rows[0]['version']
        assert migrate.client(project).get_object(Bucket=target, Key=key)['Body'].read() == data
        from pathlib import Path
        assert not any(p.is_file() for p in Path(source).rglob('*') if bucket in p.parts)
    finally:
        assert request('DELETE', '/object/' + bucket, service, {'prefixes': ['probe.bin']})[0] == 200
        assert request('DELETE', '/bucket/' + bucket, service)[0] == 200
    manifest = json.loads((migrate.STATE / (project + '-manifest.json')).read_text())

    def read_existing(item):
        key = item['key']
        # Both installed servers use tenant/bucket/name/version keys.
        logical = key[len(e['TENANT_ID']) + 1:].rsplit('/', 1)[0]
        status, payload = request('GET', '/object/' + urllib.parse.quote(logical, safe='/'), service)
        assert status == 200 and hashlib.sha256(payload).hexdigest() == item['sha256']
        return len(payload)

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        total = sum(pool.map(read_existing, manifest))
    result = {'project': project, 'private_crud_signed_range': True,
              'anonymous_and_unrelated_user_denied': True, 'new_payload_only_in_r2': True,
              'existing_objects_api_hash_verified': len(manifest), 'existing_bytes': total}
    migrate.write_private(migrate.STATE / (project + '-verification.json'), result)
    print(json.dumps(result))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('project', choices=migrate.PROJECTS)
    args = parser.parse_args()
    try:
        verify(args.project)
    except Exception as ex:
        print(json.dumps({'project': args.project, 'failed': True, 'error_type': type(ex).__name__}))
        raise SystemExit(1)
