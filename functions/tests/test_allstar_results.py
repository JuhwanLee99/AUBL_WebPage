from __future__ import annotations

import unittest
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from firebase_functions import https_fn

from allstar_results import _ledger_is_consistent
from allstar_results import _require_closed
from allstar_results import build_result_snapshot
from allstar_voting import ALLSTAR_SELECTION_LIMITS
from allstar_voting import ALLSTAR_SIDES
from allstar_voting import POLICY_ONCE_PER_DAY
from allstar_voting import POLICY_ONCE_PER_EVENT
from allstar_voting import _public_candidate_set
from allstar_voting import _public_result_summary
from allstar_voting import _submission_fingerprint


def _candidate_set() -> dict[str, Any]:
    candidates: dict[str, dict[str, str]] = {}
    contests: dict[str, dict[str, Any]] = {}
    for side in ALLSTAR_SIDES:
        for position, selection_limit in ALLSTAR_SELECTION_LIMITS.items():
            candidate_count = 15 if position == "OF" else 5
            candidate_ids: list[str] = []
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


def _ballot(candidate_set: dict[str, Any], number: int) -> dict[str, Any]:
    public_set = _public_candidate_set(candidate_set, "allstar", "v1")
    selections = {
        contest_id: contest["candidateIds"][
            number % max(1, len(contest["candidateIds"]) - contest["maxSelections"] + 1):
        ][: contest["maxSelections"]]
        for contest_id, contest in public_set["contests"].items()
    }
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
        "selections": selections,
        "submissionId": f"submission-{number}",
        "voterKeyVersion": "provider-subject-hmac-sha256-v2",
        "submittedAt": datetime(2026, 7, 20, 6, number, tzinfo=timezone.utc),
    }
    ballot["submissionFingerprint"] = _submission_fingerprint(
        "event",
        "allstar",
        "v1",
        str(ballot["submissionId"]),
        selections,
    )
    return ballot


class ResultGenerationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.raw_candidate_set = _candidate_set()
        self.public_candidate_set = _public_candidate_set(
            self.raw_candidate_set,
            "allstar",
            "v1",
        )
        self.generated_at = datetime(2026, 7, 20, 7, 0, tzinfo=timezone.utc)
        self.ballots = [
            ("a" * 64, _ballot(self.raw_candidate_set, 0)),
            ("b" * 64, _ballot(self.raw_candidate_set, 1)),
        ]

    def build(self, ballots: list[tuple[str, dict[str, Any]]] | None = None) -> dict[str, Any]:
        return build_result_snapshot(
            event_id="event",
            division_id="allstar",
            candidate_set_id="set-v1",
            candidate_version="v1",
            public_candidate_set=self.public_candidate_set,
            ballots=ballots if ballots is not None else self.ballots,
            generated_at=self.generated_at,
        )

    def test_closed_ledger_builds_complete_public_contract(self) -> None:
        result = self.build()
        self.assertEqual(result["totalBallots"], 2)
        self.assertEqual(result["sourceBallotCount"], 2)
        self.assertEqual(len(result["sourceDigest"]), 64)
        self.assertEqual(len(result["generationId"]), 64)
        self.assertEqual(result["writerVersion"], "allstar-results-v1")
        self.assertEqual(result["sourcePolicy"], POLICY_ONCE_PER_EVENT)
        self.assertFalse(result["published"])

        validated = _public_result_summary(
            {**result, "published": True},
            self.public_candidate_set,
            "v1",
        )
        self.assertEqual(validated["totalBallots"], 2)
        for contest in self.public_candidate_set["contests"].values():
            contest_total = sum(result["counts"][item] for item in contest["candidateIds"])
            self.assertEqual(contest_total, 2 * contest["maxSelections"])

    def test_source_digest_is_order_independent_but_content_bound(self) -> None:
        first = self.build()
        reversed_order = self.build(list(reversed(self.ballots)))
        self.assertEqual(first["sourceDigest"], reversed_order["sourceDigest"])

        changed_ballots = deepcopy(self.ballots)
        contest = self.public_candidate_set["contests"]["TEAM_1:P"]
        changed_ballots[0][1]["selections"]["TEAM_1:P"] = [contest["candidateIds"][2]]
        changed_ballots[0][1]["submissionFingerprint"] = _submission_fingerprint(
            "event",
            "allstar",
            "v1",
            str(changed_ballots[0][1]["submissionId"]),
            changed_ballots[0][1]["selections"],
        )
        changed = self.build(changed_ballots)
        self.assertNotEqual(first["sourceDigest"], changed["sourceDigest"])

    def test_stale_candidate_identity_aborts_instead_of_skipping_ballot(self) -> None:
        changed = deepcopy(self.ballots)
        changed[1][1]["candidateVersion"] = "v0"
        with self.assertRaises(https_fn.HttpsError) as raised:
            self.build(changed)
        self.assertEqual(raised.exception.details["reason"], "BALLOT_INTEGRITY_ERROR")

    def test_invalid_selection_aborts_result_generation(self) -> None:
        changed = deepcopy(self.ballots)
        changed[0][1]["selections"]["TEAM_1:OF"] = changed[0][1]["selections"]["TEAM_1:OF"][:5]
        with self.assertRaises(https_fn.HttpsError) as raised:
            self.build(changed)
        self.assertEqual(raised.exception.details["reason"], "SELECTION_LIMIT")

    def test_submission_fingerprint_tampering_aborts_result_generation(self) -> None:
        changed = deepcopy(self.ballots)
        changed[0][1]["submissionFingerprint"] = "f" * 64
        with self.assertRaises(https_fn.HttpsError) as raised:
            self.build(changed)
        self.assertEqual(raised.exception.details["reason"], "BALLOT_INTEGRITY_ERROR")

    def test_mixed_policies_abort_result_generation(self) -> None:
        changed = deepcopy(self.ballots)
        changed[1][1]["policy"] = POLICY_ONCE_PER_DAY
        changed[1][1]["periodKey"] = changed[1][1]["localDate"]
        with self.assertRaises(https_fn.HttpsError) as raised:
            self.build(changed)
        self.assertEqual(raised.exception.details["reason"], "MIXED_VOTING_POLICIES")

    def test_ledger_count_rules_cover_event_and_daily_policies(self) -> None:
        self.assertTrue(_ledger_is_consistent(POLICY_ONCE_PER_EVENT, 10, 10))
        self.assertFalse(_ledger_is_consistent(POLICY_ONCE_PER_EVENT, 10, 9))
        self.assertTrue(_ledger_is_consistent(POLICY_ONCE_PER_DAY, 20, 10))
        self.assertFalse(_ledger_is_consistent(POLICY_ONCE_PER_DAY, 20, 0))
        self.assertTrue(_ledger_is_consistent(POLICY_ONCE_PER_DAY, 0, 0))

    def test_time_based_close_without_stored_close_barrier_is_rejected(self) -> None:
        event = {
            "enabled": True,
            "status": "OPEN",
            "closesAt": datetime(2026, 7, 20, 6, 0, tzinfo=timezone.utc),
        }
        division = {"enabled": True, "status": "OPEN"}
        with self.assertRaises(https_fn.HttpsError) as raised:
            _require_closed(event, division, self.generated_at)
        self.assertEqual(
            raised.exception.details["reason"],
            "VOTING_CLOSE_BARRIER_REQUIRED",
        )

    def test_explicit_division_close_is_a_valid_generation_barrier(self) -> None:
        event = {"enabled": True, "status": "OPEN"}
        division = {"enabled": True, "status": "CLOSED"}
        _require_closed(event, division, self.generated_at)


if __name__ == "__main__":
    unittest.main()
