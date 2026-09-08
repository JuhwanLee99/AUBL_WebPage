"""Opt-in test I/O primitives. No endpoint registration or legacy NAS fallback."""
import hashlib
import http.client
import ipaddress
import os
import re
import socket
import ssl
import tempfile
from contextlib import contextmanager
from urllib.parse import urlsplit

from scoring_test_boundary import ScoringTestBoundaryError
from scoring_test_resources import approved_outbound_url


def _require(condition, code):
    if not condition:
        raise ScoringTestBoundaryError(code)


def _limit(value):
    return type(value) is int and 0 < value <= 16 * 1024 * 1024


def resolve_addresses(host, port, mode):
    """Validate all DNS answers; connect to a checked numeric IP, never re-resolve."""
    answers = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    addresses = []
    for answer in answers:
        address = answer[4][0]
        try:
            ip = ipaddress.ip_address(address)
        except ValueError as error:
            raise ScoringTestBoundaryError("invalid-dns-address") from error
        allowed = ip.is_loopback if mode == "local-emulator" else ip.is_global
        _require(allowed and not ip.is_multicast and not ip.is_unspecified, "outbound-address-denied")
        if address not in addresses:
            addresses.append(address)
    _require(bool(addresses), "empty-dns-answer")
    return addresses


class _PinnedHTTP(http.client.HTTPConnection):
    def __init__(self, host, port, address, timeout):
        super().__init__(host, port=port, timeout=timeout)
        self.address = address

    def connect(self):
        self.sock = socket.create_connection((self.address, self.port), self.timeout)


class _PinnedHTTPS(_PinnedHTTP):
    def connect(self):
        raw = socket.create_connection((self.address, self.port), self.timeout)
        try:
            # Certificate and SNI validate the approved hostname, not the IP.
            self.sock = ssl.create_default_context().wrap_socket(raw, server_hostname=self.host)
        except BaseException:
            raw.close()
            raise


class ScoringTestReadTransport:
    """Server-configured allowlist, GET-only, redirects never followed.

    Per-socket inactivity timeout is not an overall wall-clock deadline. The
    calling endpoint must also enforce its request deadline and run authorization.
    """

    def __init__(self, *, mode, origin, approved_origin, approved_paths, max_response_bytes, timeout_seconds=10):
        _require(_limit(max_response_bytes), "invalid-response-limit")
        _require(type(timeout_seconds) in (int, float) and 0 < timeout_seconds <= 15, "invalid-io-timeout")
        _require(isinstance(approved_paths, (list, tuple)) and 1 <= len(approved_paths) <= 100,
                 "invalid-outbound-allowlist")
        for path in approved_paths:
            approved_outbound_url(mode=mode, configured_origin=origin, approved_origin=approved_origin, path=path)
        self.mode, self.origin = mode, origin
        self.paths = frozenset(approved_paths)
        self.max_response_bytes = max_response_bytes
        self.timeout_seconds = timeout_seconds

    def get(self, path):
        _require(os.environ.get("SCORING_TEST_OUTBOUND_ENABLED") == "true", "test-outbound-disabled")
        _require(isinstance(path, str) and path in self.paths, "outbound-path-not-approved")
        parsed = urlsplit(self.origin)
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        addresses = resolve_addresses(parsed.hostname, port, self.mode)
        connection_type = _PinnedHTTPS if parsed.scheme == "https" else _PinnedHTTP
        connection = connection_type(parsed.hostname, port, addresses[0], self.timeout_seconds)
        try:
            connection.request("GET", path, headers={"Accept": "application/json", "Accept-Encoding": "identity"})
            response = connection.getresponse()
            _require(response.status == 200, "outbound-status-rejected")
            _require(response.getheader("Content-Encoding", "identity").lower() == "identity",
                     "outbound-encoding-rejected")
            length = response.getheader("Content-Length")
            if length is not None:
                _require(bool(re.fullmatch(r"[0-9]+", length)) and len(length) <= 12,
                         "invalid-response-length")
                _require(int(length) <= self.max_response_bytes, "response-too-large")
            body = response.read(self.max_response_bytes + 1)
            _require(len(body) <= self.max_response_bytes, "response-too-large")
            if length is not None:
                _require(len(body) == int(length), "incomplete-response")
            return body
        finally:
            connection.close()


@contextmanager
def verified_upload(source, *, expected_bytes, expected_sha256, max_bytes):
    """Yield a verified temporary stream; delete on exit or any failure.

    No request quota or permanent storage is mutated here. Reserve verified size
    through the registry before persistence, then reauthorize the final commit.
    """
    _require(_limit(max_bytes), "invalid-upload-limit")
    _require(type(expected_bytes) is int and 0 <= expected_bytes <= max_bytes, "upload-size-rejected")
    _require(isinstance(expected_sha256, str) and re.fullmatch(r"[0-9a-f]{64}", expected_sha256),
             "invalid-upload-hash")
    digest = hashlib.sha256()
    total = 0
    with tempfile.SpooledTemporaryFile(max_size=min(max_bytes, 1024 * 1024), mode="w+b") as staged:
        while True:
            amount = min(65536, expected_bytes - total + 1)
            chunk = source.read(amount)
            _require(isinstance(chunk, bytes) and len(chunk) <= amount, "invalid-upload-stream")
            if not chunk:
                break
            total += len(chunk)
            _require(total <= expected_bytes, "upload-size-mismatch")
            digest.update(chunk)
            staged.write(chunk)
        _require(total == expected_bytes, "upload-size-mismatch")
        _require(digest.hexdigest() == expected_sha256, "upload-hash-mismatch")
        staged.seek(0)
        yield staged
