from __future__ import annotations

import unittest
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from firebase_functions import https_fn

from allstar_voting import POLICY_ONCE_PER_DAY
from allstar_voting import POLICY_ONCE_PER_EVENT
from allstar_voting import _derive_ballot_id
from allstar_voting import _ledger_blocks_vote
from allstar_voting import _period_for
from allstar_voting import _public_candidate_set
from allstar_voting import _public_result_summary
from allstar_voting import _require_candidate_version
from allstar_voting import _stable_voter_subject
from allstar_voting import _validate_auth_provider
from allstar_voting import _validate_selections


ALLSTAR_SIDES = ("TEAM_1", "TEAM_2")
ALLSTAR_POSITIONS = ("P", "C", "1B", "2B", "3B", "SS", "OF")


def _raw_allstar_candidate_set() -> dict[str, Any]:
    candidates: dict[str, dict[str, str]] = {}
    contests: dict[str, dict[str, Any]] = {}
    for side in ALLSTAR_SIDES:
        for position in ALLSTAR_POSITIONS:
            candidate_count = 15 if position == "OF" else 5
            required_selections = 6 if position == "OF" else 1
            candidate_ids: list[str] = []
            for index in range(1, candidate_count + 1):
                candidate_id = f"{side.lower()}-{position.lower()}-{index}"
                candidate_ids.append(candidate_id)
                candidates[candidate_id] = {
                    "name": f"{side} {position} 후보 {index}",
                    "school": f"학교 {index}",
                    "position": position,
                    "side": side,
                }
            contests[f"{side}:{position}"] = {
                "label": f"{side} {position}",
                "side": side,
                "position": position,
                "candidateIds": candidate_ids,
                "minSelections": required_selections,
                "maxSelections": required_selections,
            }
    return {
        "published": True,
        "division": "allstar",
        "version": "v1",
        "candidates": candidates,
        "contests": contests,
    }


def _valid_selections(candidate_set: dict[str, Any]) -> dict[str, list[str]]:
    return {
        contest_id: contest["candidateIds"][: contest["maxSelections"]]
        for contest_id, contest in candidate_set["contests"].items()
    }


def _valid_result_counts(candidate_set: dict[str, Any], total_ballots: int) -> dict[str, int]:
    counts = {candidate_id: 0 for candidate_id in candidate_set["candidates"]}
    for contest in candidate_set["contests"].values():
        for candidate_id in contest["candidateIds"][: contest["maxSelections"]]:
            counts[candidate_id] = total_ballots
    return counts


class VotingPolicyTests(unittest.TestCase):
    def test_once_per_event_period_never_has_next_eligibility(self) -> None:
        period, next_eligible = _period_for(
            POLICY_ONCE_PER_EVENT,
            "Asia/Seoul",
            datetime(2026, 7, 11, 15, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(period, "event")
        self.assertIsNone(next_eligible)

    def test_once_per_day_uses_configured_local_calendar_day(self) -> None:
        period, next_eligible = _period_for(
            POLICY_ONCE_PER_DAY,
            "Asia/Seoul",
            datetime(2026, 7, 11, 15, 30, tzinfo=timezone.utc),
        )
        self.assertEqual(period, "2026-07-12")
        self.assertEqual(next_eligible, "2026-07-12T15:00:00+00:00")

    def test_ballot_key_is_scoped_by_event_division_and_period(self) -> None:
        secret = b"x" * 32
        subject = "google.com:stable-google-subject"
        base = _derive_ballot_id(secret, "2026-allstar", "allstar", subject, "event")
        self.assertEqual(base, _derive_ballot_id(secret, "2026-allstar", "allstar", subject, "event"))
        self.assertNotEqual(base, _derive_ballot_id(secret, "2026-allstar", "rookie", subject, "event"))
        self.assertNotEqual(base, _derive_ballot_id(secret, "2026-allstar", "allstar", subject, "2026-07-11"))
        self.assertNotEqual(base, _derive_ballot_id(secret, "2027-allstar", "allstar", subject, "event"))

    def test_policy_transition_does_not_allow_second_vote_on_same_day(self) -> None:
        ledger = {"lastLocalDate": "2026-07-11"}
        self.assertTrue(_ledger_blocks_vote(True, ledger, POLICY_ONCE_PER_EVENT, "2026-07-11"))
        self.assertTrue(_ledger_blocks_vote(True, ledger, POLICY_ONCE_PER_DAY, "2026-07-11"))
        self.assertFalse(_ledger_blocks_vote(True, ledger, POLICY_ONCE_PER_DAY, "2026-07-12"))


class CandidateValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.raw_candidate_set = _raw_allstar_candidate_set()
        self.candidate_set = _public_candidate_set(
            self.raw_candidate_set,
            "allstar",
            "v1",
        )
        self.selections = _valid_selections(self.candidate_set)

    def test_valid_ballot_is_canonicalized(self) -> None:
        reversed_selections = dict(reversed(list(self.selections.items())))
        result = _validate_selections(reversed_selections, self.candidate_set["contests"])
        self.assertEqual(list(result), sorted(self.selections))
        self.assertEqual(result, self.selections)

    def test_missing_contest_is_rejected(self) -> None:
        selections = deepcopy(self.selections)
        selections.pop("TEAM_2:SS")
        with self.assertRaises(https_fn.HttpsError) as raised:
            _validate_selections(selections, self.candidate_set["contests"])
        self.assertEqual(raised.exception.details["reason"], "CONTEST_SET_MISMATCH")

    def test_duplicate_candidate_is_rejected(self) -> None:
        selections = deepcopy(self.selections)
        selections["TEAM_2:P"] = selections["TEAM_1:P"]
        with self.assertRaises(https_fn.HttpsError) as raised:
            _validate_selections(selections, self.candidate_set["contests"])
        self.assertEqual(raised.exception.details["reason"], "DUPLICATE_CANDIDATE")

    def test_candidate_outside_contest_is_rejected(self) -> None:
        selections = deepcopy(self.selections)
        selections["TEAM_1:P"] = ["not-in-contest"]
        with self.assertRaises(https_fn.HttpsError) as raised:
            _validate_selections(selections, self.candidate_set["contests"])
        self.assertEqual(raised.exception.details["reason"], "CANDIDATE_NOT_ALLOWED")

    def test_non_outfield_requires_exactly_one_selection(self) -> None:
        contest_id = "TEAM_1:P"
        contest = self.candidate_set["contests"][contest_id]
        contests = {contest_id: contest}

        with self.assertRaises(https_fn.HttpsError) as empty:
            _validate_selections({contest_id: []}, contests)
        self.assertEqual(empty.exception.details["reason"], "SELECTION_LIMIT")

        selected = contest["candidateIds"]
        self.assertEqual(
            _validate_selections({contest_id: selected[:1]}, contests),
            {contest_id: selected[:1]},
        )

        with self.assertRaises(https_fn.HttpsError) as two:
            _validate_selections({contest_id: selected[:2]}, contests)
        self.assertEqual(two.exception.details["reason"], "SELECTION_LIMIT")

    def test_outfield_requires_exactly_six_selections(self) -> None:
        contest_id = "TEAM_1:OF"
        contest = self.candidate_set["contests"][contest_id]
        contests = {contest_id: contest}
        candidate_ids = contest["candidateIds"]

        with self.assertRaises(https_fn.HttpsError) as five:
            _validate_selections({contest_id: candidate_ids[:5]}, contests)
        self.assertEqual(five.exception.details["reason"], "SELECTION_LIMIT")

        selected_six = candidate_ids[:6]
        self.assertEqual(
            _validate_selections({contest_id: selected_six}, contests),
            {contest_id: selected_six},
        )

        with self.assertRaises(https_fn.HttpsError) as seven:
            _validate_selections({contest_id: candidate_ids[:7]}, contests)
        self.assertEqual(seven.exception.details["reason"], "SELECTION_LIMIT")

    def test_outfield_rejects_duplicate_candidate(self) -> None:
        contest_id = "TEAM_1:OF"
        contest = self.candidate_set["contests"][contest_id]
        contests = {contest_id: contest}
        candidate_ids = contest["candidateIds"]
        with self.assertRaises(https_fn.HttpsError) as raised:
            _validate_selections(
                {contest_id: [*candidate_ids[:5], candidate_ids[4]]},
                contests,
            )
        self.assertEqual(raised.exception.details["reason"], "DUPLICATE_CANDIDATE")

    def test_outfield_rejects_unknown_candidate(self) -> None:
        contest_id = "TEAM_1:OF"
        contest = self.candidate_set["contests"][contest_id]
        contests = {contest_id: contest}
        with self.assertRaises(https_fn.HttpsError) as raised:
            _validate_selections(
                {contest_id: [*contest["candidateIds"][:5], "unknown"]},
                contests,
            )
        self.assertEqual(raised.exception.details["reason"], "CANDIDATE_NOT_ALLOWED")

    def test_allstar_contest_requires_exactly_one_selection(self) -> None:
        raw = deepcopy(self.raw_candidate_set)
        raw["contests"]["TEAM_1:P"]["maxSelections"] = 2
        with self.assertRaises(https_fn.HttpsError) as raised:
            _public_candidate_set(raw, "allstar", "v1")
        self.assertEqual(raised.exception.details["reason"], "CONFIG_INVALID")

    def test_allstar_candidate_set_has_required_structure(self) -> None:
        self.assertEqual(len(self.candidate_set["candidates"]), 90)
        self.assertEqual(len(self.candidate_set["contests"]), 14)
        for side in ALLSTAR_SIDES:
            for position in ALLSTAR_POSITIONS:
                with self.subTest(side=side, position=position):
                    contest = self.candidate_set["contests"][f"{side}:{position}"]
                    expected_candidates = 15 if position == "OF" else 5
                    expected_selections = 6 if position == "OF" else 1
                    self.assertEqual(len(contest["candidateIds"]), expected_candidates)
                    self.assertEqual(contest["minSelections"], expected_selections)
                    self.assertEqual(contest["maxSelections"], expected_selections)

    def test_allstar_outfield_contest_requires_exactly_six_selections(self) -> None:
        raw = deepcopy(self.raw_candidate_set)
        raw["contests"]["TEAM_1:OF"]["minSelections"] = 1
        with self.assertRaises(https_fn.HttpsError) as raised:
            _public_candidate_set(raw, "allstar", "v1")
        self.assertEqual(raised.exception.details["reason"], "CONFIG_INVALID")

    def test_allstar_rejects_legacy_outfield_position(self) -> None:
        raw = deepcopy(self.raw_candidate_set)
        raw["contests"]["TEAM_1:OF"]["position"] = "LF"
        with self.assertRaises(https_fn.HttpsError) as raised:
            _public_candidate_set(raw, "allstar", "v1")
        self.assertEqual(raised.exception.details["reason"], "CONFIG_INVALID")

    def test_allstar_requires_every_side_position_contest(self) -> None:
        raw = deepcopy(self.raw_candidate_set)
        raw["contests"].pop("TEAM_2:SS")
        with self.assertRaises(https_fn.HttpsError) as raised:
            _public_candidate_set(raw, "allstar", "v1")
        self.assertEqual(raised.exception.details["reason"], "CONFIG_INVALID")
        self.assertIn("TEAM_2:SS", raised.exception.details["missingContests"])

    def test_allstar_rejects_duplicate_side_position_contest(self) -> None:
        raw = deepcopy(self.raw_candidate_set)
        raw["contests"]["TEAM_2:P"]["side"] = "TEAM_1"
        with self.assertRaises(https_fn.HttpsError) as raised:
            _public_candidate_set(raw, "allstar", "v1")
        self.assertEqual(raised.exception.details["reason"], "CONFIG_INVALID")

    def test_allstar_rejects_unknown_side(self) -> None:
        raw = deepcopy(self.raw_candidate_set)
        raw["contests"]["TEAM_2:P"]["side"] = "TEAM_TWO"
        with self.assertRaises(https_fn.HttpsError) as raised:
            _public_candidate_set(raw, "allstar", "v1")
        self.assertEqual(raised.exception.details["reason"], "CONFIG_INVALID")

    def test_allstar_regular_contest_requires_exactly_five_candidates(self) -> None:
        raw = deepcopy(self.raw_candidate_set)
        raw["contests"]["TEAM_1:P"]["candidateIds"].pop()
        with self.assertRaises(https_fn.HttpsError) as raised:
            _public_candidate_set(raw, "allstar", "v1")
        self.assertEqual(raised.exception.details["reason"], "CONFIG_INVALID")

    def test_allstar_outfield_contest_requires_exactly_fifteen_candidates(self) -> None:
        raw = deepcopy(self.raw_candidate_set)
        raw["contests"]["TEAM_1:OF"]["candidateIds"].pop()
        with self.assertRaises(https_fn.HttpsError) as raised:
            _public_candidate_set(raw, "allstar", "v1")
        self.assertEqual(raised.exception.details["reason"], "CONFIG_INVALID")

    def test_allstar_candidate_set_requires_exactly_ninety_candidates(self) -> None:
        raw = deepcopy(self.raw_candidate_set)
        removed = raw["contests"]["TEAM_1:P"]["candidateIds"].pop()
        raw["candidates"].pop(removed)
        with self.assertRaises(https_fn.HttpsError) as raised:
            _public_candidate_set(raw, "allstar", "v1")
        self.assertEqual(raised.exception.details["reason"], "CONFIG_INVALID")

    def test_non_allstar_division_keeps_its_configured_selection_range(self) -> None:
        candidate_set = _public_candidate_set(
            {
                "published": True,
                "division": "rookie",
                "version": "v1",
                "candidates": {
                    "r1": {"name": "루키1"},
                    "r2": {"name": "루키2"},
                },
                "contests": {
                    "rookie-team1": {
                        "candidateIds": ["r1", "r2"],
                        "minSelections": 1,
                        "maxSelections": 2,
                    }
                },
            },
            "rookie",
            "v1",
        )
        self.assertEqual(
            candidate_set["contests"]["rookie-team1"]["maxSelections"],
            2,
        )

    def test_candidate_cannot_be_assigned_to_multiple_contests(self) -> None:
        raw = deepcopy(self.raw_candidate_set)
        duplicate_id = raw["contests"]["TEAM_1:P"]["candidateIds"][0]
        raw["contests"]["TEAM_2:P"]["candidateIds"][0] = duplicate_id
        with self.assertRaises(https_fn.HttpsError) as raised:
            _public_candidate_set(raw, "allstar", "v1")
        self.assertEqual(raised.exception.details["reason"], "CONFIG_INVALID")

    def test_public_ids_reject_email_shaped_values(self) -> None:
        contest_id = "TEAM_1:P"
        with self.assertRaises(https_fn.HttpsError):
            _validate_selections(
                {contest_id: ["person@example.com"]},
                {contest_id: self.candidate_set["contests"][contest_id]},
            )

    def test_candidate_hash_changes_with_published_content(self) -> None:
        original = self.candidate_set["contentHash"]
        raw = deepcopy(self.raw_candidate_set)
        candidate_id = raw["contests"]["TEAM_1:P"]["candidateIds"][0]
        raw["candidates"][candidate_id]["name"] = "변경된 선수"
        changed = _public_candidate_set(raw, "allstar", "v1")
        self.assertNotEqual(original, changed["contentHash"])

    def test_submission_candidate_version_mismatch_is_rejected(self) -> None:
        with self.assertRaises(https_fn.HttpsError) as raised:
            _require_candidate_version("v0", "v1")
        self.assertEqual(
            raised.exception.details["reason"],
            "CANDIDATE_VERSION_MISMATCH",
        )
        self.assertEqual(raised.exception.details["currentCandidateVersion"], "v1")

    def test_submission_candidate_version_match_is_accepted(self) -> None:
        _require_candidate_version("v1", "v1")

    def test_public_result_summary_is_version_and_hash_bound(self) -> None:
        total_ballots = 12
        counts = _valid_result_counts(self.candidate_set, total_ballots)
        pitcher_ids = self.candidate_set["contests"]["TEAM_1:P"]["candidateIds"]
        counts[pitcher_ids[0]] = 7
        counts[pitcher_ids[1]] = 5
        result = _public_result_summary(
            {
                "published": True,
                "candidateVersion": "v1",
                "candidateSetHash": self.candidate_set["contentHash"],
                "totalBallots": total_ballots,
                "counts": counts,
                "updatedAt": datetime(2026, 7, 11, 15, 0, tzinfo=timezone.utc),
            },
            self.candidate_set,
            "v1",
        )
        self.assertTrue(result["available"])
        self.assertEqual(result["totalBallots"], total_ballots)
        self.assertEqual(result["counts"], counts)

    def test_public_result_summary_rejects_unknown_candidate(self) -> None:
        counts = _valid_result_counts(self.candidate_set, 12)
        counts.pop(next(reversed(counts)))
        counts["unknown"] = 1
        with self.assertRaises(https_fn.HttpsError) as raised:
            _public_result_summary(
                {
                    "published": True,
                    "candidateVersion": "v1",
                    "candidateSetHash": self.candidate_set["contentHash"],
                    "totalBallots": 12,
                    "counts": counts,
                    "updatedAt": datetime(2026, 7, 11, 15, 0, tzinfo=timezone.utc),
                },
                self.candidate_set,
                "v1",
            )
        self.assertEqual(raised.exception.details["reason"], "CONFIG_INVALID")

    def test_public_result_summary_rejects_count_above_ballots(self) -> None:
        counts = _valid_result_counts(self.candidate_set, 2)
        candidate_id = self.candidate_set["contests"]["TEAM_1:P"]["candidateIds"][0]
        counts[candidate_id] = 3
        with self.assertRaises(https_fn.HttpsError) as raised:
            _public_result_summary(
                {
                    "published": True,
                    "candidateVersion": "v1",
                    "candidateSetHash": self.candidate_set["contentHash"],
                    "totalBallots": 2,
                    "counts": counts,
                    "updatedAt": datetime(2026, 7, 11, 15, 0, tzinfo=timezone.utc),
                },
                self.candidate_set,
                "v1",
            )
        self.assertEqual(raised.exception.details["reason"], "CONFIG_INVALID")

    def test_public_result_summary_rejects_regular_contest_total_mismatch(self) -> None:
        total_ballots = 12
        counts = _valid_result_counts(self.candidate_set, total_ballots)
        candidate_id = self.candidate_set["contests"]["TEAM_1:P"]["candidateIds"][0]
        counts[candidate_id] = total_ballots - 1
        with self.assertRaises(https_fn.HttpsError) as raised:
            _public_result_summary(
                {
                    "published": True,
                    "candidateVersion": "v1",
                    "candidateSetHash": self.candidate_set["contentHash"],
                    "totalBallots": total_ballots,
                    "counts": counts,
                    "updatedAt": datetime(2026, 7, 11, 15, 0, tzinfo=timezone.utc),
                },
                self.candidate_set,
                "v1",
            )
        self.assertEqual(raised.exception.details["reason"], "CONFIG_INVALID")

    def test_public_result_summary_rejects_outfield_total_mismatch(self) -> None:
        total_ballots = 12
        counts = _valid_result_counts(self.candidate_set, total_ballots)
        candidate_id = self.candidate_set["contests"]["TEAM_1:OF"]["candidateIds"][0]
        counts[candidate_id] = total_ballots - 1
        with self.assertRaises(https_fn.HttpsError) as raised:
            _public_result_summary(
                {
                    "published": True,
                    "candidateVersion": "v1",
                    "candidateSetHash": self.candidate_set["contentHash"],
                    "totalBallots": total_ballots,
                    "counts": counts,
                    "updatedAt": datetime(2026, 7, 11, 15, 0, tzinfo=timezone.utc),
                },
                self.candidate_set,
                "v1",
            )
        self.assertEqual(raised.exception.details["reason"], "CONFIG_INVALID")


class AuthProviderTests(unittest.TestCase):
    def test_google_linked_identity_is_accepted(self) -> None:
        provider = _validate_auth_provider(
            {
                "firebase": {
                    "sign_in_provider": "password",
                    "identities": {"google.com": ["google-subject"]},
                }
            },
            {},
            {},
        )
        self.assertEqual(provider, "google.com")

    def test_custom_token_requires_explicit_configuration(self) -> None:
        token = {"firebase": {"sign_in_provider": "custom", "identities": {}}}
        with self.assertRaises(https_fn.HttpsError) as raised:
            _validate_auth_provider(token, {}, {})
        self.assertEqual(raised.exception.details["reason"], "AUTH_PROVIDER_NOT_ALLOWED")

        provider = _validate_auth_provider(
            token,
            {"allowedAuthProviders": ["google.com", "custom"]},
            {},
        )
        self.assertEqual(provider, "custom")

        with self.assertRaises(https_fn.HttpsError) as raised_subject:
            _stable_voter_subject(token, provider)
        self.assertEqual(
            raised_subject.exception.details["reason"],
            "AUTH_PROVIDER_IDENTITY_UNAVAILABLE",
        )

    def test_direct_google_identity_is_preferred_over_custom_bridge(self) -> None:
        provider = _validate_auth_provider(
            {
                "firebase": {
                    "sign_in_provider": "custom",
                    "identities": {"google.com": ["google-subject"]},
                }
            },
            {"allowedAuthProviders": ["custom", "google.com"]},
            {},
        )
        self.assertEqual(provider, "google.com")

    def test_stable_google_subject_not_firebase_uid_drives_ballot_key(self) -> None:
        token = {
            "firebase": {
                "sign_in_provider": "google.com",
                "identities": {"google.com": ["same-google-subject"]},
            }
        }
        subject = _stable_voter_subject(token, "google.com")
        self.assertEqual(subject, "google.com:same-google-subject")
        # Firebase UID is deliberately absent from the key input, so account
        # deletion/recreation cannot create a new vote for the same Google subject.
        first = _derive_ballot_id(b"x" * 32, "event", "allstar", subject, "event")
        second = _derive_ballot_id(b"x" * 32, "event", "allstar", subject, "event")
        self.assertEqual(first, second)

    def test_custom_bridge_claim_preserves_google_subject(self) -> None:
        token = {
            "firebase": {"sign_in_provider": "custom", "identities": {}},
            "aublGoogleSubject": "same-google-subject",
        }
        self.assertEqual(
            _stable_voter_subject(token, "custom"),
            "google.com:same-google-subject",
        )

    def test_unstable_non_google_provider_cannot_be_configured(self) -> None:
        with self.assertRaises(https_fn.HttpsError) as raised:
            _validate_auth_provider(
                {"firebase": {"sign_in_provider": "password"}},
                {"allowedAuthProviders": ["password"]},
                {},
            )
        self.assertEqual(raised.exception.details["reason"], "CONFIG_INVALID")


if __name__ == "__main__":
    unittest.main()
