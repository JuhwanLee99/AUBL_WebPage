"""Single writer concurrency plus inherited transfer boundary regression."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import test_scoring_transfer_emulator as transfer
from scoring_test_boundary import ScoringTestBoundaryError
from scoring_test_sessions import ScoringTestWriterSessions, assert_writer


class SessionsEmulatorTests(transfer.TransferEmulatorTests):
    def cleanup_run(self):
        for name in ("writerSessions", "writerHandoffs"):
            collection = self.ref.collection(name)
            for item in collection.stream():
                item.reference.delete()
            self.assertEqual(list(collection.stream()), [])
        super().cleanup_run()

    def prepare_sessions(self):
        self.prepare_transfer()
        self.sessions = ScoringTestWriterSessions(self.registry)

    def acquire(self, tab="tab_one"):
        return self.sessions.acquire(self.run["runId"], uid="scorer", match_id="TEST_SCORING_ONE", writer_session_id=tab)

    def handoff(self, **overrides):
        args = dict(actor_uid="admin", operator_authorized=True, match_id="TEST_SCORING_ONE",
                    request_id="handoff_one", expected_epoch=1, next_uid="scorer", next_writer_session_id="tab_two")
        args.update(overrides)
        return self.sessions.handoff(self.run["runId"], **args)

    def current_session(self):
        return self.ref.collection("writerSessions").document("TEST_SCORING_ONE").get().to_dict()

    def test_acquire_replay_and_second_tab_denied(self):
        self.prepare_sessions()
        self.assertEqual(self.acquire(), {"writerSessionId": "tab_one", "lockEpoch": 1, "replayed": False})
        self.assertTrue(self.acquire()["replayed"])
        with self.assertRaisesRegex(ScoringTestBoundaryError, "writer-session-mismatch"):
            self.acquire("tab_two")
        self.assertEqual(self.current_session()["writerSessionId"], "tab_one")

    def test_concurrent_first_acquisition(self):
        self.prepare_sessions()
        barrier = Barrier(2)
        def acquire(index):
            barrier.wait(timeout=10)
            try:
                return self.acquire(f"tab_{index}")
            except ScoringTestBoundaryError as error:
                return str(error)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(acquire, range(2)))
        self.assertEqual(sum(isinstance(item, dict) for item in results), 1)
        self.assertEqual(results.count("writer-session-mismatch"), 1)
        self.assertEqual(self.current_session()["lockEpoch"], 1)

    def test_handoff_invalidates_previous_writer(self):
        self.prepare_sessions()
        self.acquire()
        self.assertEqual(self.handoff()["lockEpoch"], 2)
        current = self.current_session()
        with self.assertRaisesRegex(ScoringTestBoundaryError, "writer-session-mismatch"):
            assert_writer(current, uid="scorer", writer_session_id="tab_one", lock_epoch=1)
        assert_writer(current, uid="scorer", writer_session_id="tab_two", lock_epoch=2)
        receipt = list(self.ref.collection("writerHandoffs").stream())[0].to_dict()
        self.assertEqual(receipt["previousWriterSessionId"], "tab_one")
        self.assertEqual(receipt["previousUid"], "scorer")

    def test_handoff_replay_and_conflicting_payload(self):
        self.prepare_sessions()
        self.acquire()
        self.handoff()
        self.assertTrue(self.handoff()["replayed"])
        with self.assertRaisesRegex(ScoringTestBoundaryError, "handoff-request-conflict"):
            self.handoff(next_writer_session_id="different")
        self.assertEqual(self.current_session()["lockEpoch"], 2)
        self.assertEqual(len(list(self.ref.collection("writerHandoffs").stream())), 1)

    def test_handoff_permissions(self):
        self.prepare_sessions()
        self.acquire()
        for overrides in ({"operator_authorized": False}, {"actor_uid": "scorer"},
                          {"actor_uid": "outsider"}, {"next_uid": "viewer"}):
            with self.subTest(overrides=overrides), self.assertRaises(ScoringTestBoundaryError):
                self.handoff(**overrides)
        self.assertEqual(self.current_session()["lockEpoch"], 1)
        self.assertEqual(list(self.ref.collection("writerHandoffs").stream()), [])

    def test_concurrent_handoff_single_epoch_increment(self):
        self.prepare_sessions()
        self.acquire()
        barrier = Barrier(2)
        def handoff(index):
            barrier.wait(timeout=10)
            try:
                return self.handoff(request_id=f"handoff_{index}", next_writer_session_id=f"next_{index}")
            except ScoringTestBoundaryError as error:
                return str(error)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(handoff, range(2)))
        self.assertEqual(sum(isinstance(item, dict) for item in results), 1)
        self.assertEqual(results.count("writer-epoch-conflict"), 1)
        self.assertEqual(self.current_session()["lockEpoch"], 2)
        self.assertEqual(len(list(self.ref.collection("writerHandoffs").stream())), 1)

    def test_old_receipt_does_not_restore_old_owner(self):
        self.prepare_sessions()
        self.acquire()
        self.handoff()
        self.handoff(request_id="handoff_later", expected_epoch=2, next_writer_session_id="tab_three")
        previous = self.handoff()
        self.assertTrue(previous["replayed"])
        self.assertEqual(previous["lockEpoch"], 2)
        self.assertEqual(self.current_session()["lockEpoch"], 3)
        with self.assertRaisesRegex(ScoringTestBoundaryError, "writer-session-mismatch"):
            assert_writer(self.current_session(), uid="scorer", writer_session_id="tab_two", lock_epoch=2)
