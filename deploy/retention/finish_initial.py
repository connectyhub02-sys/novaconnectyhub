#!/usr/bin/env python3
"""Supervised one-time completion of the initial archive, with disk-space guards.

This is NOT a recurring compaction service. Only the daily archive has a timer.
"""
import json
import os
from pathlib import Path
import subprocess
import time

import retention

UNITS = {'connectyhub': 'connectyhub-retention-indexed.service',
         'vision': 'vision-retention-initial.service'}
STATUS = retention.STATE / 'initial-status.json'


def free_gib():
    return os.statvfs('/').f_bavail * os.statvfs('/').f_frsize / retention.GIB


def save(state):
    state['updated_at'] = retention.dt.datetime.now(retention.dt.timezone.utc).isoformat()
    state['free_gib'] = round(free_gib(), 3)
    pending = STATUS.with_suffix('.tmp')
    pending.write_text(json.dumps(state, indent=2))
    pending.chmod(0o600)
    pending.replace(STATUS)


def archive_finished(project):
    unit = UNITS[project]
    props = subprocess.check_output(['systemctl', 'show', unit, '-p', 'ActiveState', '-p', 'Result'], text=True)
    values = dict(line.split('=', 1) for line in props.splitlines() if '=' in line)
    if values['ActiveState'] in ('active', 'activating', 'deactivating'):
        return False
    if values.get('Result') != 'success':
        raise RuntimeError(project + ' initial archive service did not finish successfully')
    messages = subprocess.check_output(['journalctl', '-u', unit, '-o', 'cat', '--no-pager'], text=True)
    for line in messages.splitlines():
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        if entry.get('event') == 'project_complete' and entry.get('project') == project:
            return True
    raise RuntimeError(project + ' archive stopped before confirming all eligible runs were examined')


def required_space(project, table, operation='vacuum'):
    rows = [json.loads(line) for line in (retention.STATE / 'batches.jsonl').read_text().splitlines()]
    removed = sum(row['tables'][table]['rows'] for row in rows
                  if row['project'] == project and not row['dry_run'])
    conn = retention.database(project)
    with conn.cursor() as cur:
        cur.execute("SELECT n_live_tup,pg_total_relation_size(relid),pg_indexes_size(relid) "
                    "FROM pg_stat_user_tables WHERE relname=%s AND schemaname='public'", (table,))
        live, total, indexes = cur.fetchone()
    conn.close()
    # Account for uncertainty in tuple statistics and allow another 6 GiB for WAL/sorts.
    # The real-time guard in compact.py is authoritative if this estimate is too small.
    ratio = live / max(1, live + removed)
    source = total if operation == 'vacuum' else indexes
    required = max(8, source / retention.GIB * ratio * 1.35 + 6)
    return round(required, 2)


def compact(project, table, state, operation='vacuum'):
    required = required_space(project, table, operation)
    if free_gib() < required:
        retention.log('compaction_deferred', project=project, table=table,
                      operation=operation, required_free_gib=required, free_gib=round(free_gib(), 2))
        return False
    state['stage'] = f'{operation}:{project}:{table}'
    save(state)
    args = ['/usr/bin/python3', '/opt/connectyhub/retention/compact.py',
            '--project', project, '--table', table, '--operation', operation,
            '--required-free-gib', str(required)]
    result = subprocess.run(args, capture_output=True, text=True, timeout=3600)
    # Diagnostic helper only emits operation metadata, never customer row contents.
    print(result.stdout, flush=True)
    if result.returncode:
        retention.log('compaction_failed', project=project, table=table,
                      operation=operation, exit_code=result.returncode)
        state.setdefault('attempt_errors', []).append({'project': project, 'table': table,
                                                       'operation': operation, 'error': result.stderr[-1500:]})
        save(state)
        return False
    for line in result.stdout.splitlines():
        try:
            event = json.loads(line)
            if event.get('event') == 'compaction_complete':
                state.setdefault('completed_operations', []).append(event)
        except ValueError:
            continue
    save(state)
    return True


def main():
    os.umask(0o077)
    if STATUS.exists():
        raise RuntimeError('Initial maintenance already has a status record; do not repeat blindly')
    state = {'status': 'running', 'stage': 'waiting_for_archives', 'archived_projects': [],
             'compacted': [], 'completed_operations': []}
    save(state)
    started = time.monotonic()
    try:
        while len(state['archived_projects']) < len(UNITS):
            if time.monotonic() - started > 6 * 3600:
                raise RuntimeError('Initial archive wait exceeded six hours')
            for project in UNITS:
                if project not in state['archived_projects'] and archive_finished(project):
                    state['archived_projects'].append(project)
                    save(state)
                    # Recover the smaller tables as soon as their own project is done.
                    for table in ('traces', 'history', 'spans'):
                        if compact(project, table, state):
                            state['compacted'].append(project + ':' + table)
                            save(state)
            state['stage'] = 'waiting_for_archives'
            save(state)
            if len(state['archived_projects']) < len(UNITS):
                time.sleep(30)
        # Space released by the other project may make a previously deferred rewrite possible.
        for project in UNITS:
            for table in ('traces', 'history', 'spans'):
                identity = project + ':' + table
                if identity in state['compacted']:
                    continue
                success = compact(project, table, state)
                if not success and table == 'spans':
                    # Rebuilding the smaller indexes first can provide enough room for the heap.
                    if compact(project, table, state, operation='reindex'):
                        success = compact(project, table, state)
                if success:
                    state['compacted'].append(identity)
                    save(state)
        expected = {p + ':' + t for p in UNITS for t in retention.TABLES}
        if set(state['compacted']) != expected:
            raise RuntimeError('Some tables still require attention; no further automatic rewrite attempted')
        state['status'] = 'complete'
        state['stage'] = 'finished'
        save(state)
        retention.log('initial_cleanup_complete', free_gib=state['free_gib'])
    except Exception as error:
        state['status'] = 'attention_required'
        state['error'] = str(error)
        save(state)
        raise


if __name__ == '__main__':
    main()
