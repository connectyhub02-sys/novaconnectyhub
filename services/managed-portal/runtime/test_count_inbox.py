import importlib.util
import pathlib
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('inbox_count', pathlib.Path(__file__).with_name('count-inbox.py'))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class InboxCountTests(unittest.TestCase):
    def test_wal_rows_and_source_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            source = pathlib.Path(directory) / 'source.sqlite'
            db = sqlite3.connect(source)
            try:
                db.execute('pragma journal_mode=WAL')
                db.execute('pragma wal_autocheckpoint=0')
                db.execute('create table owner(kind text)')
                db.execute("insert into owner values('betel-webhook-held-v1')")
                db.execute('create table events(state text)')
                db.executemany('insert into events values(?)', [('held',), ('held',), ('other',)])
                db.commit()
                before = mod._snapshot(source)
                self.assertTrue(before[1])
                self.assertEqual(mod.held_count(source), 2)
                self.assertEqual(mod._snapshot(source), before)
            finally:
                db.close()
            # After the writer closes, SQLite removes WAL/SHM, but WAL mode remains.
            self.assertEqual(mod.held_count(source), 2)

    def test_unstable_snapshot_fails_closed(self):
        with patch.object(mod, '_snapshot', side_effect=[(b'a', None), (b'b', None)] * 3):
            with self.assertRaises(RuntimeError):
                mod.held_count('unused')

    def test_bounded_read(self):
        with tempfile.TemporaryDirectory() as directory:
            source = pathlib.Path(directory) / 'large.sqlite'
            source.write_bytes(b'12345')
            with patch.object(mod, 'MAX_BYTES', 4):
                with self.assertRaises(ValueError):
                    mod.held_count(source)


if __name__ == '__main__':
    unittest.main()
