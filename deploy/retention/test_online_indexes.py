import unittest
from unittest.mock import patch
import online_indexes as online


class GuardTests(unittest.TestCase):
    def test_free_space_cancels_before_original_five_gib_floor(self):
        self.assertEqual(online.guard_reason(7.9, 12, 100, 0, 0), 'disk_headroom_below_8_gib')

    def test_connection_pressure_cancels_before_exhaustion(self):
        self.assertEqual(online.guard_reason(15, 80, 100, 0, 0), 'database_connection_pressure')

    def test_transient_lock_is_tolerated_but_persistent_lock_is_not(self):
        self.assertIsNone(online.guard_reason(15, 15, 100, 1, 1))
        self.assertEqual(online.guard_reason(15, 15, 100, 1, 3), 'queries_blocked_by_maintenance')
        self.assertEqual(online.guard_reason(15, 15, 100, 5, 1), 'queries_blocked_by_maintenance')

    def test_headroom_uses_current_size_not_tuple_estimates(self):
        self.assertEqual(online.required_gib(4 * 1024**3), 14)
        self.assertEqual(online.required_gib(1024**2), 10)


if __name__ == '__main__':
    unittest.main()
