#!/usr/bin/env python3
"""Archive completed Inngest diagnostics before transactional removal.

Only spans, traces and history are writable. Redis, events, run summaries,
application databases, credentials and billing records are never modified.
"""
import argparse
import datetime as dt
import fcntl
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import struct
import subprocess
import time
import uuid

import boto3
from botocore.config import Config
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import psycopg2

PROJECTS = {
    'connectyhub': 'connectyhub-inngest-postgres-1',
    'vision': 'vision-demo-inngest-postgres-1',
}
TABLES = ('traces', 'history', 'spans')
STATE = Path('/var/lib/connectyhub-retention')
PREFIX = 'infrastructure-archives/inngest-retention-v1'
MAGIC = b'CHRET001'
GIB = 1024 ** 3
MAX_RAW = 512 * 1024 ** 2
MAX_COMPRESSED = 96 * 1024 ** 2
ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'


class BatchTooLarge(RuntimeError):
    pass


def log(event, **values):
    print(json.dumps({'time': dt.datetime.now(dt.timezone.utc).isoformat(),
                      'event': event, **values}), flush=True)


def inspect(name):
    return json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]


def environment(info):
    return dict(e.split('=', 1) for e in info['Config']['Env'] if '=' in e)


def database(project):
    info = inspect(PROJECTS[project])
    env = environment(info)
    ip = next(n['IPAddress'] for n in info['NetworkSettings']['Networks'].values()
              if n['IPAddress'])
    conn = psycopg2.connect(host=ip, user=env['POSTGRES_USER'],
                            password=env['POSTGRES_PASSWORD'],
                            dbname=env.get('POSTGRES_DB', env['POSTGRES_USER']),
                            application_name='connectyhub-retention', connect_timeout=10)
    with conn.cursor() as cur:
        cur.execute('SELECT current_database()')
        if cur.fetchone()[0] != 'inngest':
            raise RuntimeError('Refusing to operate outside the Inngest database')
        cur.execute("SET statement_timeout='180s'; SET lock_timeout='3s'; "
                    "SET idle_in_transaction_session_timeout='180s'; SET timezone='UTC'")
    conn.commit()
    return conn


def ulid_bytes(value):
    if len(value) != 26 or value[0] > '7':
        raise ValueError('Invalid ULID')
    number = 0
    for char in value:
        number = number * 32 + ALPHABET.index(char)
    return number.to_bytes(16, 'big')


class CopyBuffer:
    def __init__(self):
        self.buffer = io.BytesIO()
        self.compressor = gzip.GzipFile(fileobj=self.buffer, mode='wb', compresslevel=3, mtime=0)
        self.digest = hashlib.sha256()
        self.size = 0

    def write(self, data):
        self.size += len(data)
        if self.size > MAX_RAW or self.buffer.tell() > MAX_COMPRESSED:
            raise BatchTooLarge('Batch exceeds memory bound; transaction must roll back')
        self.digest.update(data)
        self.compressor.write(data)

    def finish(self):
        self.compressor.close()
        data = self.buffer.getvalue()
        if len(data) > MAX_COMPRESSED:
            raise BatchTooLarge('Compressed batch exceeds memory bound')
        return data


class Archive:
    def __init__(self):
        key_file = STATE / 'archive.key'
        if key_file.stat().st_mode & 0o077:
            raise RuntimeError('Encryption key must have mode 600')
        self.cipher = AESGCM(key_file.read_bytes())
        # Both release slots carry the same storage identity; choose a running slot.
        for slot in ('b', 'a'):
            info = inspect('connectyhub-app-' + slot + '-app-1')
            if info['State']['Running']:
                env = environment(info)
                break
        else:
            raise RuntimeError('No running application slot for storage configuration')
        self.bucket = env['R2_BUCKET']
        self.s3 = boto3.client('s3', endpoint_url=env['R2_ENDPOINT'],
                              aws_access_key_id=env['R2_ACCESS_KEY_ID'],
                              aws_secret_access_key=env['R2_SECRET_ACCESS_KEY'],
                              region_name='auto', config=Config(connect_timeout=10,
                              read_timeout=60, retries={'max_attempts': 3}))

    def pack(self, object_key, metadata, compressed):
        header = json.dumps(metadata, sort_keys=True).encode()
        nonce = os.urandom(12)
        body = struct.pack('>I', len(header)) + header + compressed
        return MAGIC + nonce + self.cipher.encrypt(nonce, body, object_key.encode())

    def unpack(self, object_key, blob):
        if blob[:8] != MAGIC:
            raise ValueError('Invalid encrypted archive format')
        body = self.cipher.decrypt(blob[8:20], blob[20:], object_key.encode())
        size = struct.unpack('>I', body[:4])[0]
        metadata = json.loads(body[4:4 + size])
        raw = gzip.decompress(body[4 + size:])
        if hashlib.sha256(raw).hexdigest() != metadata['raw_sha256']:
            raise ValueError('Archive plaintext digest mismatch')
        return metadata, raw

    def put_verified(self, object_key, metadata, compressed):
        blob = self.pack(object_key, metadata, compressed)
        digest = hashlib.sha256(blob).hexdigest()
        self.s3.put_object(Bucket=self.bucket, Key=object_key, Body=blob,
                           ContentType='application/octet-stream',
                           Metadata={'sha256': digest, 'format': 'chret001'})
        restored = self.s3.get_object(Bucket=self.bucket, Key=object_key)['Body'].read()
        if hashlib.sha256(restored).hexdigest() != digest:
            raise ValueError('Remote encrypted archive digest mismatch')
        recovered, raw = self.unpack(object_key, restored)
        if recovered != metadata or len(raw) != metadata['raw_bytes']:
            raise ValueError('Remote archive verification failed')
        return len(blob)


def table_columns(cur, table):
    if table not in TABLES:
        raise ValueError('Table is outside the diagnostic allowlist')
    cur.execute("SELECT column_name, data_type FROM information_schema.columns "
                "WHERE table_schema='public' AND table_name=%s ORDER BY ordinal_position", (table,))
    return cur.fetchall()


def candidates(cur, now, after, limit):
    cutoff = now - dt.timedelta(days=7)
    failure_cutoff = now - dt.timedelta(days=30)
    cur.execute("""SELECT run_id::text, status FROM trace_runs
        WHERE run_id > %s::character(26) AND ended_at > 0
        AND ((status=300 AND ended_at < %s) OR
             (status IN (400,500) AND ended_at < %s))
        ORDER BY run_id LIMIT %s""",
        (after, int(cutoff.timestamp() * 1000), int(failure_cutoff.timestamp() * 1000), limit))
    selected = cur.fetchall()
    if not selected:
        return [], after
    # A second, independent finish record must agree with the run summary.
    binary_ids = [psycopg2.Binary(ulid_bytes(row[0])) for row in selected]
    cur.execute("""SELECT run_id, status FROM function_finishes
        WHERE run_id=ANY(%s) AND
        ((status='Completed' AND created_at < %s) OR
         (status IN ('Failed','Cancelled') AND created_at < %s))""",
        (binary_ids, cutoff, failure_cutoff))
    finished = {(bytes(row[0]), row[1]) for row in cur.fetchall()}
    status_names = {300: 'Completed', 400: 'Failed', 500: 'Cancelled'}
    eligible = [run for run, status in selected
                if (ulid_bytes(run), status_names[status]) in finished]
    return eligible, selected[-1][0]


def archive_schema(project, archive, batch_prefix):
    env = environment(inspect(PROJECTS[project]))
    raw = subprocess.check_output(['docker', 'exec', PROJECTS[project], 'pg_dump',
        '-U', env['POSTGRES_USER'], '-d', env.get('POSTGRES_DB', env['POSTGRES_USER']),
        '--schema-only', '--no-owner', '--no-privileges'], timeout=60)
    meta = {'kind': 'postgres-schema', 'project': project,
            'raw_sha256': hashlib.sha256(raw).hexdigest(), 'raw_bytes': len(raw)}
    key = batch_prefix + '/schema.sql.gz.aes'
    archive.put_verified(key, meta, gzip.compress(raw, compresslevel=3, mtime=0))
    return key


def process_batch(conn, archive, project, runs, now, prefix, schema_key, dry_run=False):
    """Deletion stays uncommitted until EVERY object has been downloaded and verified."""
    result = {}
    with conn:
        with conn.cursor() as cur:
            # Large ANY lists can otherwise trigger repeated scans of tens of GiB.
            # This setting is local to this maintenance transaction only.
            cur.execute('SET LOCAL enable_seqscan=off')
            for table in TABLES:
                columns = table_columns(cur, table)
                ids = [psycopg2.Binary(ulid_bytes(r)) for r in runs] if table == 'history' else runs
                cast = '::bytea[]' if table == 'history' else '::bpchar[]' if table == 'traces' else '::text[]'
                date_column = {'spans': 'start_time', 'history': 'created_at', 'traces': 'timestamp'}[table]
                # Never remove new diagnostic entries, even if a finish record is old.
                predicate = f'run_id=ANY(%s{cast}) AND "{date_column}" < %s'
                args = (ids, now - dt.timedelta(days=7))
                if dry_run:
                    cur.execute(f'SELECT count(*) FROM public.{table} WHERE {predicate}', args)
                    result[table] = {'rows': cur.fetchone()[0]}
                    continue
                query = cur.mogrify(f'COPY (WITH removed AS (DELETE FROM public.{table} '
                    f'WHERE {predicate} RETURNING *) SELECT * FROM removed) TO STDOUT', args)
                buffer = CopyBuffer()
                cur.copy_expert(query.decode(), buffer)
                rows = cur.rowcount
                compressed = buffer.finish()
                if rows == 0:
                    result[table] = {'rows': 0, 'archive_bytes': 0}
                    continue
                key = prefix + '/' + table + '.copy.gz.aes'
                metadata = {'format': 'postgres-copy-text', 'table': table, 'columns': columns,
                    'project': project, 'rows': rows, 'schema_key': schema_key,
                    'raw_sha256': buffer.digest.hexdigest(), 'raw_bytes': buffer.size,
                    'retention': 'completed-7-days-errors-30-days',
                    'created_at': now.isoformat()}
                # JSON serialization normalizes tuples to lists.
                metadata = json.loads(json.dumps(metadata))
                size = archive.put_verified(key, metadata, compressed)
                result[table] = {'rows': rows, 'archive_bytes': size, 'key': key}
    return result


def restore_check(conn, archive, key):
    blob = archive.s3.get_object(Bucket=archive.bucket, Key=key)['Body'].read()
    metadata, raw = archive.unpack(key, blob)
    table = metadata['table']
    if table not in TABLES:
        raise ValueError('Invalid restore target')
    # Restore rehearsal is always temporary and rolled back, never into production.
    try:
        with conn.cursor() as cur:
            cur.execute(f'CREATE TEMP TABLE retention_restore_probe (LIKE public.{table}) ON COMMIT DROP')
            cur.copy_expert('COPY retention_restore_probe FROM STDIN', io.BytesIO(raw))
            cur.execute('SELECT count(*) FROM retention_restore_probe')
            count = cur.fetchone()[0]
            if count != metadata['rows']:
                raise ValueError('Restored row count mismatch')
            roundtrip = io.BytesIO()
            cur.copy_expert('COPY retention_restore_probe TO STDOUT', roundtrip)
            if hashlib.sha256(roundtrip.getvalue()).hexdigest() != metadata['raw_sha256']:
                raise ValueError('Restored row values differ')
            log('restore_verified', project=metadata['project'], table=table, rows=count)
    finally:
        conn.rollback()


def run(args):
    os.umask(0o077)
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    archive = Archive()
    start = time.monotonic()
    now = dt.datetime.now(dt.timezone.utc)
    run_id = now.strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
    for project in ([args.project] if args.project else PROJECTS):
        lock = open(STATE / (project + '.lock'), 'w')
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            lock.close()
            log('already_running', project=project)
            continue
        conn = database(project)
        if args.restore_check:
            restore_check(conn, archive, args.restore_check)
            conn.close()
            return
        baseline = json.loads((STATE / 'schema-baseline.json').read_text())[project]
        with conn.cursor() as cur:
            actual = {table: table_columns(cur, table) for table in TABLES}
        conn.commit()
        if json.loads(json.dumps(actual)) != baseline:
            raise RuntimeError('Diagnostic schema changed; manual review required before retention')
        prefix = f'{PREFIX}/{project}/{run_id}'
        schema_key = archive_schema(project, archive, prefix) if not args.dry_run else None
        after = args.after or ''
        batch_runs = args.batch_runs
        total = {t: 0 for t in TABLES}
        for batch in range(args.max_batches):
            if time.monotonic() - start > args.max_seconds:
                log('time_budget', project=project, after=after)
                break
            free = os.statvfs('/').f_bavail * os.statvfs('/').f_frsize
            if free < args.min_free_gib * GIB:
                raise RuntimeError('Insufficient disk headroom; cleanup stopped before transaction')
            with conn.cursor() as cur:
                runs, next_after = candidates(cur, now, after, batch_runs)
            conn.commit()
            if next_after == after:
                log('project_complete', project=project, rows=total)
                break
            if runs:
                try:
                    result = process_batch(conn, archive, project, runs, now,
                        f'{prefix}/batch-{batch:06}', schema_key, args.dry_run)
                except BatchTooLarge:
                    if batch_runs == 1:
                        raise
                    batch_runs = max(1, batch_runs // 2)
                    log('batch_reduced_after_rollback', project=project, batch_runs=batch_runs)
                    continue
                except psycopg2.errors.QueryCanceled as error:
                    if 'statement timeout' not in str(error) or batch_runs <= 100:
                        raise
                    batch_runs = max(100, batch_runs // 2)
                    log('slow_batch_reduced_after_rollback', project=project, batch_runs=batch_runs)
                    continue
                for table, item in result.items():
                    total[table] += item['rows']
                record = {'project': project, 'batch': batch, 'runs': len(runs),
                          'after': next_after, 'dry_run': args.dry_run, 'tables': result}
                with open(STATE / 'batches.jsonl', 'a') as out:
                    out.write(json.dumps(record) + '\n')
                    out.flush()
                    os.fsync(out.fileno())
                log('batch_verified' if not args.dry_run else 'preview', **record)
            after = next_after
            time.sleep(args.pause)
        if not args.dry_run and any(total.values()) and not args.no_vacuum:
            conn.autocommit = True
            with conn.cursor() as cur:
                cur.execute("SET statement_timeout='30min'")
                for table in TABLES:
                    if total[table]:
                        cur.execute(f'VACUUM (ANALYZE) public.{table}')
                        log('vacuum_complete', project=project, table=table)
        conn.close()
        lock.close()
    log('finished', elapsed_seconds=round(time.monotonic() - start, 1))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', choices=PROJECTS)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--batch-runs', type=int, default=20000)
    parser.add_argument('--max-batches', type=int, default=5000)
    parser.add_argument('--max-seconds', type=int, default=5400)
    parser.add_argument('--min-free-gib', type=float, default=3)
    parser.add_argument('--pause', type=float, default=0.1)
    parser.add_argument('--after')
    parser.add_argument('--no-vacuum', action='store_true')
    parser.add_argument('--restore-check')
    run(parser.parse_args())
