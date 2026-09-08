"""Pure writer identity checks."""
import unittest

from scoring_test_boundary import ScoringTestBoundaryError
from scoring_test_sessions import assert_writer


class WriterIdentityTests(unittest.TestCase):
    def setUp(self):
        self.session = {"uid": "scorer", "writerSessionId": "tab_one", "lockEpoch": 2, "status": "active"}

    def check(self, **overrides):
        args = dict(uid="scorer", writer_session_id="tab_one", lock_epoch=2)
        args.update(overrides)
        return assert_writer(self.session, **args)

    def test_current_identity(self):
        self.assertIsNone(self.check())

    def test_same_account_different_tab(self):
        with self.assertRaisesRegex(ScoringTestBoundaryError, "writer-session-mismatch"):
            self.check(writer_session_id="tab_two")

    def test_old_epoch(self):
        with self.assertRaisesRegex(ScoringTestBoundaryError, "writer-session-mismatch"):
            self.check(lock_epoch=1)

    def test_other_uid(self):
        with self.assertRaisesRegex(ScoringTestBoundaryError, "writer-session-mismatch"):
            self.check(uid="admin")

    def test_invalid_epoch_types(self):
        for value in (True, 0, -1, 2.0, 9007199254740992):
            with self.subTest(value=value), self.assertRaisesRegex(ScoringTestBoundaryError, "invalid-lock-epoch"):
                self.check(lock_epoch=value)

    def test_inactive_or_missing(self):
        for session in (None, {}, {**self.session, "status": "sealed"}):
            with self.subTest(session=session), self.assertRaisesRegex(ScoringTestBoundaryError, "writer-not-active"):
                assert_writer(session, uid="scorer", writer_session_id="tab_one", lock_epoch=2)
