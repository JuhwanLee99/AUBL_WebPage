"""Private manifest schema tests, independent of Firebase."""
import unittest

from scoring_test_boundary import ScoringTestBoundaryError
from scoring_test_commits import validate_manifest


def manifest_fixture(block_id="a" * 64, digest="b" * 64, size=3):
    return {"version": 1, "matchId": "TEST_SCORING_ONE", "ruleProfileVersion": "test-profile-v1",
            "engineVersion": "test-engine-v1", "projectionVersion": "test-projection-v1",
            "blocks": [{"kind": kind, "blockId": block_id, "sha256": digest, "size": size}
                       for kind in ("state", "feed", "events", "stats")]}


class ManifestTests(unittest.TestCase):
    def test_valid_detached_manifest(self):
        original = manifest_fixture()
        result = validate_manifest(original, "TEST_SCORING_ONE")
        result["blocks"][0]["size"] = 0
        self.assertEqual(original["blocks"][0]["size"], 3)

    def test_missing_kind(self):
        data = manifest_fixture()
        data["blocks"][0] = {**data["blocks"][0], "kind": "feed", "blockId": "c" * 64}
        with self.assertRaisesRegex(ScoringTestBoundaryError, "incomplete-manifest"):
            validate_manifest(data, "TEST_SCORING_ONE")

    def test_duplicate_descriptor(self):
        data = manifest_fixture()
        data["blocks"].append(dict(data["blocks"][0]))
        with self.assertRaisesRegex(ScoringTestBoundaryError, "duplicate-manifest-block"):
            validate_manifest(data, "TEST_SCORING_ONE")

    def test_foreign_scope(self):
        with self.assertRaisesRegex(ScoringTestBoundaryError, "manifest-scope-mismatch"):
            validate_manifest(manifest_fixture(), "TEST_SCORING_TWO")

    def test_invalid_size_and_version(self):
        for value in (True, -1, 131073):
            with self.subTest(value=value), self.assertRaisesRegex(ScoringTestBoundaryError, "invalid-block-size"):
                validate_manifest(manifest_fixture(size=value), "TEST_SCORING_ONE")
        data = manifest_fixture()
        data["version"] = True
        with self.assertRaises(ScoringTestBoundaryError):
            validate_manifest(data, "TEST_SCORING_ONE")
