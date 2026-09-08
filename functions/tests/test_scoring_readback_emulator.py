"""Consistent readback plus inherited commit fault and boundary regression."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from threading import Barrier
from unittest.mock import patch

import test_scoring_commit_faults_emulator as faults
from scoring_test_boundary import ScoringTestBoundaryError
from scoring_test_readback import ScoringTestReadback
from scoring_test_transfer import _digest


class ReadbackEmulatorTests(faults.CommitFaultsEmulatorTests):
    def prepare_readback(self):
        self.prepare_commit()
        self.first_commit = self.commit()
        self.reader = ScoringTestReadback(self.registry)
        flag = patch.dict("os.environ", {"SCORING_TEST_READBACK_ENABLED": "true"})
        flag.start()
        self.addCleanup(flag.stop)

    def read(self, **overrides):
        args = dict(uid="viewer", match_id="TEST_SCORING_ONE")
        args.update(overrides)
        return self.reader.read(self.run["runId"], **args)

    def test_committed_readback(self):
        self.prepare_readback()
        result = self.read(expected_revision=1)
        self.assertEqual(result["revision"], 1)
        self.assertEqual(result["commitId"], self.first_commit["commitId"])
        self.assertEqual(result["payloadHash"], self.first_commit["payloadHash"])
        self.assertFalse(result["published"])
        self.assertEqual(result["blocksByKind"], {kind: [b"abc"] for kind in ("state", "feed", "events", "stats")})

    def test_readback_revision_mismatch(self):
        self.prepare_readback()
        with self.assertRaisesRegex(ScoringTestBoundaryError, "readback-revision-changed"):
            self.read(expected_revision=2)

    def test_readback_missing_block(self):
        self.prepare_readback()
        self.ref.collection("uploadBlocks").document(self.manifest["blocks"][0]["blockId"]).delete()
        with self.assertRaisesRegex(ScoringTestBoundaryError, "readback-block-missing-or-foreign"):
            self.read()

    def test_readback_corrupt_block(self):
        self.prepare_readback()
        self.ref.collection("uploadBlocks").document(self.manifest["blocks"][0]["blockId"]).update({"body": b"bad"})
        with self.assertRaisesRegex(ScoringTestBoundaryError, "readback-block-integrity-failed"):
            self.read()

    def test_readback_foreign_block(self):
        self.prepare_readback()
        self.ref.collection("uploadBlocks").document(self.manifest["blocks"][0]["blockId"]).update({"matchId": "TEST_SCORING_TWO"})
        with self.assertRaisesRegex(ScoringTestBoundaryError, "readback-block-missing-or-foreign"):
            self.read()

    def test_readback_manifest_hash_mismatch(self):
        self.prepare_readback()
        self.head.collection("manifests").document(self.first_commit["commitId"]).update({"projectionVersion": "tampered"})
        with self.assertRaisesRegex(ScoringTestBoundaryError, "readback-manifest-hash-mismatch"):
            self.read()

    def test_readback_access_and_disabled_gate(self):
        self.prepare_readback()
        with self.assertRaisesRegex(ScoringTestBoundaryError, "not-a-participant"):
            self.read(uid="outsider")
        with patch.dict("os.environ", {"SCORING_TEST_READBACK_ENABLED": "false"}):
            with self.assertRaisesRegex(ScoringTestBoundaryError, "test-readback-disabled"):
                self.read()
        self.registry.stop(self.run["runId"], actor_uid="admin", operator_authorized=True)
        with self.assertRaisesRegex(ScoringTestBoundaryError, "run-not-active"):
            self.read()

    def test_concurrent_commit_readback_single_revision(self):
        self.prepare_readback()
        next_manifest = deepcopy(self.manifest)
        next_manifest["projectionVersion"] = "test-projection-v2"
        barrier = Barrier(2)
        def read():
            barrier.wait(timeout=10)
            return self.read()
        def commit():
            barrier.wait(timeout=10)
            return self.commit(request_id="readback_next", expected_revision=1,
                               first_input_sequence=2, last_input_sequence=2,
                               manifest=next_manifest, payload_hash=_digest(next_manifest))
        with ThreadPoolExecutor(max_workers=2) as pool:
            pending_read = pool.submit(read)
            pending_commit = pool.submit(commit)
            result, second = pending_read.result(), pending_commit.result()
        expected = {
            1: (self.first_commit["commitId"], self.first_commit["payloadHash"], "test-projection-v1"),
            2: (second["commitId"], second["payloadHash"], "test-projection-v2"),
        }
        self.assertIn(result["revision"], expected)
        self.assertEqual((result["commitId"], result["payloadHash"], result["projectionVersion"]), expected[result["revision"]])
        self.assertEqual(self.read(expected_revision=2)["commitId"], second["commitId"])
