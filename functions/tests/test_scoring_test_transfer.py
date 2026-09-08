"""Approval and read integration with no Firebase or HTTP access."""
import unittest
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import Mock, patch

from scoring_test_application import ScoringTestApplication
from scoring_test_boundary import ScoringTestBoundaryError
from scoring_test_transfer import ScoringTestTransferService, verify_approval
from test_scoring_test_application import FakeRegistry, request, specification
from test_scoring_test_boundary import fixture


def approved_run():
    run = fixture()
    run["status"] = "disabled"
    registry = FakeRegistry()
    with patch("scoring_test_application.time.time_ns", return_value=3000000000):
        ScoringTestApplication(registry).register_from_callable(request({"run": run, "executionManifest": specification(run)}))
    run["approvalAudit"] = registry.saved["approval_audit"]
    run["status"] = "active"
    return run


class TransferTests(unittest.TestCase):
    def test_valid_approval(self):
        run = approved_run()
        self.assertEqual(verify_approval(run), run["approvalAudit"]["approvalHash"])

    def test_tampered_approval(self):
        run = approved_run()
        run["approvalAudit"]["approvedSpecification"]["executionManifest"]["deploymentVersion"] = "tampered"
        with self.assertRaisesRegex(ScoringTestBoundaryError, "approval-hash-mismatch"):
            verify_approval(run)

    def test_current_run_drift(self):
        for key, value in (("maxRequests", 5), ("expiresAtMs", 10001), ("apiOrigin", "https://other.invalid")):
            run = approved_run()
            run[key] = value
            with self.subTest(key=key), self.assertRaisesRegex(ScoringTestBoundaryError, "approved-run-drift"):
                verify_approval(run)

    def test_missing_approval(self):
        with self.assertRaisesRegex(ScoringTestBoundaryError, "approval-required"):
            verify_approval(fixture())

    def test_runtime_counters_do_not_change_approval(self):
        run = approved_run()
        original = verify_approval(run)
        run.update(requestCount=2, requestWindowCount=1)
        self.assertEqual(verify_approval(run), original)

    def read_fixture(self):
        run = approved_run()
        ref = Mock(id=run["runId"])
        ref.get.side_effect = lambda **kwargs: SimpleNamespace(to_dict=lambda: deepcopy(run))
        registry = Mock(project_id=run["projectId"], api_origin=run["apiOrigin"])
        registry._ref.return_value = ref
        transport = Mock(origin=run["apiOrigin"], paths={"/api/health"})
        transport.get.return_value = b"{}"
        return run, registry, transport, ScoringTestTransferService(registry, transport)

    def perform_read(self, service):
        with patch.dict("os.environ", {"SCORING_TEST_SERVER_ENABLED": "true"}), \
                patch("scoring_test_transfer.time.time_ns", return_value=3000000000):
            return service.read("TEST_RUN_POLICY", uid="viewer", match_id="TEST_SCORING_ONE",
                                request_id="read_one", path="/api/health")

    def test_read_success(self):
        _, registry, transport, service = self.read_fixture()
        self.assertEqual(self.perform_read(service), b"{}")
        registry.reserve.assert_called_once()
        transport.get.assert_called_once_with("/api/health")

    def test_stop_after_reservation_prevents_http(self):
        run, registry, transport, service = self.read_fixture()
        registry.reserve.side_effect = lambda *args, **kwargs: run.update(status="stopped")
        with self.assertRaisesRegex(ScoringTestBoundaryError, "run-not-active"):
            self.perform_read(service)
        transport.get.assert_not_called()

    def test_stop_during_http_prevents_return(self):
        run, _, transport, service = self.read_fixture()
        def response(path):
            run["status"] = "stopped"
            return b"sensitive"
        transport.get.side_effect = response
        with self.assertRaisesRegex(ScoringTestBoundaryError, "run-not-active"):
            self.perform_read(service)

    def test_wrong_transport_no_reservation(self):
        _, registry, transport, service = self.read_fixture()
        transport.origin = "https://other.invalid"
        with self.assertRaisesRegex(ScoringTestBoundaryError, "transport-target-mismatch"):
            self.perform_read(service)
        registry.reserve.assert_not_called()

    def test_nonparticipant_no_reservation(self):
        run, registry, transport, service = self.read_fixture()
        run["participants"] = [person for person in run["participants"] if person["uid"] != "viewer"]
        with self.assertRaisesRegex(ScoringTestBoundaryError, "not-a-participant"):
            self.perform_read(service)
        registry.reserve.assert_not_called()
        transport.get.assert_not_called()
