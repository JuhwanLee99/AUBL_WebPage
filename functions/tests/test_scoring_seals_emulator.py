"""Private storage seal tests plus full existing emulator regression."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch

from google.api_core.exceptions import DeadlineExceeded
import test_scoring_readback_emulator as readback
from scoring_test_boundary import ScoringTestBoundaryError
from scoring_test_seals import ScoringTestSeals


class SealsEmulatorTests(readback.ReadbackEmulatorTests):
    def cleanup_run(self):
        for head in self.ref.collection("scoringHeads").stream():
            seals = head.reference.collection("seals")
            for item in seals.stream():
                item.reference.delete()
            self.assertEqual(list(seals.stream()), [])
        super().cleanup_run()

    def prepare_seal(self):
        self.prepare_readback()
        self.seals = ScoringTestSeals(self.registry)
        flag = patch.dict("os.environ", {"SCORING_TEST_SEAL_ENABLED": "true"})
        flag.start()
        self.addCleanup(flag.stop)

    def seal(self, **overrides):
        args = dict(uid="scorer", match_id="TEST_SCORING_ONE", writer_session_id="tab_one", lock_epoch=1,
                    request_id="seal_one", final_request_id="commit_one", revision=1,
                    commit_id=self.first_commit["commitId"], payload_hash=self.first_commit["payloadHash"],
                    last_input_sequence=1)
        args.update(overrides)
        return self.seals.seal(self.run["runId"], **args)

    def assert_unsealed(self):
        self.assertFalse(self.head.get().to_dict().get("sealed", False))
        self.assertEqual(self.current_session()["status"], "active")
        self.assertEqual(list(self.head.collection("seals").stream()), [])

    def test_seal_atomic_state_and_replay(self):
        self.prepare_seal()
        first = self.seal()
        head = self.head.get().to_dict()
        self.assertTrue(head["sealed"])
        self.assertEqual(head["sealId"], first["sealId"])
        self.assertEqual(self.current_session()["sealId"], first["sealId"])
        self.assertEqual(self.current_session()["status"], "sealed")
        self.assertEqual(first["sealKind"], "storage-checkpoint")
        self.assertFalse(first["published"])
        self.assertTrue(self.seal()["replayed"])
        self.assertEqual(self.head.get().to_dict(), head)
        self.assertEqual(len(list(self.head.collection("seals").stream())), 1)
        self.assertEqual(self.read(expected_revision=1)["commitId"], first["commitId"])

    def test_seal_wrong_final_binding_no_partial_state(self):
        self.prepare_seal()
        for changes, code in (({"revision": 2}, "seal-head-changed"),
                              ({"payload_hash": "0" * 64}, "seal-head-changed"),
                              ({"final_request_id": "missing"}, "seal-final-receipt-mismatch"),
                              ({"last_input_sequence": 2}, "seal-head-changed")):
            with self.subTest(changes=changes), self.assertRaisesRegex(ScoringTestBoundaryError, code):
                self.seal(**changes)
            self.assert_unsealed()

    def test_seal_damaged_block_no_partial_state(self):
        self.prepare_seal()
        self.ref.collection("uploadBlocks").document(self.manifest["blocks"][0]["blockId"]).update({"body": b"bad"})
        with self.assertRaisesRegex(ScoringTestBoundaryError, "seal-block-integrity-failed"):
            self.seal()
        self.assert_unsealed()

    def test_seal_missing_block_no_partial_state(self):
        self.prepare_seal()
        self.ref.collection("uploadBlocks").document(self.manifest["blocks"][0]["blockId"]).delete()
        with self.assertRaisesRegex(ScoringTestBoundaryError, "seal-block-missing-or-foreign"):
            self.seal()
        self.assert_unsealed()

    def test_seal_stops_upload_commit_acquire_and_handoff(self):
        self.prepare_seal()
        self.seal()
        operations = [lambda: self.upload(request_id="late_upload"),
                      lambda: self.commit(request_id="late_commit", expected_revision=1,
                                          first_input_sequence=2, last_input_sequence=2),
                      lambda: self.acquire(), lambda: self.handoff()]
        for index, operation in enumerate(operations):
            with self.subTest(operation=index), self.assertRaisesRegex(ScoringTestBoundaryError, "writer-not-active"):
                operation()
        self.assertEqual(self.head.get().to_dict()["revision"], 1)

    def test_seal_disabled_and_conflicting_replay(self):
        self.prepare_seal()
        with patch.dict("os.environ", {"SCORING_TEST_SEAL_ENABLED": "false"}):
            with self.assertRaisesRegex(ScoringTestBoundaryError, "test-seal-disabled"):
                self.seal()
        self.assert_unsealed()
        self.seal()
        with self.assertRaisesRegex(ScoringTestBoundaryError, "seal-request-conflict"):
            self.seal(last_input_sequence=2)

    def test_seal_rpc_response_loss_recovers_once(self):
        self.prepare_seal()
        actual_commit = self.registry.db._firestore_api.commit
        def lose_response(*args, **kwargs):
            actual_commit(*args, **kwargs)
            raise DeadlineExceeded("injected after seal commit")
        with patch.object(self.registry.db._firestore_api, "commit", side_effect=lose_response) as rpc:
            with self.assertRaises(DeadlineExceeded):
                self.seal()
        self.assertEqual(rpc.call_count, 1)
        head = self.head.get().to_dict()
        self.assertTrue(head["sealed"])
        self.assertTrue(self.seal()["replayed"])
        self.assertEqual(self.head.get().to_dict(), head)
        self.assertEqual(len(list(self.head.collection("seals").stream())), 1)

    def test_seal_racing_next_commit(self):
        self.prepare_seal()
        barrier = Barrier(2)
        def attempt(kind):
            barrier.wait(timeout=10)
            try:
                if kind == "seal":
                    return self.seal()
                return self.commit(request_id="next_commit", expected_revision=1,
                                   first_input_sequence=2, last_input_sequence=2)
            except ScoringTestBoundaryError as error:
                return str(error)
        with ThreadPoolExecutor(max_workers=2) as pool:
            sealed = pool.submit(attempt, "seal")
            committed = pool.submit(attempt, "commit")
            seal_result, commit_result = sealed.result(), committed.result()
        head = self.head.get().to_dict()
        if isinstance(seal_result, dict):
            self.assertEqual(commit_result, "writer-not-active")
            self.assertTrue(head["sealed"])
            self.assertEqual(head["revision"], 1)
            self.assertEqual(self.current_session()["status"], "sealed")
        else:
            self.assertEqual(seal_result, "seal-head-changed")
            self.assertIsInstance(commit_result, dict)
            self.assertEqual(head["revision"], 2)
            self.assert_unsealed()
