#!/usr/bin/env python3
"""One index at a time, concurrently. No row deletion or heap rewrite.

Independent checkpoint; never resumes the interrupted blocking controller.
Cancellation can leave a transient invalid index; stop for review, never drop
an index automatically. The original indexes/data remain PostgreSQL-managed.
"""
import argparse
import fcntl
import json
import os
import signal
import threading
import time

from psycopg2 import sql
import retention

STATUS = retention.STATE / 'online-index-status.json'
WRITE_LOCK = threading.Lock()


def free_gib():
    v = os.statvfs('/')
    return v.f_bavail * v.f_frsize / retention.GIB


def guard_reason(free, connections, maximum, blocked, blocked_samples):
    if free < 8:
        return 'disk_headroom_below_8_gib'
    if connections >= maximum * 0.8:
        return 'database_connection_pressure'
    if blocked >= 5 or (blocked and blocked_samples >= 3):
        return 'queries_blocked_by_maintenance'
    return None


def required_gib(index_bytes):
    # Two index-sized allocations plus six GiB for WAL/sorts; runtime guard
    # uses actual free bytes. Never rely on stale n_live_tup ratios here.
    return max(10, 2 * index_bytes / retention.GIB + 6)


def save(state, **updates):
    with WRITE_LOCK:
        state.update(updates)
        state['updated_at'] = retention.dt.datetime.now(retention.dt.timezone.utc).isoformat()
        state['free_gib'] = round(free_gib(), 3)
        temporary = STATUS.with_suffix('.tmp')
        temporary.write_text(json.dumps(state, indent=2))
        temporary.chmod(0o600)
        temporary.replace(STATUS)


def connect(project, name):
    c = retention.database(project)
    c.autocommit = True
    with c.cursor() as cur:
        cur.execute('SET application_name=%s', (name,))
    return c


def inventory(project):
    c = connect(project, 'connectyhub-online-index-inventory')
    try:
        with c.cursor() as cur:
            cur.execute("SELECT t.relname,i.relname,pg_relation_size(i.oid),x.indisvalid "
                        "FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid "
                        "JOIN pg_class t ON t.oid=x.indrelid "
                        "JOIN pg_namespace n ON n.oid=t.relnamespace "
                        "WHERE n.nspname='public' AND t.relname=ANY(%s) "
                        "ORDER BY pg_relation_size(i.oid) DESC", (list(retention.TABLES),))
            rows = cur.fetchall()
        if any(not row[3] for row in rows):
            raise RuntimeError('invalid_index_requires_review')
        # ConnectyHub traces/history were already compacted successfully.
        return [dict(project=project, table=t, index=i, initial_bytes=size)
                for t, i, size, _ in rows if project != 'connectyhub' or t == 'spans']
    finally:
        c.close()


def rebuild(item, state):
    project, index, table = item['project'], item['index'], item['table']
    with open(retention.STATE / (project + '.lock'), 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        c = connect(project, 'connectyhub-online-index-worker')
        monitor = connect(project, 'connectyhub-online-index-guard')
        stop = threading.Event()
        cancelled = []
        watcher = None
        previous_handler = None
        try:
            with c.cursor() as cur:
                cur.execute("SELECT pg_backend_pid(),current_setting('max_connections')::int")
                pid, maximum = cur.fetchone()
                cur.execute("SELECT x.indexrelid,x.indrelid,pg_relation_size(x.indexrelid),x.indisvalid "
                            "FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid "
                            "JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace "
                            "WHERE n.nspname='public' AND i.relname=%s AND t.relname=%s", (index, table))
                row = cur.fetchone()
                if not row or not row[3]:
                    raise RuntimeError('index_missing_or_invalid')
                oid, table_oid, before, _ = row
                if free_gib() < required_gib(before):
                    raise RuntimeError('insufficient_headroom_for_next_index')
                cur.execute("SET statement_timeout='3h'; SET lock_timeout='2s'; "
                            "SET maintenance_work_mem='64MB'; SET max_parallel_maintenance_workers=0")
            with monitor.cursor() as cur:
                cur.execute("SET statement_timeout='3s'; SET lock_timeout='1s'")
            # Autovacuum owns the same maintenance lock. Wait without blocking
            # user queries or starting an index which cannot obtain its lock.
            for _ in range(90):
                with monitor.cursor() as cur:
                    cur.execute('SELECT count(*) FROM pg_stat_progress_vacuum WHERE relid=%s', (table_oid,))
                    busy = cur.fetchone()[0]
                if not busy:
                    break
                save(state, stage='waiting_for_autovacuum', current=item)
                time.sleep(20)
            else:
                raise RuntimeError('autovacuum_still_active_after_30_minutes')

            def cancel(reason):
                if not cancelled:
                    cancelled.append(reason)
                    c.cancel()

            def watch():
                blocked_samples = 0
                while not stop.wait(2):
                    try:
                        with monitor.cursor() as cur:
                            cur.execute("SELECT count(*),count(*) FILTER (WHERE %s=ANY(pg_blocking_pids(pid))) "
                                        "FROM pg_stat_activity WHERE backend_type='client backend'", (pid,))
                            connections, blocked = cur.fetchone()
                            blocked_samples = blocked_samples + 1 if blocked else 0
                            reason = guard_reason(free_gib(), connections, maximum, blocked, blocked_samples)
                            if reason:
                                cancel(reason)
                                return
                            cur.execute("SELECT phase,blocks_total,blocks_done,tuples_total,tuples_done "
                                        "FROM pg_stat_progress_create_index WHERE pid=%s", (pid,))
                            progress = cur.fetchone()
                        save(state, connections=connections, blocked_by_maintenance=blocked,
                             progress=dict(zip(['phase', 'blocks_total', 'blocks_done', 'tuples_total', 'tuples_done'], progress)) if progress else None)
                    except Exception:
                        cancel('monitor_unavailable')
                        return

            save(state, stage='reindex_concurrently', current=item, progress=None)
            watcher = threading.Thread(target=watch, daemon=True)
            watcher.start()
            previous_handler = signal.signal(signal.SIGTERM, lambda *_: cancel('service_stop_requested'))
            start = time.monotonic()
            try:
                with c.cursor() as cur:
                    cur.execute(sql.SQL('REINDEX INDEX CONCURRENTLY {}.{}').format(sql.Identifier('public'), sql.Identifier(index)))
            finally:
                stop.set()
                watcher.join(timeout=10)
            if cancelled:
                raise RuntimeError(cancelled[0])
            with c.cursor() as cur:
                cur.execute("SELECT pg_relation_size(indexrelid),indisvalid FROM pg_index "
                            "WHERE indexrelid=to_regclass(%s)", ('public.' + index,))
                after, valid = cur.fetchone()
                cur.execute('SELECT count(*) FROM pg_index WHERE indrelid=%s AND NOT indisvalid', (table_oid,))
                if not valid or cur.fetchone()[0]:
                    raise RuntimeError('index_validation_requires_review')
            return {**item, 'before_bytes': before, 'after_bytes': after,
                    'released_bytes': before - after, 'elapsed_seconds': round(time.monotonic() - start, 1)}
        except Exception as error:
            # SQL error text can include values; retain only class/code/reason.
            reason = cancelled[0] if cancelled else (str(error) if isinstance(error, RuntimeError) else type(error).__name__)
            save(state, status='attention_required', stage='stopped', error=reason,
                 sqlstate=getattr(error, 'pgcode', None))
            raise RuntimeError(reason) from None
        finally:
            stop.set()
            if watcher:
                watcher.join(timeout=10)
            if previous_handler is not None:
                signal.signal(signal.SIGTERM, previous_handler)
            monitor.close()
            c.close()


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('--resume', action='store_true')
    args = parser.parse_args()
    with open(retention.STATE / 'online-indexes.lock', 'w') as singleton:
        fcntl.flock(singleton, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if STATUS.exists():
            state = json.loads(STATUS.read_text())
            if not args.resume or state['status'] not in ('running', 'attention_required'):
                raise RuntimeError('existing_checkpoint_requires_explicit_review')
            # Interrupted concurrent builds may leave scratch indexes. Do not
            # resume or drop anything until a reviewed inventory is valid.
            for project in retention.PROJECTS:
                inventory(project)
        else:
            previous = json.loads((retention.STATE / 'initial-status.json').read_text())
            if set(previous.get('archived_projects', [])) != set(retention.PROJECTS):
                raise RuntimeError('archives_not_complete')
            plan = [item for project in retention.PROJECTS for item in inventory(project)]
            state = dict(status='running', stage='prepared', plan=plan, completed=[],
                         initial_free_gib=round(free_gib(), 3))
        save(state, status='running', error=None)
        try:
            done = {(i['project'], i['index']) for i in state['completed']}
            for item in state['plan']:
                if (item['project'], item['index']) in done:
                    continue
                result = rebuild(item, state)
                state['completed'].append(result)
                save(state)
                retention.log('online_index_complete', **result)
                time.sleep(5)
            save(state, status='complete', stage='finished', current=None, progress=None)
        except Exception as error:
            save(state, status='attention_required', stage='stopped',
                 error=str(error) if isinstance(error, RuntimeError) else type(error).__name__)
            raise


if __name__ == '__main__':
    main()
