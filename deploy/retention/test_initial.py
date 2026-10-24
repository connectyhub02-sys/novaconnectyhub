import unittest
from unittest import mock

import finish_initial


class InitialMaintenanceTests(unittest.TestCase):
    def test_active_archive_cannot_trigger_compaction(self):
        with mock.patch.object(finish_initial.subprocess, 'check_output',
                               return_value='ActiveState=active\nResult=success\n') as command:
            self.assertFalse(finish_initial.archive_finished('connectyhub'))
            self.assertEqual(command.call_count, 1)

    def test_success_exit_is_not_proof_that_all_batches_finished(self):
        with mock.patch.object(finish_initial.subprocess, 'check_output', side_effect=[
                'ActiveState=inactive\nResult=success\n', '{"event":"time_budget"}\n']):
            with self.assertRaises(RuntimeError):
                finish_initial.archive_finished('vision')

    def test_completion_requires_project_specific_evidence(self):
        with mock.patch.object(finish_initial.subprocess, 'check_output', side_effect=[
                'ActiveState=inactive\nResult=success\n',
                '{"event":"project_complete","project":"vision"}\n']):
            self.assertTrue(finish_initial.archive_finished('vision'))

    def test_insufficient_headroom_does_not_start_rewrite(self):
        with mock.patch.object(finish_initial, 'required_space', return_value=30), \
             mock.patch.object(finish_initial, 'free_gib', return_value=12), \
             mock.patch.object(finish_initial.subprocess, 'run') as command:
            self.assertFalse(finish_initial.compact('vision', 'spans', {}))
            command.assert_not_called()


if __name__ == '__main__':
    unittest.main()
