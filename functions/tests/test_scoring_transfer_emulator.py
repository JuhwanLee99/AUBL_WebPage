"""Scoped block tests plus existing resource/approval/registry regression."""
import hashlib
import io
from unittest.mock import patch

import test_scoring_resources_emulator as resources
from scoring_test_boundary import ScoringTestBoundaryError
from scoring_test_transfer import ScoringTestTransferService


class TransferEmulatorTests(resources.ResourcesEmulatorTests):
    def cleanup_run(self):
        blocks = self.ref.collection("uploadBlocks")
        for block in blocks.stream():
            block.reference.delete()
        self.assertEqual(list(blocks.stream()), [])
        super().cleanup_run()

    def prepare_transfer(self, second_match=False):
        if second_match:
            self.run["matchIds"].append("TEST_SCORING_TWO")
            # Register a complete two-match approval, rather than modifying an
            # approved active run to bypass drift validation.
            from test_scoring_test_application import request, specification
            from scoring_test_application import ScoringTestApplication
            self.ref.delete()
            manifest = specification(self.run)
            manifest["scenarioByMatch"]["TEST_SCORING_TWO"] = "recovery-handoff"
            ScoringTestApplication(self.registry).register_from_callable(request({"run": self.run, "executionManifest": manifest}))
        else:
            self.register_with_audit()
        self.activate_fixture()
        self.service = ScoringTestTransferService(self.registry)

    def stage(self, request_id="block_one", body=b"abc", match_id="TEST_SCORING_ONE", digest=None):
        from scoring_test_sessions import ScoringTestWriterSessions
        writer = ScoringTestWriterSessions(self.registry).acquire(self.run["runId"], uid="scorer",
            match_id=match_id, writer_session_id="upload_tab")
        return self.service.stage_block(self.run["runId"], uid="scorer", match_id=match_id,
            request_id=request_id, source=io.BytesIO(body), expected_bytes=len(body),
            expected_sha256=digest or hashlib.sha256(body).hexdigest(),
            writer_session_id=writer["writerSessionId"], lock_epoch=writer["lockEpoch"])

    def test_block_staged_not_published(self):
        self.prepare_transfer()
        result = self.stage()
        stored = self.ref.collection("uploadBlocks").document(result["blockId"]).get().to_dict()
        self.assertEqual(stored["body"], b"abc")
        self.assertEqual(stored["size"], 3)
        self.assertFalse(result["published"])
        self.assertFalse(result["replayed"])

    def test_block_retry_preserves_original(self):
        self.prepare_transfer()
        first = self.stage()
        ref = self.ref.collection("uploadBlocks").document(first["blockId"])
        before = ref.get().to_dict()
        self.assertTrue(self.stage()["replayed"])
        self.assertEqual(ref.get().to_dict(), before)
        self.assertEqual(self.ref.get().to_dict()["reservedUploadBytes"], 3)

    def test_hash_failure_no_reservation_or_block(self):
        self.prepare_transfer()
        with self.assertRaisesRegex(ScoringTestBoundaryError, "upload-hash-mismatch"):
            self.stage(digest="0" * 64)
        self.assertEqual(self.ref.get().to_dict()["requestCount"], 0)
        self.assertEqual(list(self.ref.collection("uploadBlocks").stream()), [])

    def test_stop_after_reservation_prevents_block(self):
        self.prepare_transfer()
        reserve = self.registry.reserve
        def stop_after(*args, **kwargs):
            result = reserve(*args, **kwargs)
            self.registry.stop(self.run["runId"], actor_uid="admin", operator_authorized=True)
            return result
        with patch.object(self.registry, "reserve", side_effect=stop_after):
            with self.assertRaisesRegex(ScoringTestBoundaryError, "run-not-active"):
                self.stage()
        self.assertEqual(list(self.ref.collection("uploadBlocks").stream()), [])
        self.assertEqual(self.ref.get().to_dict()["reservedUploadBytes"], 3)

    def test_same_content_separate_matches(self):
        self.prepare_transfer(second_match=True)
        first = self.stage()
        second = self.stage(request_id="block_two", match_id="TEST_SCORING_TWO")
        self.assertNotEqual(first["blockId"], second["blockId"])
        self.assertEqual(len(list(self.ref.collection("uploadBlocks").stream())), 2)

    def test_existing_block_cannot_be_overwritten(self):
        self.prepare_transfer()
        first = self.stage()
        ref = self.ref.collection("uploadBlocks").document(first["blockId"])
        # Test-only corruption through the emulator Admin client.
        ref.update({"body": b"bad"})
        with self.assertRaisesRegex(ScoringTestBoundaryError, "immutable-block-conflict"):
            self.stage()
        self.assertEqual(ref.get().to_dict()["body"], b"bad")

    def test_approved_run_drift_prevents_upload(self):
        self.prepare_transfer()
        self.ref.update({"maxRequests": 5})
        with self.assertRaisesRegex(ScoringTestBoundaryError, "approved-run-drift"):
            self.stage()
        self.assertEqual(self.ref.get().to_dict()["requestCount"], 0)
