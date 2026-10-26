import copy
import datetime as dt
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import artifact_retention as retention

NOW = dt.datetime(2026, 10, 26, tzinfo=dt.timezone.utc).timestamp()
OLD = '2026-10-01T00:00:00Z'


def container(index=0):
    return dict(Id=str(index), Name=f'/vision-demo-admin-rollback-20261001-test-{index}', Created=OLD,
                Image='sha256:old', Config={'Image': 'node:22-alpine'},
                State={'Status': 'exited', 'Running': False, 'Restarting': False, 'FinishedAt': OLD},
                Mounts=[{'Type': 'bind', 'Source': '/opt/vision/app/releases/release-20261001-test'}])


class ArtifactRetentionTests(unittest.TestCase):
    @patch.object(Path, 'resolve', lambda self: self)
    def test_only_old_stopped_application_containers(self):
        row = container()
        self.assertTrue(retention.eligible_container(row, NOW))
        for mutation in [('running', {'Status': 'running', 'Running': True}), ('recent', {'FinishedAt': '2026-10-25T00:00:00Z'}), ('unknown', {'FinishedAt': 'invalid'})]:
            other = copy.deepcopy(row); other['State'].update(mutation[1])
            self.assertFalse(retention.eligible_container(other, NOW))
        for mount in [{'Type': 'volume', 'Source': '/database'}, {'Type': 'bind', 'Source': '/opt/vision/customer-data'}]:
            other = copy.deepcopy(row); other['Mounts'] = [mount]
            self.assertFalse(retention.eligible_container(other, NOW))
        other = copy.deepcopy(row); other['Name'] = '/supabase-db'
        self.assertFalse(retention.eligible_container(other, NOW))

    @patch.object(Path, 'resolve', lambda self: self)
    def test_keep_five_rollback_containers_even_when_all_old(self):
        rows = [container(i) for i in range(8)]
        self.assertEqual(len(retention.container_candidates(rows, NOW)), 3)

    def test_release_keeps_mounts_recent_recovery_floor_and_data(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            paths = []
            for i in range(12):
                p = root / f'release-20261001-test-{i}'; p.mkdir(); (p / 'server.js').write_text('fixture')
                os.utime(p, (NOW - 20 * retention.DAY + i, NOW - 20 * retention.DAY + i)); paths.append(p)
            (paths[1] / 'uploads').mkdir(); os.utime(paths[1], (NOW - 20 * retention.DAY,)*2)
            (paths[2] / 'public/uploads').mkdir(parents=True); os.utime(paths[2], (NOW - 20 * retention.DAY,)*2)
            rows = [{'Config': {'Image': 'node:22-alpine'}, 'Mounts': [{'Type': 'bind', 'Source': str(paths[0])}]}]
            with patch.object(retention, 'ROOTS', (root, root / 'other')):
                candidates = retention.release_candidates(root, rows, NOW)
            self.assertNotIn(paths[0], candidates); self.assertNotIn(paths[1], candidates)
            self.assertNotIn(paths[2], candidates)
            self.assertEqual(len(candidates), 4)
            self.assertTrue(all(p.is_dir() for p in paths))

    def test_images_preserve_used_newest_and_foreign_repositories(self):
        images = [dict(Id=str(i), Created=OLD, RepoTags=['connectyhub-app:' + f'{i:040x}']) for i in range(9)]
        images.append(dict(Id='foreign', Created=OLD, RepoTags=['postgres:17']))
        result = retention.image_candidates([{'Image': '8'}], images, NOW)
        self.assertEqual({r['Id'] for r in result}, {'5', '6', '7'})

    def test_unknown_dates_are_protected(self):
        self.assertEqual(retention.timestamp('unknown'), float('inf'))

    def test_path_guard_rejects_outside_root(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            with self.assertRaisesRegex(RuntimeError, 'unsafe_release_path'):
                retention.verify_delete_path(root, root / 'releases')


if __name__ == '__main__':
    unittest.main()
