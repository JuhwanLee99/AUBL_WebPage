"""Private commit integration plus existing writer/upload regression."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from threading import Barrier
from unittest.mock import patch

import test_scoring_writer_upload_emulator as upload
from scoring_test_boundary import ScoringTestBoundaryError
from scoring_test_commits import ScoringTestCommits
from scoring_test_transfer import _digest
from test_scoring_test_commits import manifest_fixture


class CommitsEmulatorTests(upload.WriterUploadEmulatorTests):
    def cleanup_run(self):
        heads = self.ref.collection("scoringHeads")
        for head in heads.stream():
            for name in ("manifests", "receipts"):
                collection = head.reference.collection(name)
                for item in collection.stream():
                    item.reference.delete()
                self.assertEqual(list(collection.stream()), [])
            head.reference.delete()
        self.assertEqual(list(heads.stream()), [])
        super().cleanup_run()

    def prepare_commit(self):
        self.prepare_sessions()
        self.acquire()
        block = self.upload()
        self.manifest = manifest_fixture(block["blockId"], block["sha256"], block["size"])
        self.commits = ScoringTestCommits(self.registry)
        self.head = self.ref.collection("scoringHeads").document("TEST_SCORING_ONE")
        flag = patch.dict("os.environ", {"SCORING_TEST_COMMIT_ENABLED": "true"})
        flag.start()
        self.addCleanup(flag.stop)

    def commit(self, **overrides):
        args = dict(uid="scorer", match_id="TEST_SCORING_ONE", writer_session_id="tab_one", lock_epoch=1,
            request_id="commit_one", expected_revision=0, first_input_sequence=1, last_input_sequence=1,
            manifest=self.manifest, payload_hash=_digest(self.manifest))
        args.update(overrides)
        return self.commits.commit(self.run["runId"], **args)

    def assert_empty_commit(self):
        self.assertFalse(self.head.get().exists)
        for name in ("manifests", "receipts"):
            self.assertEqual(list(self.head.collection(name).stream()), [])

    def test_private_commit_and_replay(self):
        self.prepare_commit()
        first = self.commit()
        stored = self.head.get().to_dict()
        self.assertEqual(stored["status"], "private")
        self.assertEqual(stored["revision"], 1)
        self.assertEqual(stored["commitId"], first["commitId"])
        manifest = self.head.collection("manifests").document(first["commitId"]).get().to_dict()
        self.assertEqual(manifest["blocks"], self.manifest["blocks"])
        self.assertIsNone(manifest["parentCommitId"])
        self.assertTrue(self.commit()["replayed"])
        self.assertEqual(self.head.get().to_dict(), stored)
        self.assertEqual(len(list(self.head.collection("receipts").stream())), 1)

    def test_old_ack_keeps_latest_head(self):
        self.prepare_commit()
        first = self.commit()
        second = self.commit(request_id="commit_two", expected_revision=1,
                             first_input_sequence=2, last_input_sequence=3)
        replay = self.commit()
        self.assertEqual(replay["committedRevision"], 1)
        self.assertEqual(replay["headRevision"], 2)
        self.assertEqual(self.head.get().to_dict()["commitId"], second["commitId"])
        manifest = self.head.collection("manifests").document(second["commitId"]).get().to_dict()
        self.assertEqual(manifest["parentCommitId"], first["commitId"])

    def test_same_id_changed_payload(self):
        self.prepare_commit()
        self.commit()
        changed = deepcopy(self.manifest)
        changed["projectionVersion"] = "test-projection-v2"
        with self.assertRaisesRegex(ScoringTestBoundaryError, "commit-request-conflict"):
            self.commit(manifest=changed, payload_hash=_digest(changed))
        self.assertEqual(self.head.get().to_dict()["revision"], 1)

    def test_missing_block_no_partial_commit(self):
        self.prepare_commit()
        self.ref.collection("uploadBlocks").document(self.manifest["blocks"][0]["blockId"]).delete()
        with self.assertRaisesRegex(ScoringTestBoundaryError, "missing-or-foreign-block"):
            self.commit()
        self.assert_empty_commit()

    def test_corrupt_block_no_partial_commit(self):
        self.prepare_commit()
        self.ref.collection("uploadBlocks").document(self.manifest["blocks"][0]["blockId"]).update({"body": b"bad"})
        with self.assertRaisesRegex(ScoringTestBoundaryError, "commit-block-integrity-failed"):
            self.commit()
        self.assert_empty_commit()

    def test_foreign_block_no_partial_commit(self):
        self.prepare_commit()
        self.ref.collection("uploadBlocks").document(self.manifest["blocks"][0]["blockId"]).update({"matchId": "TEST_SCORING_TWO"})
        with self.assertRaisesRegex(ScoringTestBoundaryError, "missing-or-foreign-block"):
            self.commit()
        self.assert_empty_commit()

    def test_sequence_gap_and_disabled_gate(self):
        self.prepare_commit()
        with self.assertRaisesRegex(ScoringTestBoundaryError, "input-sequence-gap"):
            self.commit(first_input_sequence=2, last_input_sequence=2)
        with patch.dict("os.environ", {"SCORING_TEST_COMMIT_ENABLED": "false"}):
            with self.assertRaisesRegex(ScoringTestBoundaryError, "test-commit-disabled"):
                self.commit()
        self.assert_empty_commit()

    def test_handoff_rejects_old_commit(self):
        self.prepare_commit()
        self.handoff()
        with self.assertRaisesRegex(ScoringTestBoundaryError, "writer-session-mismatch"):
            self.commit()
        self.assert_empty_commit()
        self.assertEqual(self.commit(writer_session_id="tab_two", lock_epoch=2)["committedRevision"], 1)

    def test_concurrent_revision_only_one_commits(self):
        self.prepare_commit()
        barrier = Barrier(2)
        def attempt(index):
            barrier.wait(timeout=10)
            try:
                return self.commit(request_id=f"commit_{index}")
            except ScoringTestBoundaryError as error:
                return str(error)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(attempt, range(2)))
        self.assertEqual(sum(isinstance(result, dict) for result in results), 1)
        self.assertEqual(results.count("commit-revision-conflict"), 1)
        self.assertEqual(self.head.get().to_dict()["revision"], 1)
        for name in ("manifests", "receipts"):
            self.assertEqual(len(list(self.head.collection(name).stream())), 1)
