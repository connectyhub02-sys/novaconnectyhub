import unittest
from collect import cpu_delta, service_delta


class MetricsTests(unittest.TestCase):
    def test_guest_time_is_not_double_counted(self):
        self.assertEqual(cpu_delta([30, 0, 10, 50, 10, 0, 0, 0, 30, 0], [0]*10), (40, 10))

    def test_reset_and_missing_sample_are_unknown(self):
        self.assertEqual(cpu_delta([0]*10, [1]*10), (None, None))
        current = dict(identity='new', cpu=dict(usage_usec=100))
        previous = dict(identity='old', cpu=dict(usage_usec=1000))
        self.assertEqual(service_delta(current, previous, 30), (None, None))

    def test_service_quota_saturation_uses_deltas_not_lifetime(self):
        previous = dict(identity='same', cpu=dict(usage_usec=1000000, nr_periods=1000, nr_throttled=200))
        current = dict(identity='same', cpu=dict(usage_usec=3500000, nr_periods=1100, nr_throttled=299))
        self.assertEqual(service_delta(current, previous, 10), (.25, 99))

    def test_unlimited_cpu_has_no_throttle_percentage(self):
        previous = dict(identity='same', cpu=dict(usage_usec=0))
        current = dict(identity='same', cpu=dict(usage_usec=2000000))
        self.assertEqual(service_delta(current, previous, 10), (.2, None))


if __name__ == '__main__':
    unittest.main()
