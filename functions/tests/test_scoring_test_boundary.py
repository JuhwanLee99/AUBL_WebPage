"""Pure policy checks; no credentials, network, or Firebase initialization."""
import unittest

from scoring_test_boundary import ScoringTestBoundaryError, authorize_run, validate_run


def fixture():
    return {
        "version": 1, "runId": "TEST_RUN_POLICY", "projectId": "demo-aubl-scoring",
        "apiOrigin": "https://test.invalid", "status": "active",
        "createdAtMs": 1000, "approvedAtMs": 2000, "expiresAtMs": 10000,
        "approvedByUid": "admin", "matchIds": ["TEST_SCORING_ONE"],
        "participants": [{"uid": role, "role": role} for role in ("admin", "scorer", "viewer")],
        "operations": ["read", "record", "review", "promote"], "maxRequests": 4,
    }


def access(run, **overrides):
    args = dict(uid="scorer", match_id="TEST_SCORING_ONE", operation="record",
                project_id="demo-aubl-scoring", api_origin="https://test.invalid", now_ms=3000)
    args.update(overrides)
    return authorize_run(run, **args)


class BoundaryPolicyTests(unittest.TestCase):
    def test_detached_valid_manifest(self):
        original = fixture()
        result = validate_run(original)
        result["matchIds"].append("TEST_SCORING_TWO")
        self.assertEqual(original["matchIds"], ["TEST_SCORING_ONE"])

    def test_exact_duration_limit(self):
        run = fixture()
        run["expiresAtMs"] = run["createdAtMs"] + 86400000
        self.assertEqual(validate_run(run), run)


INVALID_FIELDS = [
    ("version", True), ("version", 2), ("runId", "normal"), ("runId", "TEST_RUN_/escape"),
    ("projectId", "../production"), ("status", "unknown"), ("status", []),
    ("createdAtMs", True), ("createdAtMs", -1), ("approvedAtMs", 999),
    ("approvedAtMs", 10000), ("expiresAtMs", 86401001), ("expiresAtMs", float("inf")),
    ("matchIds", []), ("matchIds", ["ordinary"]),
    ("matchIds", ["TEST_SCORING_ONE"] * 2),
    ("matchIds", [f"TEST_SCORING_{i}" for i in range(4)]),
    ("participants", []), ("participants", [{"uid": "admin", "role": "root"}]),
    ("participants", [{"uid": "admin", "role": "admin"}] * 2),
    ("approvedByUid", "viewer"), ("operations", []), ("operations", ["delete"]),
    ("operations", ["read", "read"]), ("operations", [{}]),
    ("maxRequests", True), ("maxRequests", 0), ("maxRequests", 10001), ("maxRequests", 1.5),
    *[("apiOrigin", value) for value in (
        "http://test.invalid", "https://user:pass@test.invalid", "https://test.invalid/",
        "https://test.invalid/path", "https://test.invalid?x=1", "https://test.invalid#x",
        "https://test.invalid:0", "https://test.invalid:99999", "https://test.invalid\n",
    )],
]


def invalid_case(field, value):
    def test(self):
        run = fixture()
        run[field] = value
        with self.assertRaises(ScoringTestBoundaryError):
            validate_run(run)
    return test


for index, (field, value) in enumerate(INVALID_FIELDS):
    setattr(BoundaryPolicyTests, f"test_invalid_{index:02d}_{field}", invalid_case(field, value))


def role_case(role, operation):
    def test(self):
        allowed = {"admin": {"read", "record", "review", "promote"},
                   "scorer": {"read", "record"}, "viewer": {"read"}}[role]
        if operation in allowed:
            self.assertEqual(access(fixture(), uid=role, operation=operation)["runId"], "TEST_RUN_POLICY")
        else:
            with self.assertRaises(ScoringTestBoundaryError):
                access(fixture(), uid=role, operation=operation)
    return test


for role in ("admin", "scorer", "viewer"):
    for operation in ("read", "record", "review", "promote"):
        setattr(BoundaryPolicyTests, f"test_role_{role}_{operation}", role_case(role, operation))


def access_case(overrides):
    def test(self):
        with self.assertRaises(ScoringTestBoundaryError):
            access(fixture(), **overrides)
    return test


for index, overrides in enumerate([
    {"uid": None}, {"uid": "outsider"}, {"project_id": "production"},
    {"api_origin": "https://api.aubl.club"}, {"match_id": "ordinary"},
    {"operation": "delete"}, {"now_ms": 1999}, {"now_ms": 10000}, {"now_ms": True},
]):
    setattr(BoundaryPolicyTests, f"test_access_rejected_{index:02d}", access_case(overrides))


def status_case(status):
    def test(self):
        run = fixture()
        run["status"] = status
        with self.assertRaisesRegex(ScoringTestBoundaryError, "run-not-active"):
            access(run)
    return test


for status in ("disabled", "stopped", "closed"):
    setattr(BoundaryPolicyTests, f"test_status_{status}", status_case(status))


if __name__ == "__main__":
    unittest.main()
