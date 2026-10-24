import gzip
import hashlib
import os
import unittest
from unittest import mock

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import retention


class RetentionSafetyTests(unittest.TestCase):
    def archive(self):
        archive = object.__new__(retention.Archive)
        archive.cipher = AESGCM(os.urandom(32))
        return archive

    def test_encryption_roundtrip_and_authentication(self):
        archive = self.archive()
        raw = b'1\tprivate diagnostic\n2\t\\N\n'
        metadata = {'raw_sha256': hashlib.sha256(raw).hexdigest(), 'raw_bytes': len(raw)}
        blob = archive.pack('object-a', metadata, gzip.compress(raw))
        self.assertNotIn(b'private diagnostic', blob)
        self.assertEqual(archive.unpack('object-a', blob), (metadata, raw))
        with self.assertRaises(InvalidTag):
            archive.unpack('object-b', blob)
        with self.assertRaises(InvalidTag):
            archive.unpack('object-a', blob[:-1] + bytes([blob[-1] ^ 1]))

    def test_ulid_is_exact_128_bit_value(self):
        self.assertEqual(retention.ulid_bytes('0' * 26), bytes(16))
        self.assertEqual(retention.ulid_bytes('7' + 'Z' * 25), bytes([255]) * 16)
        for value in ('8' + '0' * 25, '0' * 25, '0' * 25 + 'I'):
            with self.assertRaises(ValueError):
                retention.ulid_bytes(value)

    def test_copy_limit_aborts_instead_of_growing_unbounded(self):
        buffer = retention.CopyBuffer()
        with mock.patch.object(retention, 'MAX_RAW', 8):
            buffer.write(b'12345678')
            with self.assertRaises(RuntimeError):
                buffer.write(b'9')

    def test_unapproved_table_cannot_be_selected(self):
        with self.assertRaises(ValueError):
            retention.table_columns(mock.Mock(), 'profiles')

    def test_remote_corruption_blocks_verification(self):
        archive = self.archive()
        archive.bucket = 'test'
        archive.s3 = mock.Mock()
        archive.s3.get_object.return_value = {'Body': mock.Mock(read=lambda: b'corrupted')}
        raw = b'private'
        metadata = {'raw_sha256': hashlib.sha256(raw).hexdigest(), 'raw_bytes': len(raw)}
        with self.assertRaises(ValueError):
            archive.put_verified('key', metadata, gzip.compress(raw))


if __name__ == '__main__':
    unittest.main()
