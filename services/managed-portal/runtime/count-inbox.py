"""Read a consistent, bounded SQLite/WAL snapshot without touching source files."""
import pathlib
import sqlite3
import tempfile

MAX_BYTES = 16 * 1024 * 1024


def _snapshot(source):
    result = []
    total = 0
    for path in (source, pathlib.Path(str(source) + '-wal')):
        try:
            with path.open('rb') as stream:
                content = stream.read(MAX_BYTES + 1)
        except FileNotFoundError:
            if path == source:
                raise
            content = None
        total += len(content or b'')
        if total > MAX_BYTES:
            raise ValueError('Inbox snapshot exceeds read budget')
        result.append(content)
    return tuple(result)


def held_count(source):
    source = pathlib.Path(source)
    for _ in range(3):
        snapshot = _snapshot(source)
        if snapshot != _snapshot(source):
            continue
        # SQLite may need a writable SHM even when opened with mode=ro. Only
        # ephemeral scratch files are writable; source DB/WAL remain untouched.
        with tempfile.TemporaryDirectory(prefix='betel-inbox-read-') as directory:
            target = pathlib.Path(directory) / 'inbox.sqlite'
            target.write_bytes(snapshot[0])
            if snapshot[1]:
                pathlib.Path(str(target) + '-wal').write_bytes(snapshot[1])
            db = sqlite3.connect(target.as_uri() + '?mode=ro', uri=True)
            try:
                if db.execute('pragma quick_check').fetchall() != [('ok',)]:
                    raise ValueError('Invalid inbox snapshot')
                if db.execute('select kind from owner').fetchall() != [('betel-webhook-held-v1',)]:
                    raise ValueError('Wrong inbox identity')
                return db.execute("select count(*) from events where state='held'").fetchone()[0]
            finally:
                db.close()
    raise RuntimeError('Inbox changed during read; retry on next collection')
