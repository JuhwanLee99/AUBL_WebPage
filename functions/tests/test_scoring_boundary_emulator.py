"""Explicit local-only integration tests; never run against a real project."""
import os
import time
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch

from scoring_test_boundary import ScoringTestBoundaryError, ScoringTestRegistry
from test_scoring_test_boundary import fixture


class RegistryEmulatorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if (os.environ.get("FIRESTORE_EMULATOR_HOST") != "127.0.0.1:8088"
                or os.environ.get("GCLOUD_PROJECT") != "demo-aubl-scoring"):
            raise RuntimeError("Refusing to run outside the explicit local demo emulator")
        from google.auth.credentials import AnonymousCredentials
        from google.cloud.firestore import Client
        cls.db = Client(project="demo-aubl-scoring", credentials=AnonymousCredentials())

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def setUp(self):
        self.registry = ScoringTestRegistry(self.db, project_id="demo-aubl-scoring", api_origin="https://test.invalid")
        self.run = fixture()
        self.run["runId"] = "TEST_RUN_" + uuid.uuid4().hex
        now = time.time_ns() // 1000000
        self.run.update(status="disabled", createdAtMs=now - 1000, approvedAtMs=now - 500, expiresAtMs=now + 60000)
        self.ref = self.db.collection("scoringTestRuns").document(self.run["runId"])
        self.registry.create_disabled(self.run, actor_uid="admin", operator_authorized=True)
        self.flag = patch.dict(os.environ, {"SCORING_TEST_SERVER_ENABLED": "true"})
        self.flag.start()
        self.addCleanup(self.flag.stop)
        self.addCleanup(self.cleanup_run)

    def cleanup_run(self):
        for receipt in self.ref.collection("requestReservations").stream():
            receipt.reference.delete()
        self.ref.delete()
        self.assertFalse(self.ref.get().exists)
        self.assertEqual(list(self.ref.collection("requestReservations").stream()), [])

    def activate_fixture(self):
        # Test-only direct seed. Product intentionally has no activation endpoint.
        self.ref.update({"status": "active"})

    def reserve(self, request_id="request_one", **overrides):
        args = dict(uid="scorer", match_id="TEST_SCORING_ONE", operation="record",
                    request_id=request_id, payload_hash="a" * 64)
        args.update(overrides)
        return self.registry.reserve(self.run["runId"], **args)

    def test_disabled_by_default(self):
        with self.assertRaisesRegex(ScoringTestBoundaryError, "run-not-active"):
            self.reserve()
        self.activate_fixture()
        with patch.dict(os.environ, {"SCORING_TEST_SERVER_ENABLED": "false"}):
            with self.assertRaisesRegex(ScoringTestBoundaryError, "server-test-disabled"):
                self.reserve()
        self.assertEqual(self.ref.get().to_dict()["requestCount"], 0)

    def test_registration_cannot_activate(self):
        self.run["status"] = "active"
        with self.assertRaisesRegex(ScoringTestBoundaryError, "registration-must-be-disabled"):
            self.registry.create_disabled(self.run, actor_uid="admin", operator_authorized=True)

    def test_operator_required(self):
        with self.assertRaisesRegex(ScoringTestBoundaryError, "operator-required"):
            self.registry.stop(self.run["runId"], actor_uid="admin", operator_authorized=False)

    def test_replay_and_conflicting_content(self):
        self.activate_fixture()
        self.assertFalse(self.reserve()["replayed"])
        self.assertTrue(self.reserve()["replayed"])
        with self.assertRaisesRegex(ScoringTestBoundaryError, "request-id-conflict"):
            self.reserve(payload_hash="b" * 64)
        self.assertEqual(self.ref.get().to_dict()["requestCount"], 1)

    def test_concurrent_budget(self):
        self.activate_fixture()
        self.ref.update({"maxRequests": 2})
        barrier = Barrier(4)
        def attempt(index):
            barrier.wait(timeout=10)
            try:
                self.reserve(f"request_{index}")
                return "accepted"
            except ScoringTestBoundaryError as error:
                return str(error)
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(attempt, range(4)))
        self.assertEqual(results.count("accepted"), 2)
        self.assertEqual(results.count("request-budget-exhausted"), 2)
        self.assertEqual(self.ref.get().to_dict()["requestCount"], 2)
        self.assertEqual(len(list(self.ref.collection("requestReservations").stream())), 2)

    def test_concurrent_same_request(self):
        self.activate_fixture()
        barrier = Barrier(3)
        def attempt(_):
            barrier.wait(timeout=10)
            return self.reserve()
        with ThreadPoolExecutor(max_workers=3) as pool:
            results = list(pool.map(attempt, range(3)))
        self.assertEqual(sum(not item["replayed"] for item in results), 1)
        self.assertEqual(self.ref.get().to_dict()["requestCount"], 1)

    def test_stop_racing_reservation(self):
        self.activate_fixture()
        barrier = Barrier(2)
        def reserve():
            barrier.wait(timeout=10)
            try:
                self.reserve()
                return "accepted"
            except ScoringTestBoundaryError as error:
                return str(error)
        def stop():
            barrier.wait(timeout=10)
            return self.registry.stop(self.run["runId"], actor_uid="admin", operator_authorized=True)
        with ThreadPoolExecutor(max_workers=2) as pool:
            pending = pool.submit(reserve)
            stopped = pool.submit(stop)
            result, status = pending.result(), stopped.result()
        self.assertIn(result, ("accepted", "run-not-active"))
        self.assertEqual(status["status"], "stopped")
        with self.assertRaisesRegex(ScoringTestBoundaryError, "run-not-active"):
            self.reserve("after_stop")
        self.assertEqual(self.ref.get().to_dict()["requestCount"], int(result == "accepted"))

    def test_expired_replay_is_denied(self):
        self.activate_fixture()
        self.reserve()
        now = time.time_ns() // 1000000
        self.ref.update({"createdAtMs": now - 10000, "approvedAtMs": now - 9000, "expiresAtMs": now - 1})
        with self.assertRaisesRegex(ScoringTestBoundaryError, "run-expired-or-not-started"):
            self.reserve()

    def test_corrupt_counter_is_denied(self):
        self.activate_fixture()
        self.ref.update({"requestCount": True})
        with self.assertRaisesRegex(ScoringTestBoundaryError, "invalid-request-counter"):
            self.reserve()

    def test_closed_run_stays_closed(self):
        self.ref.update({"status": "closed"})
        result = self.registry.stop(self.run["runId"], actor_uid="admin", operator_authorized=True)
        self.assertEqual(result["status"], "closed")


if __name__ == "__main__":
    unittest.main()
