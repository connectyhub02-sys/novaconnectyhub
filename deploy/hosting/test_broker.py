import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('broker', Path(__file__).with_name('broker.py'))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)


def container(name='project-app', running=True):
    return {'Id': 'a' * 64, 'Name': '/' + name, 'Config': {'Image': 'node:test', 'Labels': {}},
            'Mounts': [], 'State': {'Running': running}, 'HostConfig': {'RestartPolicy': {'Name': 'always', 'MaximumRetryCount': 0}}}


class BrokerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        b.ROOT = Path(self.temp.name)
        (b.ROOT / 'state').mkdir()
        b.PROJECTS = {'demo': {'compose': {'demo-db': '/opt/demo/db'}, 'standalone': {'project-app': 'node:test'}, 'directories': ['/opt/demo'], 'volumes': ['demo-data'], 'allowDelete': True}}
        self.c = container()

    def tearDown(self):
        self.temp.cleanup()

    def test_ownership_not_prefix_or_friendly_name(self):
        cfg = b.config('demo')
        self.assertTrue(b.belongs(self.c, cfg))
        self.assertFalse(b.belongs(container('demo-unreviewed'), cfg))
        wrong = copy.deepcopy(self.c)
        wrong['Config']['Image'] = 'unknown'
        self.assertFalse(b.belongs(wrong, cfg))
        with self.assertRaises(b.Rejected):
            b.config('connectyhub')

    def test_config_rejects_cross_project_ownership(self):
        cfg = b.PROJECTS['demo']
        b.validate_config({'demo': cfg})
        for key in ['standalone', 'compose', 'volumes']:
            other = {'standalone': {}, 'compose': {}, 'volumes': [], 'directories': ['/opt/other']}
            other[key] = copy.deepcopy(cfg[key])
            with self.assertRaises(b.Rejected):
                b.validate_config({'demo': cfg, 'other': other})
        with self.assertRaises(b.Rejected):
            b.validate_config({'a': cfg, 'b': {'standalone': {}, 'compose': {}, 'volumes': [], 'directories': ['/opt/demo/subdir']}})

    def test_shared_and_unreviewed_mounts_block(self):
        other = container('another-customer')
        other['Id'] = 'b' * 64
        other['Mounts'] = [{'Type': 'bind', 'Source': '/opt/demo/db'}]
        with self.assertRaises(b.Rejected):
            b.inventory('demo', [self.c, other])
        self.c['Mounts'] = [{'Type': 'bind', 'Source': '/etc'}]
        with self.assertRaises(b.Rejected):
            b.inventory('demo', [self.c])

    def test_platform_directories_cannot_be_deleted_under_another_project_name(self):
        b.PROJECTS['demo']['directories'] = ['/opt/connectyhub/app']
        with self.assertRaises(b.Rejected):
            b.inventory('demo', [self.c])

    def test_delete_requires_quarantine_and_current_revision(self):
        with patch.object(b, 'inventory', return_value=([self.c], [])):
            p = b.preview('demo')
            self.assertNotIn('delete', p['actions'])
            with self.assertRaises(b.Rejected):
                b.apply('demo', {'action': 'delete', 'revision': p['revision'], 'requestId': '0' * 36, 'actor': '1' * 36})
            with self.assertRaises(b.Rejected):
                b.apply('demo', {'action': 'pause', 'revision': 'old', 'requestId': '0' * 36, 'actor': '1' * 36})

    def test_pause_persists_restart_policy_before_effect_and_idempotency(self):
        with patch.object(b, 'inventory', return_value=([self.c], [])), patch.object(b.threading, 'Thread') as worker:
            p = b.preview('demo')
            payload = {'action': 'pause', 'revision': p['revision'], 'requestId': '0' * 36, 'actor': '1' * 36}
            b.apply('demo', payload)
            self.assertEqual(b.state('demo')['saved'][self.c['Id']]['restart']['Name'], 'always')
            self.assertEqual(b.state('demo')['operation']['status'], 'running')
            b.apply('demo', payload)
            self.assertEqual(worker.call_count, 1)

    def test_failure_never_claims_completed(self):
        s = b.state('demo')
        s['operation'] = {'id': 'op', 'action': 'pause', 'status': 'running'}
        b.save('demo', s)
        with patch.object(b, 'inventory', return_value=([self.c], [])), patch.object(b, 'docker', side_effect=RuntimeError()):
            b.execute('demo', {'action': 'pause', 'requestId': 'op'}, [self.c], [])
        self.assertEqual(b.state('demo')['state'], 'error')
        self.assertEqual(b.state('demo')['operation']['status'], 'failed_review_required')

    def test_running_receipt_does_not_wait_for_docker_stop(self):
        with patch.object(b, 'inventory', return_value=([self.c], [])), patch.object(b.threading, 'Thread'):
            p = b.preview('demo')
            b.apply('demo', {'action': 'pause', 'revision': p['revision'], 'requestId': '0' * 36, 'actor': '1' * 36})
        with patch.object(b, 'inventory', side_effect=RuntimeError('Docker blocked during graceful stop')):
            p = b.preview('demo')
        self.assertEqual(p['operation']['status'], 'running')
        self.assertEqual(p['actions'], [])

    def test_resume_only_previously_running_containers(self):
        old = container('old-release', False)
        old['Id'] = 'b' * 64
        s = b.state('demo')
        s.update(state='paused', saved={c['Id']: {'running': c['State']['Running'], 'restart': c['HostConfig']['RestartPolicy']} for c in [self.c, old]}, operation={'id': 'op', 'action': 'resume', 'status': 'running'})
        b.save('demo', s)
        with patch.object(b, 'inventory', return_value=([self.c, old], [])), patch.object(b, 'docker') as docker:
            b.execute('demo', {'action': 'resume', 'requestId': 'op'}, [self.c, old], [])
        self.assertIn(unittest.mock.call('start', self.c['Id']), docker.call_args_list)
        self.assertNotIn(unittest.mock.call('start', old['Id']), docker.call_args_list)


if __name__ == '__main__':
    unittest.main()
