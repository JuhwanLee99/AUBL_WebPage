"""Pure resource policy tests; no outbound requests."""
import unittest

from scoring_test_boundary import ScoringTestBoundaryError
from scoring_test_resources import approved_outbound_url, plan_resources
from test_scoring_test_boundary import fixture


def run_with_limits():
    run = fixture()
    run["approvalAudit"] = {"approvedSpecification": {"executionManifest": {
        "limits": {"maxRequests": 4, "maxRequestsPerMinute": 2, "maxUploadBytes": 1000}}}}
    return run


class ResourceTests(unittest.TestCase):
    def test_first_reservation(self):
        self.assertEqual(plan_resources(run_with_limits(), now_ms=60000, upload_bytes=600, replayed=False),
                         {"requestWindow": 1, "requestWindowCount": 1, "reservedUploadBytes": 600})

    def test_replay_consumes_rate_not_bytes(self):
        run = run_with_limits()
        run.update(requestWindow=1, requestWindowCount=1, reservedUploadBytes=600)
        self.assertEqual(plan_resources(run, now_ms=60001, upload_bytes=600, replayed=True),
                         {"requestWindow": 1, "requestWindowCount": 2, "reservedUploadBytes": 600})

    def test_exact_byte_limit(self):
        self.assertEqual(plan_resources(run_with_limits(), now_ms=0, upload_bytes=1000,
                                        replayed=False)["reservedUploadBytes"], 1000)

    def test_upload_over_limit(self):
        with self.assertRaisesRegex(ScoringTestBoundaryError, "upload-budget-exhausted"):
            plan_resources(run_with_limits(), now_ms=0, upload_bytes=1001, replayed=False)

    def test_window_boundary_and_rate_limit(self):
        run = run_with_limits()
        run.update(requestWindow=0, requestWindowCount=2, reservedUploadBytes=10)
        with self.assertRaisesRegex(ScoringTestBoundaryError, "request-rate-exhausted"):
            plan_resources(run, now_ms=59999, upload_bytes=0, replayed=True)
        result = plan_resources(run, now_ms=60000, upload_bytes=0, replayed=True)
        self.assertEqual(result, {"requestWindow": 1, "requestWindowCount": 1, "reservedUploadBytes": 10})

    def test_clock_regression(self):
        run = run_with_limits()
        run["requestWindow"] = 2
        with self.assertRaisesRegex(ScoringTestBoundaryError, "server-clock-regressed"):
            plan_resources(run, now_ms=60000, upload_bytes=0, replayed=False)

    def test_invalid_resource_counters(self):
        for field in ("requestWindow", "requestWindowCount", "reservedUploadBytes"):
            run = run_with_limits()
            run[field] = True
            with self.subTest(field=field), self.assertRaisesRegex(ScoringTestBoundaryError, "invalid-resource-counter"):
                plan_resources(run, now_ms=60000, upload_bytes=0, replayed=False)

    def test_invalid_bytes(self):
        for value in (-1, True, 1.5, 9007199254740992):
            with self.subTest(value=value), self.assertRaisesRegex(ScoringTestBoundaryError, "invalid-resource-input"):
                plan_resources(run_with_limits(), now_ms=0, upload_bytes=value, replayed=False)

    def test_legacy_has_no_upload_allowance(self):
        with self.assertRaisesRegex(ScoringTestBoundaryError, "upload-budget-exhausted"):
            plan_resources(fixture(), now_ms=0, upload_bytes=1, replayed=False)

    def test_approval_limit_mismatch(self):
        run = run_with_limits()
        run["maxRequests"] = 5
        with self.assertRaisesRegex(ScoringTestBoundaryError, "resource-limit-mismatch"):
            plan_resources(run, now_ms=0, upload_bytes=0, replayed=False)

    def test_local_outbound(self):
        origin = "http://127.0.0.1:8080"
        self.assertEqual(approved_outbound_url(mode="local-emulator", configured_origin=origin,
                                              approved_origin=origin, path="/api/health"), origin + "/api/health")

    def test_approved_test_origin(self):
        origin = "https://test.invalid"
        self.assertEqual(approved_outbound_url(mode="production-test", configured_origin=origin,
                                              approved_origin=origin, path="/api/health"), origin + "/api/health")

    def test_origin_mismatch_no_fallback(self):
        with self.assertRaisesRegex(ScoringTestBoundaryError, "outbound-origin-mismatch"):
            approved_outbound_url(mode="production-test", configured_origin=None,
                                  approved_origin="https://test.invalid", path="/api/health")

    def test_local_rejects_remote(self):
        with self.assertRaisesRegex(ScoringTestBoundaryError, "invalid-outbound-origin"):
            approved_outbound_url(mode="local-emulator", configured_origin="https://api.aubl.club",
                                  approved_origin="https://api.aubl.club", path="/api/health")

    def test_unsafe_origins(self):
        for origin in ("https://user:pass@test.invalid", "https://test.invalid/path", "https://test.invalid?x=1",
                       "https://test.invalid:0", "https://test.invalid:99999", "https://test.invalid\n"):
            with self.subTest(origin=origin), self.assertRaises(ScoringTestBoundaryError):
                approved_outbound_url(mode="production-test", configured_origin=origin,
                                      approved_origin=origin, path="/api/health")

    def test_path_escape(self):
        for path in ("//remote.invalid", "/../escape", "/%2e%2e/escape", "/a\\b", "/a?x=1", "/a#b", "/a\nb"):
            with self.subTest(path=path), self.assertRaisesRegex(ScoringTestBoundaryError, "invalid-outbound-path"):
                approved_outbound_url(mode="production-test", configured_origin="https://test.invalid",
                                      approved_origin="https://test.invalid", path=path)


if __name__ == "__main__":
    unittest.main()
