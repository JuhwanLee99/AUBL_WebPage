"""Authentication adapter tests with runtime-shaped requests, not real login."""
import unittest
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch

from scoring_test_application import ScoringTestApplication
from scoring_test_boundary import ScoringTestBoundaryError
from test_scoring_test_boundary import fixture


def specification(run):
    return {"version": 1, "deploymentVersion": "test-build", "stopOwnerUid": "admin",
            "scenarioByMatch": {run["matchIds"][0]: "full-game"},
            "limits": {"maxRequests": run["maxRequests"], "maxRequestsPerMinute": 2, "maxUploadBytes": 1000},
            "cleanup": {"namespace": "scoringTestRuns/" + run["runId"], "deleteRunData": True,
                        "revokeRunAccess": True, "verifyAbsence": True},
            "approvalReference": "local-test-approval"}


def request(data, uid="admin", token=None):
    return SimpleNamespace(data=data, auth=SimpleNamespace(uid=uid, token={"scoringTestOperator": True} if token is None else token))


class FakeRegistry:
    def create_disabled(self, run, **kwargs):
        self.saved = deepcopy(kwargs)
        return {"runId": run["runId"], "status": "disabled"}

    def reserve(self, run_id, **kwargs):
        self.reservation = kwargs
        return {"requestId": kwargs["request_id"], "replayed": False}

    def stop(self, run_id, **kwargs):
        self.stopped = kwargs
        return {"runId": run_id, "status": "stopped"}


class ApplicationTests(unittest.TestCase):
    def setUp(self):
        self.registry = FakeRegistry()
        self.app = ScoringTestApplication(self.registry)
        run = fixture()
        run["status"] = "disabled"
        self.data = {"run": run, "executionManifest": specification(run)}
        clock = patch("scoring_test_application.time.time_ns", return_value=3000 * 1000000)
        clock.start()
        self.addCleanup(clock.stop)

    def test_registration_audit(self):
        result = self.app.register_from_callable(request(self.data))
        audit = self.registry.saved["approval_audit"]
        self.assertEqual(audit["approvedSpecification"], self.data)
        self.assertEqual(audit["actorUid"], "admin")
        self.assertEqual(audit["registeredAtMs"], 3000)
        self.assertEqual(audit["approvalHash"], result["approvalHash"])
        self.assertEqual(result["status"], "disabled")

    def test_hash_reproducible_with_reordered_keys(self):
        first = self.app.register_from_callable(request(self.data))["approvalHash"]
        reordered = dict(reversed(list(self.data.items())))
        self.assertEqual(first, self.app.register_from_callable(request(reordered))["approvalHash"])

    def test_hash_changes_with_approval(self):
        baseline = self.app.register_from_callable(request(self.data))["approvalHash"]
        for category in ("participant", "expiry", "budget", "build"):
            data = deepcopy(self.data)
            if category == "participant":
                data["run"]["participants"][1]["uid"] = "replacement"
            elif category == "expiry":
                data["run"]["expiresAtMs"] += 1
            elif category == "budget":
                data["run"]["maxRequests"] += 1
                data["executionManifest"]["limits"]["maxRequests"] += 1
            else:
                data["executionManifest"]["deploymentVersion"] = "next-build"
            with self.subTest(category=category):
                self.assertNotEqual(baseline, self.app.register_from_callable(request(data))["approvalHash"])

    def test_anonymous_denied(self):
        with self.assertRaisesRegex(ScoringTestBoundaryError, "unauthenticated"):
            self.app.register_from_callable(SimpleNamespace(auth=None, data=self.data))

    def test_general_admin_not_operator(self):
        with self.assertRaisesRegex(ScoringTestBoundaryError, "test-operator-required"):
            self.app.register_from_callable(request(self.data, token={"admin": True}))

    def test_truthy_claim_not_operator(self):
        with self.assertRaisesRegex(ScoringTestBoundaryError, "test-operator-required"):
            self.app.register_from_callable(request(self.data, token={"scoringTestOperator": "true"}))

    def test_other_approver_denied(self):
        with self.assertRaisesRegex(ScoringTestBoundaryError, "approver-mismatch"):
            self.app.register_from_callable(request(self.data, uid="other"))

    def test_missing_manifest(self):
        with self.assertRaisesRegex(ScoringTestBoundaryError, "invalid-registration-request"):
            self.app.register_from_callable(request({"run": self.data["run"]}))

    def test_manifest_contradictions(self):
        patches = [
            ("stopOwnerUid", "viewer"), ("scenarioByMatch", {"ordinary": "full-game"}),
            ("deploymentVersion", ""), ("approvalReference", ""),
            ("limits", {"maxRequests": 5, "maxRequestsPerMinute": 2, "maxUploadBytes": 1000}),
            ("cleanup", {"namespace": "matches", "deleteRunData": True, "revokeRunAccess": True, "verifyAbsence": True}),
        ]
        for field, value in patches:
            data = deepcopy(self.data)
            data["executionManifest"][field] = value
            with self.subTest(field=field), self.assertRaises(ScoringTestBoundaryError):
                self.app.register_from_callable(request(data))

    def test_registration_time_boundaries(self):
        for now in (1999, 10000):
            with self.subTest(now=now), patch("scoring_test_application.time.time_ns", return_value=now * 1000000):
                with self.assertRaisesRegex(ScoringTestBoundaryError, "invalid-registration-window"):
                    self.app.register_from_callable(request(self.data))

    def test_reservation_uses_auth_uid(self):
        data = {"runId": "TEST_RUN_POLICY", "matchId": "TEST_SCORING_ONE", "operation": "record",
                "requestId": "one", "payloadHash": "a" * 64}
        self.app.reserve_from_callable(request(data, uid="scorer", token={}))
        self.assertEqual(self.registry.reservation["uid"], "scorer")
        with self.assertRaisesRegex(ScoringTestBoundaryError, "invalid-reservation-request"):
            self.app.reserve_from_callable(request({**data, "uid": "admin"}, uid="scorer", token={}))

    def test_stop_operator_only(self):
        data = {"runId": "TEST_RUN_POLICY"}
        with self.assertRaisesRegex(ScoringTestBoundaryError, "test-operator-required"):
            self.app.stop_from_callable(request(data, token={"admin": True}))
        self.assertEqual(self.app.stop_from_callable(request(data))["status"], "stopped")


if __name__ == "__main__":
    unittest.main()
