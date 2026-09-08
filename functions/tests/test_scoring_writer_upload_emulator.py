"""Writer fencing during upload, including real concurrent emulator operations."""
import hashlib
import io
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import Mock, patch

import test_scoring_sessions_emulator as sessions
from scoring_test_boundary import ScoringTestBoundaryError


class WriterUploadEmulatorTests(sessions.SessionsEmulatorTests):
    def upload(self, *, source=None, request_id="fenced_upload", tab="tab_one", epoch=1):
        return self.service.stage_block(self.run["runId"], uid="scorer", match_id="TEST_SCORING_ONE",
            request_id=request_id, source=io.BytesIO(b"abc") if source is None else source,
            expected_bytes=3, expected_sha256=hashlib.sha256(b"abc").hexdigest(),
            writer_session_id=tab, lock_epoch=epoch)

    def assert_no_block(self):
        self.assertEqual(list(self.ref.collection("uploadBlocks").stream()), [])

    def test_missing_session_denies_before_read(self):
        self.prepare_sessions()
        source = Mock()
        with self.assertRaisesRegex(ScoringTestBoundaryError, "writer-not-active"):
            self.upload(source=source)
        source.read.assert_not_called()
        self.assertEqual(self.ref.get().to_dict()["requestCount"], 0)
        self.assert_no_block()

    def test_other_tab_and_old_epoch_denied_before_read(self):
        self.prepare_sessions()
        self.acquire()
        self.handoff()
        for tab, epoch in (("tab_one", 1), ("tab_two", 1), ("wrong_tab", 2)):
            source = Mock()
            with self.subTest(tab=tab, epoch=epoch), self.assertRaisesRegex(ScoringTestBoundaryError, "writer-session-mismatch"):
                self.upload(source=source, tab=tab, epoch=epoch)
            source.read.assert_not_called()
        self.assertEqual(self.ref.get().to_dict()["requestCount"], 0)
        self.assert_no_block()

    def test_handoff_during_stream_denies_before_reservation(self):
        self.prepare_sessions()
        self.acquire()
        body = io.BytesIO(b"abc")
        source = Mock()
        def read(amount):
            if body.tell() == 0:
                self.handoff()
            return body.read(amount)
        source.read.side_effect = read
        with self.assertRaisesRegex(ScoringTestBoundaryError, "writer-session-mismatch"):
            self.upload(source=source)
        self.assertEqual(self.ref.get().to_dict()["requestCount"], 0)
        self.assert_no_block()

    def test_handoff_after_reservation_denies_commit(self):
        self.prepare_sessions()
        self.acquire()
        reserve = self.registry.reserve
        def handoff_after(*args, **kwargs):
            result = reserve(*args, **kwargs)
            self.handoff()
            return result
        with patch.object(self.registry, "reserve", side_effect=handoff_after):
            with self.assertRaisesRegex(ScoringTestBoundaryError, "writer-session-mismatch"):
                self.upload()
        self.assertEqual(self.ref.get().to_dict()["reservedUploadBytes"], 3)
        self.assert_no_block()

    def test_new_writer_request_binding_and_original_metadata(self):
        self.prepare_sessions()
        self.acquire()
        first = self.upload()
        block_ref = self.ref.collection("uploadBlocks").document(first["blockId"])
        original = block_ref.get().to_dict()
        self.handoff()
        with self.assertRaisesRegex(ScoringTestBoundaryError, "request-id-conflict"):
            self.upload(tab="tab_two", epoch=2)
        result = self.upload(request_id="new_writer_upload", tab="tab_two", epoch=2)
        self.assertTrue(result["replayed"])
        self.assertEqual(result["lockEpoch"], 2)
        self.assertEqual(block_ref.get().to_dict(), original)
        self.assertEqual(original["writerSessionId"], "tab_one")
        self.assertEqual(original["lockEpoch"], 1)

    def test_concurrent_upload_handoff(self):
        self.prepare_sessions()
        self.acquire()
        barrier = Barrier(2)
        def upload():
            barrier.wait(timeout=10)
            try:
                return self.upload()
            except ScoringTestBoundaryError as error:
                return str(error)
        def handoff():
            barrier.wait(timeout=10)
            return self.handoff()
        with ThreadPoolExecutor(max_workers=2) as pool:
            pending_upload = pool.submit(upload)
            pending_handoff = pool.submit(handoff)
            result, new_writer = pending_upload.result(), pending_handoff.result()
        self.assertEqual(new_writer["lockEpoch"], 2)
        self.assertEqual(self.current_session()["writerSessionId"], "tab_two")
        if isinstance(result, dict):
            # A commit preceding handoff is valid; subsequent old writes aren't.
            block = self.ref.collection("uploadBlocks").document(result["blockId"]).get().to_dict()
            self.assertEqual(block["lockEpoch"], 1)
        else:
            self.assertEqual(result, "writer-session-mismatch")
            self.assert_no_block()
        with self.assertRaisesRegex(ScoringTestBoundaryError, "writer-session-mismatch"):
            self.upload(request_id="late_old_writer")
