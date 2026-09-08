"""I/O boundary checks with no real DNS, sockets, or external HTTP requests."""
import hashlib
import io
import socket
import unittest
from unittest.mock import Mock, patch

from scoring_test_boundary import ScoringTestBoundaryError
from scoring_test_io import ScoringTestReadTransport, resolve_addresses, verified_upload, _PinnedHTTPS


def dns_answer(address):
    family = socket.AF_INET6 if ":" in address else socket.AF_INET
    return (family, socket.SOCK_STREAM, 6, "", (address, 443))


class DnsTests(unittest.TestCase):
    def test_public_address_deduplicated(self):
        with patch("scoring_test_io.socket.getaddrinfo", return_value=[dns_answer("8.8.8.8")] * 2):
            self.assertEqual(resolve_addresses("test.invalid", 443, "production-test"), ["8.8.8.8"])

    def test_private_mixed_and_special_answers_denied(self):
        for address in ("127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "0.0.0.0", "224.0.0.1"):
            with self.subTest(address=address), patch("scoring_test_io.socket.getaddrinfo",
                    return_value=[dns_answer("8.8.8.8"), dns_answer(address)]):
                with self.assertRaisesRegex(ScoringTestBoundaryError, "outbound-address-denied"):
                    resolve_addresses("test.invalid", 443, "production-test")

    def test_local_loopback_only(self):
        with patch("scoring_test_io.socket.getaddrinfo", return_value=[dns_answer("127.0.0.1"), dns_answer("::1")]):
            self.assertEqual(resolve_addresses("localhost", 8080, "local-emulator"), ["127.0.0.1", "::1"])
        with patch("scoring_test_io.socket.getaddrinfo", return_value=[dns_answer("8.8.8.8")]):
            with self.assertRaises(ScoringTestBoundaryError):
                resolve_addresses("localhost", 8080, "local-emulator")

    def test_empty_dns_denied(self):
        with patch("scoring_test_io.socket.getaddrinfo", return_value=[]):
            with self.assertRaisesRegex(ScoringTestBoundaryError, "empty-dns-answer"):
                resolve_addresses("test.invalid", 443, "production-test")


class TransportTests(unittest.TestCase):
    def setUp(self):
        self.headers = {}
        self.response = Mock(status=200)
        self.response.getheader.side_effect = lambda name, default=None: self.headers.get(name, default)
        self.response.read.return_value = b"{}"
        self.connection = Mock()
        self.connection.getresponse.return_value = self.response
        for name, target, kwargs in (
            ("dns", "scoring_test_io.resolve_addresses", {"return_value": ["8.8.8.8"]}),
            ("connection_factory", "scoring_test_io._PinnedHTTPS", {"return_value": self.connection}),
        ):
            patcher = patch(target, **kwargs)
            setattr(self, name, patcher.start())
            self.addCleanup(patcher.stop)
        flag = patch.dict("os.environ", {"SCORING_TEST_OUTBOUND_ENABLED": "true"})
        flag.start()
        self.addCleanup(flag.stop)
        self.transport = ScoringTestReadTransport(mode="production-test", origin="https://test.invalid",
            approved_origin="https://test.invalid", approved_paths=["/api/health"], max_response_bytes=4)

    def test_success_uses_pinned_address_and_closes(self):
        self.assertEqual(self.transport.get("/api/health"), b"{}")
        self.connection_factory.assert_called_once_with("test.invalid", 443, "8.8.8.8", 10)
        self.response.read.assert_called_once_with(5)
        self.connection.request.assert_called_once_with("GET", "/api/health",
            headers={"Accept": "application/json", "Accept-Encoding": "identity"})
        self.connection.close.assert_called_once()

    def test_disabled_before_dns(self):
        with patch.dict("os.environ", {"SCORING_TEST_OUTBOUND_ENABLED": "false"}):
            with self.assertRaisesRegex(ScoringTestBoundaryError, "test-outbound-disabled"):
                self.transport.get("/api/health")
        self.dns.assert_not_called()

    def test_unapproved_path_before_dns(self):
        with self.assertRaisesRegex(ScoringTestBoundaryError, "outbound-path-not-approved"):
            self.transport.get("/api/write")
        self.dns.assert_not_called()

    def test_redirect_rejected_without_following(self):
        self.response.status = 302
        self.headers["Location"] = "http://169.254.169.254/"
        with self.assertRaisesRegex(ScoringTestBoundaryError, "outbound-status-rejected"):
            self.transport.get("/api/health")
        self.assertEqual(self.connection.request.call_count, 1)
        self.response.read.assert_not_called()
        self.connection.close.assert_called_once()

    def test_compression_rejected(self):
        self.headers["Content-Encoding"] = "gzip"
        with self.assertRaisesRegex(ScoringTestBoundaryError, "outbound-encoding-rejected"):
            self.transport.get("/api/health")
        self.response.read.assert_not_called()
        self.connection.close.assert_called_once()

    def test_declared_size_exceeded_before_read(self):
        self.headers["Content-Length"] = "5"
        with self.assertRaisesRegex(ScoringTestBoundaryError, "response-too-large"):
            self.transport.get("/api/health")
        self.response.read.assert_not_called()

    def test_actual_size_exceeded(self):
        self.response.read.return_value = b"12345"
        with self.assertRaisesRegex(ScoringTestBoundaryError, "response-too-large"):
            self.transport.get("/api/health")
        self.connection.close.assert_called_once()

    def test_truncated_response(self):
        self.headers["Content-Length"] = "4"
        with self.assertRaisesRegex(ScoringTestBoundaryError, "incomplete-response"):
            self.transport.get("/api/health")

    def test_read_failure_closes_connection(self):
        self.response.read.side_effect = TimeoutError("inactivity")
        with self.assertRaises(TimeoutError):
            self.transport.get("/api/health")
        self.connection.close.assert_called_once()


class TlsTests(unittest.TestCase):
    def test_numeric_connection_and_original_hostname(self):
        raw, context = Mock(), Mock()
        with patch("scoring_test_io.socket.create_connection", return_value=raw) as connect, \
                patch("scoring_test_io.ssl.create_default_context", return_value=context):
            connection = _PinnedHTTPS("test.invalid", 443, "8.8.8.8", 10)
            connection.connect()
            connect.assert_called_once_with(("8.8.8.8", 443), 10)
            context.wrap_socket.assert_called_once_with(raw, server_hostname="test.invalid")
            connection.close()

    def test_tls_failure_closes_raw_socket(self):
        raw, context = Mock(), Mock()
        context.wrap_socket.side_effect = OSError("invalid certificate")
        with patch("scoring_test_io.socket.create_connection", return_value=raw), \
                patch("scoring_test_io.ssl.create_default_context", return_value=context):
            with self.assertRaises(OSError):
                _PinnedHTTPS("test.invalid", 443, "8.8.8.8", 10).connect()
        raw.close.assert_called_once()


class UploadTests(unittest.TestCase):
    def stage(self, body, expected_bytes=3, digest=None, max_bytes=4):
        return verified_upload(io.BytesIO(body), expected_bytes=expected_bytes,
            expected_sha256=digest or hashlib.sha256(b"abc").hexdigest(), max_bytes=max_bytes)

    def test_success_rewound_and_closed(self):
        with self.stage(b"abc") as stream:
            self.assertEqual(stream.tell(), 0)
            self.assertEqual(stream.read(), b"abc")
        self.assertTrue(stream.closed)

    def test_consumer_failure_closes(self):
        with self.assertRaises(RuntimeError):
            with self.stage(b"abc") as stream:
                raise RuntimeError("persistence failed")
        self.assertTrue(stream.closed)

    def test_short_and_long_rejected(self):
        for body in (b"ab", b"abcd"):
            with self.subTest(body=body), self.assertRaisesRegex(ScoringTestBoundaryError, "upload-size-mismatch"):
                with self.stage(body):
                    self.fail("unverified stream exposed")

    def test_hash_failure_cleans_temporary_file(self):
        temporary = io.BytesIO()
        with patch("scoring_test_io.tempfile.SpooledTemporaryFile", return_value=temporary):
            with self.assertRaisesRegex(ScoringTestBoundaryError, "upload-hash-mismatch"):
                with self.stage(b"xyz"):
                    self.fail("unverified stream exposed")
        self.assertTrue(temporary.closed)

    def test_limit_before_read(self):
        source = Mock()
        with self.assertRaisesRegex(ScoringTestBoundaryError, "upload-size-rejected"):
            with verified_upload(source, expected_bytes=5, expected_sha256="a" * 64, max_bytes=4):
                self.fail("oversized upload accepted")
        source.read.assert_not_called()

    def test_stream_error_cleans_temporary_file(self):
        temporary, source = io.BytesIO(), Mock()
        source.read.side_effect = OSError("disconnected")
        with patch("scoring_test_io.tempfile.SpooledTemporaryFile", return_value=temporary):
            with self.assertRaises(OSError):
                with verified_upload(source, expected_bytes=3, expected_sha256="a" * 64, max_bytes=4):
                    self.fail("broken stream accepted")
        self.assertTrue(temporary.closed)

    def test_empty_upload(self):
        with self.stage(b"", expected_bytes=0, digest=hashlib.sha256(b"").hexdigest()) as stream:
            self.assertEqual(stream.read(), b"")


if __name__ == "__main__":
    unittest.main()
