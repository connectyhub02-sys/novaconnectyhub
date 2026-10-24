#!/usr/bin/env python3
"""One-time, explicitly selected table compaction; never called by the daily timer."""
import argparse
import fcntl
import os
import threading
import time

import retention


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True, choices=retention.PROJECTS)
    parser.add_argument('--table', required=True, choices=retention.TABLES)
    parser.add_argument('--required-free-gib', required=True, type=float)
    parser.add_argument('--operation', choices=('vacuum', 'reindex'), default='vacuum')
    args = parser.parse_args()
    lock = open(retention.STATE / (args.project + '.lock'), 'w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    conn = retention.database(args.project)
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM pg_stat_activity WHERE "
                    "application_name='connectyhub-retention' AND pid<>pg_backend_pid()")
        if cur.fetchone()[0]:
            raise RuntimeError('Another retention connection is still active in this database')
    conn.commit()
    conn.autocommit = True
    available = lambda: os.statvfs('/').f_bavail * os.statvfs('/').f_frsize / retention.GIB
    if available() < max(args.required_free_gib, 8):
        raise RuntimeError('Insufficient measured headroom for the requested table rewrite')
    stop = threading.Event()
    cancelled = threading.Event()

    def disk_guard():
        while not stop.wait(0.5):
            if available() < 5:
                cancelled.set()
                conn.cancel()
                return

    try:
        with conn.cursor() as cur:
            memory_limit = retention.inspect(retention.PROJECTS[args.project])['HostConfig']['Memory']
            maintenance_mb = min(256, max(16, memory_limit // (8 * 1024 ** 2))) if memory_limit else 128
            cur.execute("SET statement_timeout='45min'; SET lock_timeout='5s'; "
                        f"SET maintenance_work_mem='{maintenance_mb}MB'; SET max_parallel_maintenance_workers=0")
            cur.execute('SELECT pg_total_relation_size(%s::regclass)', (args.table,))
            before = cur.fetchone()[0]
            retention.log('compaction_start', project=args.project, table=args.table,
                          operation=args.operation, before_bytes=before, free_gib=round(available(), 2))
            watcher = threading.Thread(target=disk_guard, daemon=True)
            watcher.start()
            started = time.monotonic()
            try:
                statement = (f'VACUUM (FULL, ANALYZE) public.{args.table}'
                             if args.operation == 'vacuum' else f'REINDEX TABLE public.{args.table}')
                cur.execute(statement)
            finally:
                stop.set()
                watcher.join()
            cur.execute('SELECT pg_total_relation_size(%s::regclass)', (args.table,))
            after = cur.fetchone()[0]
            retention.log('compaction_complete', project=args.project, table=args.table,
                operation=args.operation,
                before_bytes=before, after_bytes=after, released_bytes=before-after,
                elapsed_seconds=round(time.monotonic()-started, 1), free_gib=round(available(), 2))
    finally:
        stop.set()
        conn.close()
        if cancelled.is_set():
            retention.log('compaction_cancelled_for_disk_headroom', project=args.project,
                          table=args.table)
        lock.close()


if __name__ == '__main__':
    main()
