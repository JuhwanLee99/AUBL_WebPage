"""Resource integration tests plus inherited approval/registry regression."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import test_scoring_application_emulator as application
from scoring_test_boundary import ScoringTestBoundaryError


class ResourcesEmulatorTests(application.ApplicationEmulatorTests):
    def prepare_resources(self):
        self.register_with_audit()
        self.activate_fixture()

    def test_upload_replay_does_not_double_reserve(self):
        self.prepare_resources()
        self.assertFalse(self.reserve(upload_bytes=600)["replayed"])
        self.assertTrue(self.reserve(upload_bytes=600)["replayed"])
        stored = self.ref.get().to_dict()
        self.assertEqual(stored["requestCount"], 1)
        self.assertEqual(stored["requestWindowCount"], 2)
        self.assertEqual(stored["reservedUploadBytes"], 600)

    def test_replay_rate_limit(self):
        self.prepare_resources()
        self.reserve()
        self.reserve()
        with self.assertRaisesRegex(ScoringTestBoundaryError, "request-rate-exhausted"):
            self.reserve()
        self.assertEqual(self.ref.get().to_dict()["requestCount"], 1)

    def test_changed_upload_size_is_conflict(self):
        self.prepare_resources()
        self.reserve(upload_bytes=600)
        with self.assertRaisesRegex(ScoringTestBoundaryError, "request-id-conflict"):
            self.reserve(upload_bytes=601)
        self.assertEqual(self.ref.get().to_dict()["reservedUploadBytes"], 600)

    def test_concurrent_upload_budget(self):
        self.prepare_resources()
        barrier = Barrier(2)
        def attempt(index):
            barrier.wait(timeout=10)
            try:
                self.reserve(f"upload_{index}", upload_bytes=600)
                return "accepted"
            except ScoringTestBoundaryError as error:
                return str(error)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(attempt, range(2)))
        self.assertCountEqual(results, ["accepted", "upload-budget-exhausted"])
        stored = self.ref.get().to_dict()
        self.assertEqual(stored["reservedUploadBytes"], 600)
        self.assertEqual(stored["requestCount"], 1)
        self.assertEqual(len(list(self.ref.collection("requestReservations").stream())), 1)
