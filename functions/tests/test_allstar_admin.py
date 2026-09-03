from __future__ import annotations

import unittest
from datetime import datetime, timezone
from typing import Any

from firebase_functions import https_fn

from allstar_admin import _admin_ballot_log
from allstar_admin import _build_admin_overview
from allstar_admin import _full_audit_requested
from allstar_admin import _is_admin_token
from allstar_admin import _ledger_link_issues
from allstar_admin import _log_limit
from allstar_admin import MAX_AUDIT_BALLOTS
from allstar_admin import MAX_AUDIT_ELIGIBILITY
from allstar_results import MAX_RESULT_BALLOTS
from allstar_voting import ALLSTAR_SELECTION_LIMITS
from allstar_voting import ALLSTAR_SIDES
from allstar_voting import POLICY_ONCE_PER_EVENT
from allstar_voting import POLICY_ONCE_PER_DAY
from allstar_voting import _submission_fingerprint


BALLOT_ID_A = "a" * 64
BALLOT_ID_B = "b" * 64


def _candidate_set() -> dict[str, Any]:
    candidates: dict[str, dict[str, str]] = {}
    contests: dict[str, dict[str, Any]] = {}
    for side in ALLSTAR_SIDES:
        for position, selection_limit in ALLSTAR_SELECTION_LIMITS.items():
            candidate_count = 15 if position == "OF" else 5
            candidate_ids = []
            for index in range(1, candidate_count + 1):
                candidate_id = f"{side.lower()}-{position.lower()}-{index}"
                candidate_ids.append(candidate_id)
                candidates[candidate_id] = {
                    "name": f"{side} {position} 후보 {index}",
                    "school": f"학교 {index}",
                    "side": side,
                    "position": position,
                }
            contests[f"{side}:{position}"] = {
                "label": f"{side} {position}",
                "side": side,
                "position": position,
                "candidateIds": candidate_ids,
                "minSelections": selection_limit,
                "maxSelections": selection_limit,
            }
    return {
        "published": True,
        "division": "allstar",
        "version": "v1",
        "candidates": candidates,
        "contests": contests,
    }


def _selections(candidate_set: dict[str, Any]) -> dict[str, list[str]]:
    return {
        contest_id: contest["candidateIds"][: contest["maxSelections"]]
        for contest_id, contest in candidate_set["contests"].items()
    }


def _ballot(candidate_set: dict[str, Any], submitted_at: datetime) -> dict[str, Any]:
    # The hash is filled after one validation pass by _build_admin_overview.
    from allstar_voting import _public_candidate_set

    public_set = _public_candidate_set(candidate_set, "allstar", "v1")
    ballot = {
        "schemaVersion": 2,
        "eventId": "event",
        "division": "allstar",
        "candidateSetId": "set-v1",
        "candidateVersion": "v1",
        "candidateSetHash": public_set["contentHash"],
        "policy": POLICY_ONCE_PER_EVENT,
        "periodKey": "event",
        "localDate": "2026-07-20",
        "selections": _selections(candidate_set),
        "submissionId": "submission-test",
        "voterKeyVersion": "provider-subject-hmac-sha256-v2",
        "submittedAt": submitted_at,
    }
    ballot["submissionFingerprint"] = _submission_fingerprint(
        "event",
        "allstar",
        "v1",
        str(ballot["submissionId"]),
        ballot["selections"],
    )
    return ballot


def _eligibility(ballot_id: str, ballot: dict[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "eventId": "event",
        "division": "allstar",
        "lastBallotId": ballot_id,
        "lastPolicy": ballot["policy"],
        "lastPeriodKey": ballot["periodKey"],
        "lastLocalDate": ballot["localDate"],
        "lastCandidateVersion": ballot["candidateVersion"],
        "lastSubmissionId": ballot["submissionId"],
        "lastSubmissionFingerprint": ballot["submissionFingerprint"],
        "voterKeyVersion": "provider-subject-hmac-sha256-v2",
    }


def _event(policy: str = POLICY_ONCE_PER_EVENT) -> dict[str, Any]:
    return {
        "enabled": True,
        "status": "CLOSED",
        "title": "2026 AUBL ALL-STAR",
        "policy": policy,
        "timezone": "Asia/Seoul",
        "divisions": {
            "allstar": {
                "label": "올스타",
                "enabled": True,
                "published": True,
                "status": "CLOSED",
                "candidateSetId": "set-v1",
                "candidateVersion": "v1",
                "resultsPublished": True,
            }
        },
    }


def _result(candidate_set: dict[str, Any], ballot: dict[str, Any]) -> dict[str, Any]:
    from allstar_voting import _public_candidate_set

    public_set = _public_candidate_set(candidate_set, "allstar", "v1")
    counts = {candidate_id: 0 for candidate_id in public_set["candidates"]}
    for selected in ballot["selections"].values():
        for candidate_id in selected:
            counts[candidate_id] += 1
    return {
        "published": True,
        "candidateVersion": "v1",
        "candidateSetHash": public_set["contentHash"],
        "totalBallots": 1,
        "counts": counts,
        "updatedAt": ballot["submittedAt"],
    }


class AdminVotingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.candidate_set = _candidate_set()
        self.now = datetime(2026, 7, 20, 6, 0, tzinfo=timezone.utc)
        self.ballot = _ballot(self.candidate_set, self.now)

    def test_admin_claim_requires_boolean_true(self) -> None:
        self.assertTrue(_is_admin_token({"admin": True}))
        self.assertFalse(_is_admin_token({"admin": "true"}))
        self.assertFalse(_is_admin_token({"allstarVoteAuditor": True}))

    def test_full_audit_collection_limits_match_result_rebuild_capacity(self) -> None:
        self.assertEqual(MAX_AUDIT_BALLOTS, MAX_RESULT_BALLOTS)
        self.assertEqual(MAX_AUDIT_ELIGIBILITY, MAX_RESULT_BALLOTS)

    def test_admin_request_options_reject_bool_limit_and_non_bool_audit(self) -> None:
        with self.assertRaises(https_fn.HttpsError):
            _log_limit({"limit": True})
        with self.assertRaises(https_fn.HttpsError):
            _log_limit({"limit": 201})
        with self.assertRaises(https_fn.HttpsError):
            _full_audit_requested({"fullAudit": "yes"})

    def test_redacted_log_never_returns_ballot_id_or_selections(self) -> None:
        log = _admin_ballot_log(
            BALLOT_ID_A,
            self.ballot,
            "event",
            "allstar",
            {"set-v1": self.candidate_set},
        )
        self.assertEqual(log["integrity"], "OK")
        self.assertEqual(log["selectedCount"], 24)
        self.assertNotIn("selections", log)
        self.assertNotIn(BALLOT_ID_A, str(log))
        self.assertEqual(len(log["receiptCode"]), 12)

    def test_tampered_ballot_is_flagged_without_exposing_choices(self) -> None:
        tampered = dict(self.ballot)
        tampered["candidateSetHash"] = "wrong"
        log = _admin_ballot_log(
            BALLOT_ID_A,
            tampered,
            "event",
            "allstar",
            {"set-v1": self.candidate_set},
        )
        self.assertEqual(log["integrity"], "REVIEW")
        self.assertIn("CANDIDATE_HASH_MISMATCH", log["issues"])
        self.assertNotIn("selections", log)

    def test_injected_identity_fields_and_unsafe_metadata_are_never_returned(self) -> None:
        injected = dict(self.ballot)
        injected.update({
            "email": "person@example.com",
            "uid": "firebase-user-id",
            "ip": "203.0.113.9",
            "userAgent": "private-browser-value",
            "candidateVersion": "person@example.com",
            "periodKey": "person@example.com",
        })
        result = _build_admin_overview(
            event_id="event",
            division_id="allstar",
            event=_event(),
            ballots=[(BALLOT_ID_A, injected)],
            eligibility=[
                {
                    **_eligibility(BALLOT_ID_A, self.ballot),
                    "email": "ledger@example.com",
                }
            ],
            candidate_sets={"set-v1": self.candidate_set},
            raw_result={},
            now=self.now,
            limit=100,
            auditor=True,
        )
        serialized = str(result)
        for secret in (
            "person@example.com",
            "firebase-user-id",
            "203.0.113.9",
            "private-browser-value",
            "ledger@example.com",
        ):
            self.assertNotIn(secret, serialized)

    def test_overview_detects_ballot_eligibility_count_mismatch(self) -> None:
        event = _event()
        result = _build_admin_overview(
            event_id="event",
            division_id="allstar",
            event=event,
            ballots=[(BALLOT_ID_A, self.ballot)],
            eligibility=[],
            candidate_sets={"set-v1": self.candidate_set},
            raw_result={},
            now=self.now,
            limit=100,
            auditor=False,
        )
        self.assertEqual(result["metrics"]["ballotCount"], 1)
        self.assertEqual(result["metrics"]["validBallotCount"], 1)
        self.assertIn("BALLOT_ELIGIBILITY_COUNT_MISMATCH", result["warnings"])
        self.assertTrue(result["redacted"])
        self.assertNotIn("selections", str(result))

    def test_full_audit_detects_misdirected_eligibility_pointer(self) -> None:
        issues = _ledger_link_issues(
            event_id="event",
            division_id="allstar",
            policy=POLICY_ONCE_PER_EVENT,
            ballots=[(BALLOT_ID_A, self.ballot)],
            eligibility=[
                {
                    **_eligibility(BALLOT_ID_A, self.ballot),
                    "lastBallotId": BALLOT_ID_B,
                }
            ],
        )
        self.assertEqual(issues["ELIGIBILITY_BALLOT_NOT_FOUND"], 1)
        self.assertEqual(issues["ELIGIBILITY_BALLOT_SET_MISMATCH"], 1)

    def test_full_audit_recomputes_public_candidate_counts(self) -> None:
        raw_result = _result(self.candidate_set, self.ballot)
        result = _build_admin_overview(
            event_id="event",
            division_id="allstar",
            event=_event(),
            ballots=[(BALLOT_ID_A, self.ballot)],
            eligibility=[_eligibility(BALLOT_ID_A, self.ballot)],
            candidate_sets={"set-v1": self.candidate_set},
            raw_result=raw_result,
            now=self.now,
            limit=100,
            auditor=False,
        )
        self.assertTrue(result["publicResult"]["schemaValid"])
        self.assertTrue(result["publicResult"]["countsMatchBallots"])
        self.assertNotIn("PUBLIC_RESULT_RECONCILIATION_REQUIRED", result["warnings"])

        first_contest = self.candidate_set["contests"]["TEAM_1:P"]
        selected_id, replacement_id = first_contest["candidateIds"][:2]
        raw_result["counts"][selected_id] = 0
        raw_result["counts"][replacement_id] = 1
        changed = _build_admin_overview(
            event_id="event",
            division_id="allstar",
            event=_event(),
            ballots=[(BALLOT_ID_A, self.ballot)],
            eligibility=[_eligibility(BALLOT_ID_A, self.ballot)],
            candidate_sets={"set-v1": self.candidate_set},
            raw_result=raw_result,
            now=self.now,
            limit=100,
            auditor=False,
        )
        self.assertFalse(changed["publicResult"]["countsMatchBallots"])
        self.assertIn("PUBLIC_RESULT_RECONCILIATION_REQUIRED", changed["warnings"])

    def test_recent_mode_uses_aggregate_counts_without_claiming_full_audit(self) -> None:
        result = _build_admin_overview(
            event_id="event",
            division_id="allstar",
            event=_event(),
            ballots=[(BALLOT_ID_A, self.ballot)],
            eligibility=[],
            candidate_sets={"set-v1": self.candidate_set},
            raw_result={},
            now=self.now,
            limit=100,
            auditor=False,
            ballot_count_override=123,
            eligibility_count_override=123,
            active_ballot_count_override=120,
            full_audit=False,
        )
        self.assertEqual(result["metrics"]["ballotCount"], 123)
        self.assertEqual(result["metrics"]["activeCandidateBallotCount"], 120)
        self.assertEqual(result["metrics"]["inspectedBallotCount"], 1)
        self.assertEqual(result["audit"]["mode"], "RECENT")
        self.assertFalse(result["audit"]["complete"])

    def test_daily_policy_allows_more_ballots_than_eligibility_ledgers(self) -> None:
        event = {
            "enabled": True,
            "status": "OPEN",
            "policy": POLICY_ONCE_PER_DAY,
            "timezone": "Asia/Seoul",
            "divisions": {
                "allstar": {
                    "enabled": True,
                    "published": True,
                    "status": "OPEN",
                    "candidateSetId": "set-v1",
                    "candidateVersion": "v1",
                }
            },
        }
        first = dict(self.ballot)
        first["policy"] = POLICY_ONCE_PER_DAY
        first["periodKey"] = "2026-07-20"
        second = dict(first)
        second["periodKey"] = "2026-07-21"
        second["localDate"] = "2026-07-21"
        result = _build_admin_overview(
            event_id="event",
            division_id="allstar",
            event=event,
            ballots=[(BALLOT_ID_A, first), (BALLOT_ID_B, second)],
            eligibility=[_eligibility(BALLOT_ID_B, second)],
            candidate_sets={"set-v1": self.candidate_set},
            raw_result={},
            now=self.now,
            limit=100,
            auditor=False,
        )
        self.assertTrue(result["metrics"]["ledgerConsistent"])
        self.assertNotIn("BALLOT_ELIGIBILITY_COUNT_MISMATCH", result["warnings"])


if __name__ == "__main__":
    unittest.main()
