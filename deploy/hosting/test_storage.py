import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
import storage


def page(objects, truncated=False, token='next'):
    root = ET.Element('ListBucketResult', xmlns='http://s3.amazonaws.com/doc/2006-03-01/')
    for key, size in objects:
        obj = ET.SubElement(root, 'Contents')
        ET.SubElement(obj, 'Key').text = key
        ET.SubElement(obj, 'Size').text = str(size)
    ET.SubElement(root, 'IsTruncated').text = str(truncated).lower()
    if truncated:
        ET.SubElement(root, 'NextContinuationToken').text = token
    return ET.fromstring(ET.tostring(root))


class StorageTests(unittest.TestCase):
    def test_old_release_is_measured_without_expanding_destructive_inventory(self):
        cfg = {'directories': ['/opt/vision']}
        item = {'Id': 'old', 'Name': '/vision-demo-admin-rollback-20261001-example',
                'Config': {'Image': 'node:22-alpine'},
                'Mounts': [{'Type': 'bind', 'Source': '/opt/vision/app/releases/release-20261001-example'}]}
        with patch.object(storage.broker, 'config', return_value=cfg), patch.object(storage.broker, 'belongs', return_value=False), patch.object(storage.Path, 'resolve', lambda self: self), patch.object(storage.broker, 'inventory', return_value=([], [])) as inventory:
            selected, _ = storage.measurement_inventory('vision', [item])
            self.assertEqual(selected, [item])
            inventory.assert_called_once_with('vision', [])

    def test_foreign_mount_still_reaches_strict_ownership_guard(self):
        item = {'Id': 'foreign', 'Name': '/vision-demo-admin-rollback-20261001-example',
                'Config': {'Image': 'node:22-alpine'},
                'Mounts': [{'Type': 'bind', 'Source': '/opt/other/customer-data'}]}
        with patch.object(storage.broker, 'config', return_value={'directories': ['/opt/vision']}), patch.object(storage.broker, 'belongs', return_value=False), patch.object(storage.broker, 'inventory', side_effect=ValueError('foreign_owner')) as inventory:
            with self.assertRaisesRegex(ValueError, 'foreign_owner'):
                storage.measurement_inventory('vision', [item])
            inventory.assert_called_once_with('vision', [item])

    def test_pagination_and_safe_aggregate_only(self):
        with patch.object(storage, 'list_page', side_effect=[page([('private/person%20one.JPG', 10)], True), page([('private/voice.opus', 20)])]) as fetch:
            totals, count = storage.measure_bucket('account', 'bucket', 'access', 'secret')
        self.assertEqual(totals, {'images': 10, 'audio': 20})
        self.assertEqual(count, 2)
        self.assertEqual(fetch.call_args.args[-1], 'next')
        self.assertNotIn('person', json.dumps(storage.components(totals)))

    def test_incomplete_listing_is_not_reported_as_total(self):
        with patch.object(storage, 'list_page', return_value=page([('x.png', 10)], True)):
            with self.assertRaisesRegex(ValueError, 'incomplete_listing'):
                storage.measure_bucket('a', 'b', 'c', 'd')

    def test_empty_bucket_is_real_zero(self):
        with patch.object(storage, 'list_page', return_value=page([])):
            self.assertEqual(storage.measure_bucket('a', 'b', 'c', 'd'), ({}, 0))

    def test_deadline_rejects_partial_total(self):
        with patch.object(storage.time, 'monotonic', side_effect=[0, 0, 241]), patch.object(storage, 'list_page', return_value=page([('x.png', 10)], True)):
            with self.assertRaisesRegex(ValueError, 'listing_timeout'):
                storage.measure_bucket('a', 'b', 'c', 'd')

    def test_bucket_or_owner_change_rejects_mapping(self):
        item = dict(container='app', accountEnv='A', bucketEnv='B', accessEnv='K', secretEnv='S', accountHash=storage.hashlib.sha256(b'account').hexdigest(), bucket='bucket')
        container = {'Name': '/app', 'Config': {'Env': ['A=account', 'B=bucket', 'K=access', 'S=secret']}}
        with patch.object(storage.broker, 'config', return_value={}), patch.object(storage.broker, 'belongs', return_value=True):
            self.assertEqual(len(storage.r2_sources({'vision': [item]}, [container])['vision']), 1)
            with self.assertRaisesRegex(ValueError, 'shared_bucket'):
                storage.r2_sources({'vision': [item], 'other': [item]}, [container])
            with self.assertRaisesRegex(ValueError, 'r2_scope_changed'):
                storage.r2_sources({'vision': [dict(item, bucket='other')]}, [container])
        with patch.object(storage.broker, 'config', return_value={}), patch.object(storage.broker, 'belongs', return_value=False):
            with self.assertRaisesRegex(ValueError, 'foreign_credentials'):
                storage.r2_sources({'vision': [item]}, [container])

    def test_deleted_hosting_does_not_invalidate_other_r2_sources(self):
        item = dict(container='app', accountEnv='A', bucketEnv='B', accessEnv='K', secretEnv='S', accountHash=storage.hashlib.sha256(b'account').hexdigest(), bucket='bucket')
        container = {'Name': '/app', 'Config': {'Env': ['A=account', 'B=bucket', 'K=access', 'S=secret']}}
        settings = {'deleted': [dict(item, container='removed')], 'vision': [item]}
        with patch.object(storage.broker, 'state', side_effect=lambda project: {'state': 'deleted' if project == 'deleted' else 'active'}), patch.object(storage.broker, 'config', return_value={}), patch.object(storage.broker, 'belongs', return_value=True):
            sources = storage.r2_sources(settings, [container])
        self.assertEqual(list(sources), ['vision'])
        self.assertEqual(len(sources['vision']), 1)

    @unittest.skipUnless(os.name == 'posix', 'GNU du and inode accounting on host')
    def test_disjoint_disk_categories_hardlinks_and_symlink(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'project'; root.mkdir()
            (root / 'app').mkdir(); (root / 'demo/db').mkdir(parents=True)
            (root / 'app/file').write_bytes(b'x' * 8192)
            os.link(root / 'app/file', root / 'app/linked')
            (root / 'demo/db/file').write_bytes(b'x' * 16384)
            outside = Path(temporary) / 'foreign'; outside.mkdir()
            (outside / 'secret').write_bytes(b'x' * 1048576)
            (root / 'outside').symlink_to(outside, target_is_directory=True)
            totals = storage.measure_paths(storage.partition(root, {'app': 'applications', 'demo/db': 'database'}))
            actual = int(storage.subprocess.check_output(['du', '-P', '-x', '-B1', '-s', str(root)]).split()[0])
            self.assertEqual(sum(totals.values()), actual)
            self.assertLess(actual, 1048576)
            self.assertGreater(totals['database'], totals['applications'])


if __name__ == '__main__':
    unittest.main()
