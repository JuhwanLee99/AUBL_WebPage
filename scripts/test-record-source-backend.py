import copy
import os
from pathlib import Path
import sys
import time
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts/e2e/record-sources"))
from backend_fixture import connect, fixture, seed, promote, clean
from record_source_policy import public_official_record
from record_sources import promote_from_request, promote_record_source
from firebase_functions import https_fn


class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.official, self.schedule, self.core = fixture("LOCAL_TEST_SOURCE_PURE")

    def test_public_projection_and_stable_hash(self):
        self.official["cookie"] = "PRIVATE_COOKIE"
        self.official["detail"]["teams"][0]["workerEvidence"] = "PRIVATE_EVIDENCE"
        first, digest = public_official_record(self.schedule, self.official, "LOCAL_REVISION_1")
        self.assertNotIn("cookie", first)
        self.assertNotIn("workerEvidence", first["detail"]["teams"][0])
        self.assertEqual(len(digest), 64)
        self.assertEqual(public_official_record(self.schedule, self.official, "LOCAL_REVISION_1")[1], digest)

    def test_rejection_matrix(self):
        cases = [
            ("provider", "raw", ["provider"], "OTHER"),
            ("uncollected", "raw", ["status"], "NOT_COLLECTED"),
            ("review", "raw", ["status"], "REVIEW_REQUIRED"),
            ("pending", "raw", ["quality"], "CORRECTION_PENDING"),
            ("unknown quality", "raw", ["quality"], None),
            ("wrong source", "raw", ["sourceGameId"], "OTHER"),
            ("wrong season", "raw", ["seasonId"], 98),
            ("boolean season", "raw", ["seasonId"], True),
            ("wrong revision", "raw", ["syncRevision"], "OTHER"),
            ("in progress", "raw", ["game", "status"], "IN_PROGRESS"),
            ("missing final score", "raw", ["game", "homeScore"], None),
            ("boolean final score", "raw", ["game", "awayScore"], True),
            ("mismatched team", "raw", ["game", "homeTeamName"], "OTHER"),
            ("detail source", "raw", ["detail", "sourceGameId"], "OTHER"),
            ("missing boxscore", "raw", ["detail", "status"], "NOT_PUBLISHED"),
            ("practice", "schedule", ["recordMode"], "practice"),
            ("inactive", "schedule", ["sourceActive"], False),
            ("live match", "schedule", ["status"], "inProgress"),
            ("line score mismatch", "raw", ["detail", "teams", 0, "innings", 0, "runs"], 9),
            ("duplicate inning", "raw", ["detail", "teams", 0, "innings", 1, "inning"], 1),
            ("unplayed run", "raw", ["detail", "teams", 0, "innings", 1, "notPlayed"], True),
            ("unknown inning run", "raw", ["detail", "teams", 0, "innings", 1, "runs"], None),
            ("unknown total hits", "raw", ["detail", "teams", 0, "totals", "hits"], None),
        ]
        for label, target, path, value in cases:
            with self.subTest(label=label):
                raw, schedule = copy.deepcopy(self.official), copy.deepcopy(self.schedule)
                cursor = raw if target == "raw" else schedule
                for key in path[:-1]: cursor = cursor[key]
                cursor[path[-1]] = value
                with self.assertRaises(ValueError): public_official_record(schedule, raw, "LOCAL_REVISION_1")

    def test_authentication_rejected_before_network(self):
        for auth in [None, mock.Mock(token={"admin": False}), mock.Mock(token={"email": "admin@example.invalid"})]:
            with self.subTest(auth=auth), mock.patch("record_sources.urllib.request.urlopen", side_effect=AssertionError("No network allowed")):
                req = mock.Mock(auth=auth, data={})
                with self.assertRaises(https_fn.HttpsError) as error: promote_from_request(req)
                self.assertEqual(error.exception.code, https_fn.FunctionsErrorCode.PERMISSION_DENIED)


@unittest.skipUnless(os.environ.get("FIRESTORE_EMULATOR_HOST"), "Emulator required for transaction tests")
class TransactionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.db = connect()
    @classmethod
    def tearDownClass(cls): cls.db.close()

    def setUp(self):
        self.match_id = f"LOCAL_TEST_SOURCE_PY_{time.time_ns()}"
        self.official, self.schedule, self.core = seed(self.db, self.match_id)
    def tearDown(self): clean(self.db, self.match_id)
    def snapshot(self, collection): return self.db.document(collection, self.match_id).get().to_dict()

    def test_actual_atomic_cutover_preserves_both_originals(self):
        result = promote(self.db, self.match_id)
        self.assertFalse(result["replayed"])
        public, archive = self.snapshot("matches"), self.snapshot("recordArchives")
        self.assertEqual(archive["schedule"], self.schedule)
        self.assertEqual(self.snapshot("matchStates"), self.core)
        self.assertEqual(public["awayScore"], 3)
        for key in ("postGame", "manualEntryDraft", "lineups", "benches", "notes"): self.assertNotIn(key, public)
        self.assertEqual(self.snapshot("recordSources")["official"]["game"]["awayScore"], 3)
        self.assertEqual(len(list(self.db.document("recordArchives", self.match_id).collection("officialRevisions").stream())), 1)

    def test_identical_retry_is_idempotent(self):
        promote(self.db, self.match_id)
        archived = self.snapshot("recordArchives")
        self.assertTrue(promote(self.db, self.match_id)["replayed"])
        self.assertEqual(self.snapshot("recordArchives"), archived)
        self.assertEqual(len(list(self.db.document("recordArchives", self.match_id).collection("officialRevisions").stream())), 1)

    def test_new_revision_keeps_first_live_archive(self):
        promote(self.db, self.match_id)
        archived = self.snapshot("recordArchives")
        self.official["syncRevision"] = "LOCAL_REVISION_2"
        self.db.document("matches", self.match_id).update({"syncRevision": "LOCAL_REVISION_2"})
        promote(self.db, self.match_id, self.official)
        self.assertEqual(self.snapshot("recordArchives"), archived)
        self.assertEqual(self.snapshot("recordSources")["revision"], "LOCAL_REVISION_2")
        self.assertEqual(len(list(self.db.document("recordArchives", self.match_id).collection("officialRevisions").stream())), 2)

    def test_same_revision_changed_body_is_rejected(self):
        promote(self.db, self.match_id)
        prior = self.snapshot("recordSources")
        self.official["game"]["venue"] = "OTHER TEST VENUE"
        with self.assertRaises(https_fn.HttpsError): promote(self.db, self.match_id, self.official)
        self.assertEqual(self.snapshot("recordSources"), prior)

    def test_schedule_revision_mismatch_does_not_partially_archive(self):
        self.db.document("matches", self.match_id).update({"syncRevision": "LOCAL_REVISION_2"})
        with self.assertRaises(https_fn.HttpsError): promote(self.db, self.match_id)
        self.assertIsNone(self.snapshot("recordArchives")); self.assertIsNone(self.snapshot("recordSources"))
        self.assertIn("postGame", self.snapshot("matches"))

    def test_recent_save_and_live_game_are_not_archived(self):
        for patch in [{"gameOver": False}, {"gameOver": True, "updatedAt": int(time.time() * 1000)}]:
            with self.subTest(patch=patch):
                self.db.document("matchStates", self.match_id).update(patch)
                with self.assertRaises(https_fn.HttpsError): promote(self.db, self.match_id)
                self.assertIsNone(self.snapshot("recordSources")); self.assertIsNone(self.snapshot("recordArchives"))

    def test_missing_first_archive_never_gets_overwritten(self):
        self.db.document("matches", self.match_id).update({"recordAuthority": "UNIQUE_PLAY"})
        with self.assertRaises(https_fn.HttpsError): promote(self.db, self.match_id)
        self.assertIsNone(self.snapshot("recordArchives"))

    def test_default_disabled_makes_no_network_request(self):
        with mock.patch.dict(os.environ, {"RECORD_SOURCE_PROMOTION_ENABLED": "false"}), mock.patch("record_sources.urllib.request.urlopen", side_effect=AssertionError("No network allowed")):
            with self.assertRaises(https_fn.HttpsError): promote_record_source(self.db, self.match_id, "LOCAL_REVISION_1", "LOCAL_SOURCE_ADMIN")
        self.assertIsNone(self.snapshot("recordSources"))

    def test_deleted_match_not_published(self):
        self.db.document("matches", self.match_id).update({"deleted": True})
        with self.assertRaises(https_fn.HttpsError): promote(self.db, self.match_id)
        self.assertIsNone(self.snapshot("recordArchives"))


if __name__ == "__main__": unittest.main(verbosity=2)
