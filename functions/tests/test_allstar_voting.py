from __future__ import annotations

import unittest
from datetime import datetime, timezone

from firebase_functions import https_fn

from allstar_voting import POLICY_ONCE_PER_DAY
from allstar_voting import POLICY_ONCE_PER_EVENT
from allstar_voting import _derive_ballot_id
from allstar_voting import _ledger_blocks_vote
from allstar_voting import _period_for
from allstar_voting import _public_candidate_set
from allstar_voting import _stable_voter_subject
from allstar_voting import _validate_auth_provider
from allstar_voting import _validate_selections


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
        self.candidate_set = _public_candidate_set(
            {
                "published": True,
                "division": "allstar",
                "version": "v1",
                "candidates": {
                    "p1": {"name": "선수1", "school": "학교A", "position": "P"},
                    "p2": {"name": "선수2", "school": "학교B", "position": "P"},
                    "c1": {"name": "선수3", "school": "학교C", "position": "C"},
                },
                "contests": {
                    "team1-P": {
                        "label": "1팀 투수",
                        "candidateIds": ["p1", "p2"],
                        "minSelections": 1,
                        "maxSelections": 1,
                    },
                    "team1-C": {
                        "label": "1팀 포수",
                        "candidateIds": ["c1"],
                        "minSelections": 1,
                        "maxSelections": 1,
                    },
                },
            },
            "allstar",
            "v1",
        )

    def test_valid_ballot_is_canonicalized(self) -> None:
        result = _validate_selections(
            {"team1-P": ["p2"], "team1-C": ["c1"]},
            self.candidate_set["contests"],
        )
        self.assertEqual(result, {"team1-C": ["c1"], "team1-P": ["p2"]})

    def test_missing_contest_is_rejected(self) -> None:
        with self.assertRaises(https_fn.HttpsError) as raised:
            _validate_selections(
                {"team1-P": ["p1"]},
                self.candidate_set["contests"],
            )
        self.assertEqual(raised.exception.details["reason"], "CONTEST_SET_MISMATCH")

    def test_duplicate_candidate_is_rejected(self) -> None:
        contests = {
            **self.candidate_set["contests"],
            "team2-P": {
                "candidateIds": ["p1"],
                "minSelections": 1,
                "maxSelections": 1,
            },
        }
        with self.assertRaises(https_fn.HttpsError) as raised:
            _validate_selections(
                {"team1-P": ["p1"], "team1-C": ["c1"], "team2-P": ["p1"]},
                contests,
            )
        self.assertEqual(raised.exception.details["reason"], "DUPLICATE_CANDIDATE")

    def test_candidate_outside_contest_is_rejected(self) -> None:
        with self.assertRaises(https_fn.HttpsError) as raised:
            _validate_selections(
                {"team1-P": ["not-in-contest"], "team1-C": ["c1"]},
                self.candidate_set["contests"],
            )
        self.assertEqual(raised.exception.details["reason"], "CANDIDATE_NOT_ALLOWED")

    def test_selection_limit_is_enforced(self) -> None:
        with self.assertRaises(https_fn.HttpsError) as raised:
            _validate_selections(
                {"team1-P": [], "team1-C": ["c1"]},
                self.candidate_set["contests"],
            )
        self.assertEqual(raised.exception.details["reason"], "SELECTION_LIMIT")

    def test_allstar_contest_requires_exactly_one_selection(self) -> None:
        raw = {
            "published": True,
            "division": "allstar",
            "version": "v1",
            "candidates": {
                "p1": {"name": "선수1"},
                "p2": {"name": "선수2"},
            },
            "contests": {
                "team1-P": {
                    "candidateIds": ["p1", "p2"],
                    "minSelections": 1,
                    "maxSelections": 2,
                }
            },
        }
        with self.assertRaises(https_fn.HttpsError) as raised:
            _public_candidate_set(raw, "allstar", "v1")
        self.assertEqual(raised.exception.details["reason"], "CONFIG_INVALID")

    def test_candidate_cannot_be_assigned_to_multiple_contests(self) -> None:
        raw = {
            "published": True,
            "division": "allstar",
            "version": "v1",
            "candidates": {"p1": {"name": "선수1"}},
            "contests": {
                "team1-P": {"candidateIds": ["p1"]},
                "team2-P": {"candidateIds": ["p1"]},
            },
        }
        with self.assertRaises(https_fn.HttpsError) as raised:
            _public_candidate_set(raw, "allstar", "v1")
        self.assertEqual(raised.exception.details["reason"], "CONFIG_INVALID")

    def test_candidate_must_be_assigned_to_a_contest(self) -> None:
        raw = {
            "published": True,
            "division": "allstar",
            "version": "v1",
            "candidates": {
                "p1": {"name": "선수1"},
                "orphan1": {"name": "미배정 선수"},
            },
            "contests": {"team1-P": {"candidateIds": ["p1"]}},
        }
        with self.assertRaises(https_fn.HttpsError) as raised:
            _public_candidate_set(raw, "allstar", "v1")
        self.assertEqual(raised.exception.details["reason"], "CONFIG_INVALID")

    def test_public_ids_reject_email_shaped_values(self) -> None:
        with self.assertRaises(https_fn.HttpsError):
            _validate_selections(
                {"team1-P": ["person@example.com"], "team1-C": ["c1"]},
                self.candidate_set["contests"],
            )

    def test_candidate_hash_changes_with_published_content(self) -> None:
        original = self.candidate_set["contentHash"]
        raw = {
            "published": True,
            "division": "allstar",
            "version": "v1",
            "candidates": {"p1": {"name": "변경된 선수"}},
            "contests": {"team1-P": {"candidateIds": ["p1"]}},
        }
        changed = _public_candidate_set(raw, "allstar", "v1")
        self.assertNotEqual(original, changed["contentHash"])


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
