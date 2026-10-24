"""Explicit opt-in: tests only temporary tables in a live PostgreSQL connection."""
import datetime as dt
import os
import unittest

import psycopg2
import retention


@unittest.skipUnless(os.environ.get('RETENTION_TEMP_TABLE_TEST') == '1',
                     'Requires explicit opt-in to temporary-table integration test')
class EligibilityTests(unittest.TestCase):
    def test_active_recent_disagreeing_and_unknown_runs_are_preserved(self):
        conn = retention.database('connectyhub')
        now = dt.datetime.now(dt.timezone.utc)
        cases = [
            # trace status, trace age, finish status, finish age, expected removal
            (300, 8, 'Completed', 8, True),
            (200, 40, 'Completed', 40, False),
            (100, 40, None, 40, False),
            (300, 6, 'Completed', 6, False),
            (300, 8, 'Completed', 6, False),
            (300, 40, 'Failed', 40, False),
            (300, 40, None, 40, False),
            (400, 8, 'Failed', 8, False),
            (400, 31, 'Failed', 31, True),
            (500, 31, 'Cancelled', 31, True),
            (0, 40, 'Completed', 40, False),
        ]
        expected = []
        try:
            with conn.cursor() as cur:
                cur.execute('CREATE TEMP TABLE trace_runs(run_id character(26),status int,ended_at bigint)')
                cur.execute('CREATE TEMP TABLE function_finishes(run_id bytea,status text,created_at timestamp)')
                for index, (status, days, finish, finish_days, removable) in enumerate(cases):
                    run_id = str(index + 1).zfill(26)
                    cur.execute('INSERT INTO pg_temp.trace_runs VALUES(%s,%s,%s)',
                                (run_id, status, int((now-dt.timedelta(days=days)).timestamp()*1000)))
                    if finish:
                        cur.execute('INSERT INTO pg_temp.function_finishes VALUES(%s,%s,%s)',
                            (psycopg2.Binary(retention.ulid_bytes(run_id)), finish,
                             now-dt.timedelta(days=finish_days)))
                    if removable:
                        expected.append(run_id)
                actual, _ = retention.candidates(cur, now, '', 100)
                self.assertEqual(actual, expected)
        finally:
            conn.rollback()
            conn.close()


if __name__ == '__main__':
    unittest.main()
