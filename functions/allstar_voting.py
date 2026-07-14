"""Secure Firestore-backed voting primitives for the AUBL All-Star event.

The browser never writes ballot documents directly.  All ballot validation and
the uniqueness check happen in an Admin SDK transaction invoked by a callable
Cloud Function.  Ballot documents intentionally contain no UID, email, display
name, IP address, or user-agent.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping, NoReturn
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from firebase_admin import firestore as admin_firestore
from firebase_functions import https_fn
from google.cloud import firestore as google_firestore


EVENTS_COLLECTION = "allstarVotingEvents"
BALLOTS_SUBCOLLECTION = "ballots"
CANDIDATE_SETS_SUBCOLLECTION = "candidateSets"
ELIGIBILITY_SUBCOLLECTION = "voterEligibility"
PUBLIC_RESULTS_SUBCOLLECTION = "publicResults"
CUSTOM_GOOGLE_SUBJECT_CLAIM = "aublGoogleSubject"

POLICY_ONCE_PER_EVENT = "ONCE_PER_EVENT"
POLICY_ONCE_PER_DAY = "ONCE_PER_DAY"
SUPPORTED_POLICIES = {POLICY_ONCE_PER_EVENT, POLICY_ONCE_PER_DAY}
SUPPORTED_AUTH_PROVIDERS = {"google.com", "custom"}
ALLSTAR_SIDES = ("TEAM_1", "TEAM_2")
ALLSTAR_SELECTION_LIMITS = {
    "P": 1,
    "C": 1,
    "1B": 1,
    "2B": 1,
    "3B": 1,
    "SS": 1,
    "OF": 6,
}
ALLSTAR_CANDIDATE_COUNTS = {
    position: 15 if position == "OF" else 5
    for position in ALLSTAR_SELECTION_LIMITS
}
ALLSTAR_EXPECTED_CONTESTS = frozenset(
    (side, position)
    for side in ALLSTAR_SIDES
    for position in ALLSTAR_SELECTION_LIMITS
)
ALLSTAR_TOTAL_CANDIDATES = sum(ALLSTAR_CANDIDATE_COUNTS.values()) * len(
    ALLSTAR_SIDES
)

_SLUG_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")
_PUBLIC_IDENTIFIER_PATTERN = re.compile(
    r"^(?=.{1,128}$)(?=.*[A-Za-z])[A-Za-z0-9][A-Za-z0-9._:-]*$"
)
_PUBLIC_CANDIDATE_STRING_FIELDS = (
    "name",
    "school",
    "position",
    "side",
    "group",
    "number",
)


def _error(
    code: https_fn.FunctionsErrorCode,
    message: str,
    reason: str,
    **details: object,
) -> NoReturn:
    raise https_fn.HttpsError(
        code=code,
        message=message,
        details={"reason": reason, **details},
    )


def _invalid(message: str, reason: str = "INVALID_REQUEST", **details: object) -> NoReturn:
    _error(https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message, reason, **details)


def _misconfigured(message: str, **details: object) -> NoReturn:
    _error(
        https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
        message,
        "CONFIG_INVALID",
        **details,
    )


def _require_mapping(value: object, field: str, *, config: bool = False) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        if config:
            _misconfigured(f"Voting configuration field '{field}' must be an object.")
        _invalid(f"'{field}' must be an object.")
    return value


def _require_slug(value: object, field: str, *, config: bool = False) -> str:
    if not isinstance(value, str) or _SLUG_PATTERN.fullmatch(value) is None:
        if config:
            _misconfigured(f"Voting configuration field '{field}' is invalid.")
        _invalid(f"'{field}' is invalid.")
    return value


def _require_value_key(value: object, field: str, *, config: bool = False) -> str:
    """Require an opaque public identifier, never an email/phone/raw UID field."""
    if not isinstance(value, str) or _PUBLIC_IDENTIFIER_PATTERN.fullmatch(value) is None:
        if config:
            _misconfigured(f"Voting configuration field '{field}' is invalid.")
        _invalid(f"'{field}' contains an invalid identifier.")
    return value


def _request_ids(data: object) -> tuple[str, str]:
    payload = _require_mapping(data, "data")
    return (
        _require_slug(payload.get("eventId"), "eventId"),
        _require_slug(payload.get("division"), "division"),
    )


def _event_division(event: Mapping[str, Any], division_id: str) -> Mapping[str, Any]:
    divisions = event.get("divisions")
    if not isinstance(divisions, Mapping):
        _misconfigured("Voting event has no valid divisions configuration.")
    division = divisions.get(division_id)
    if not isinstance(division, Mapping):
        _error(
            https_fn.FunctionsErrorCode.NOT_FOUND,
            "Voting division was not found.",
            "DIVISION_NOT_FOUND",
        )
    return division


def _candidate_set_identity(division: Mapping[str, Any]) -> tuple[str, str]:
    return (
        _require_slug(division.get("candidateSetId"), "candidateSetId", config=True),
        _require_slug(division.get("candidateVersion"), "candidateVersion", config=True),
    )


def _require_candidate_version(requested_version: str, current_version: str) -> None:
    if requested_version != current_version:
        _error(
            https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
            "Candidate list has changed. Refresh before voting.",
            "CANDIDATE_VERSION_MISMATCH",
            currentCandidateVersion=current_version,
        )


def _policy(event: Mapping[str, Any], division: Mapping[str, Any]) -> str:
    value = division.get("policy", event.get("policy", POLICY_ONCE_PER_EVENT))
    if value not in SUPPORTED_POLICIES:
        _misconfigured("Voting policy is invalid.", supportedPolicies=sorted(SUPPORTED_POLICIES))
    return value


def _timezone_name(event: Mapping[str, Any], division: Mapping[str, Any]) -> str:
    value = division.get("timezone", event.get("timezone", "Asia/Seoul"))
    if not isinstance(value, str) or not value or len(value) > 64:
        _misconfigured("Voting timezone is invalid.")
    try:
        ZoneInfo(value)
    except ZoneInfoNotFoundError:
        _misconfigured("Voting timezone is unknown.")
    return value


def _as_datetime(value: object, field: str) -> datetime | None:
    if value is None:
        return None
    if not isinstance(value, datetime):
        _misconfigured(f"Voting configuration field '{field}' must be a Firestore timestamp.")
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _effective_state(
    event: Mapping[str, Any],
    division: Mapping[str, Any],
    now: datetime,
) -> str:
    if event.get("enabled") is not True or division.get("enabled") is not True:
        return "DISABLED"

    event_status = str(event.get("status", "DRAFT")).upper()
    division_status = str(division.get("status", "DRAFT")).upper()
    if event_status != "OPEN":
        return event_status if event_status in {"DRAFT", "SCHEDULED", "CLOSED"} else "DISABLED"
    if division_status != "OPEN":
        return division_status if division_status in {"DRAFT", "SCHEDULED", "CLOSED"} else "DISABLED"

    opens_at = _as_datetime(division.get("opensAt", event.get("opensAt")), "opensAt")
    closes_at = _as_datetime(division.get("closesAt", event.get("closesAt")), "closesAt")
    if opens_at is not None and closes_at is not None and opens_at >= closes_at:
        _misconfigured("Voting opensAt must be earlier than closesAt.")
    if opens_at is not None and now < opens_at:
        return "SCHEDULED"
    if closes_at is not None and now >= closes_at:
        return "CLOSED"
    return "OPEN"


def _period_for(
    policy: str,
    timezone_name: str,
    now: datetime,
) -> tuple[str, str | None]:
    if policy == POLICY_ONCE_PER_EVENT:
        return "event", None
    if policy != POLICY_ONCE_PER_DAY:
        _misconfigured("Voting policy is invalid.")

    local_now = now.astimezone(ZoneInfo(timezone_name))
    next_local_midnight = datetime.combine(
        local_now.date() + timedelta(days=1),
        datetime.min.time(),
        tzinfo=local_now.tzinfo,
    )
    return (
        local_now.date().isoformat(),
        next_local_midnight.astimezone(timezone.utc).isoformat(),
    )


def _secret_bytes(secret: str) -> bytes:
    if not isinstance(secret, str) or len(secret.encode("utf-8")) < 32:
        _error(
            https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
            "Voting service is not ready.",
            "VOTER_KEY_SECRET_MISSING",
        )
    return secret.encode("utf-8")


def _derive_ballot_id(
    secret: bytes,
    event_id: str,
    division_id: str,
    voter_subject: str,
    period_key: str,
) -> str:
    scope = f"v2\nballot\n{event_id}\n{division_id}\n{period_key}\n{voter_subject}".encode("utf-8")
    return hmac.new(secret, scope, hashlib.sha256).hexdigest()


def _derive_eligibility_id(
    secret: bytes,
    event_id: str,
    division_id: str,
    voter_subject: str,
) -> str:
    scope = f"v2\neligibility\n{event_id}\n{division_id}\n{voter_subject}".encode("utf-8")
    return hmac.new(secret, scope, hashlib.sha256).hexdigest()


def _local_date(timezone_name: str, now: datetime) -> str:
    return now.astimezone(ZoneInfo(timezone_name)).date().isoformat()


def _ledger_blocks_vote(
    ledger_exists: bool,
    ledger: Mapping[str, Any],
    policy: str,
    local_date: str,
) -> bool:
    if not ledger_exists:
        return False
    if policy == POLICY_ONCE_PER_EVENT:
        return True
    return ledger.get("lastLocalDate") == local_date


def _auth_token(request: https_fn.CallableRequest[Any]) -> Mapping[str, Any]:
    if request.auth is None:
        _error(
            https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            "Sign in before voting.",
            "AUTH_REQUIRED",
        )
    if not isinstance(request.auth.uid, str) or not request.auth.uid:
        _error(
            https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            "The authenticated account is invalid.",
            "AUTH_INVALID",
        )
    token = request.auth.token
    return token if isinstance(token, Mapping) else {}


def google_subject_from_token(token: Mapping[str, Any]) -> str | None:
    """Extract one stable Google provider subject from a verified Firebase token."""
    firebase_claim = token.get("firebase")
    firebase_data = firebase_claim if isinstance(firebase_claim, Mapping) else {}
    identities = firebase_data.get("identities")
    identity_map = identities if isinstance(identities, Mapping) else {}
    google_identities = identity_map.get("google.com")
    if not isinstance(google_identities, list) or len(google_identities) != 1:
        return None
    subject = google_identities[0]
    if not isinstance(subject, str) or not subject or len(subject) > 512:
        return None
    return subject


def _allowed_auth_providers(event: Mapping[str, Any], division: Mapping[str, Any]) -> list[str]:
    raw = division.get("allowedAuthProviders", event.get("allowedAuthProviders", ["google.com"]))
    if not isinstance(raw, list) or not raw or len(raw) > 10:
        _misconfigured("allowedAuthProviders must be a non-empty list.")
    providers: list[str] = []
    for item in raw:
        if not isinstance(item, str) or item not in SUPPORTED_AUTH_PROVIDERS:
            _misconfigured("allowedAuthProviders contains an invalid provider.")
        providers.append(item)
    if len(set(providers)) != len(providers):
        _misconfigured("allowedAuthProviders contains duplicates.")
    return providers


def _validate_auth_provider(
    token: Mapping[str, Any],
    event: Mapping[str, Any],
    division: Mapping[str, Any],
) -> str:
    allowed = _allowed_auth_providers(event, division)
    firebase_claim = token.get("firebase")
    firebase_data = firebase_claim if isinstance(firebase_claim, Mapping) else {}
    sign_in_provider = firebase_data.get("sign_in_provider")
    identities = firebase_data.get("identities")
    linked_providers = set(identities.keys()) if isinstance(identities, Mapping) else set()
    observed = linked_providers.copy()
    if isinstance(sign_in_provider, str) and sign_in_provider:
        observed.add(sign_in_provider)

    # Prefer the direct Google identity even if a custom bridge provider is also
    # listed first in configuration. This avoids requiring a bridge claim when
    # Firebase already supplied the stable Google provider subject.
    matched = (
        "google.com"
        if "google.com" in allowed and "google.com" in observed
        else next((provider for provider in allowed if provider in observed), None)
    )
    if matched is None:
        _error(
            https_fn.FunctionsErrorCode.PERMISSION_DENIED,
            "This sign-in method is not eligible for voting.",
            "AUTH_PROVIDER_NOT_ALLOWED",
            allowedAuthProviders=allowed,
            signInProvider=sign_in_provider if isinstance(sign_in_provider, str) else None,
        )
    return matched


def _stable_voter_subject(token: Mapping[str, Any], matched_provider: str) -> str:
    """Return a stable provider subject without persisting it in Firestore."""
    if matched_provider == "custom":
        custom_google_subject = token.get(CUSTOM_GOOGLE_SUBJECT_CLAIM)
        if not isinstance(custom_google_subject, str) or not custom_google_subject or len(custom_google_subject) > 512:
            _error(
                https_fn.FunctionsErrorCode.PERMISSION_DENIED,
                "The custom sign-in session cannot prove its original Google account.",
                "AUTH_PROVIDER_IDENTITY_UNAVAILABLE",
            )
        return f"google.com:{custom_google_subject}"

    firebase_claim = token.get("firebase")
    firebase_data = firebase_claim if isinstance(firebase_claim, Mapping) else {}
    identities = firebase_data.get("identities")
    identity_map = identities if isinstance(identities, Mapping) else {}
    provider_identities = identity_map.get(matched_provider)
    if not isinstance(provider_identities, list) or len(provider_identities) != 1:
        _error(
            https_fn.FunctionsErrorCode.PERMISSION_DENIED,
            "The authenticated provider identity is unavailable or ambiguous.",
            "AUTH_PROVIDER_IDENTITY_UNAVAILABLE",
        )
    subject = provider_identities[0]
    if not isinstance(subject, str) or not subject or len(subject) > 512:
        _error(
            https_fn.FunctionsErrorCode.PERMISSION_DENIED,
            "The authenticated provider identity is invalid.",
            "AUTH_PROVIDER_IDENTITY_UNAVAILABLE",
        )
    return f"{matched_provider}:{subject}"


def _public_candidate_set(
    raw: Mapping[str, Any],
    division_id: str,
    expected_version: str,
) -> dict[str, Any]:
    if raw.get("published") is not True:
        _misconfigured("Candidate set is not published.")
    if raw.get("division") != division_id or raw.get("version") != expected_version:
        _misconfigured("Candidate set identity does not match the active division.")

    candidates_raw = _require_mapping(raw.get("candidates"), "candidates", config=True)
    contests_raw = _require_mapping(raw.get("contests"), "contests", config=True)
    if not candidates_raw or len(candidates_raw) > 500:
        _misconfigured("Candidate set must contain between 1 and 500 candidates.")
    if not contests_raw or len(contests_raw) > 100:
        _misconfigured("Candidate set must contain between 1 and 100 contests.")

    candidates: dict[str, dict[str, Any]] = {}
    for raw_id, raw_candidate in candidates_raw.items():
        candidate_id = _require_value_key(raw_id, "candidateId", config=True)
        candidate = _require_mapping(raw_candidate, f"candidates.{candidate_id}", config=True)
        public_candidate: dict[str, Any] = {"id": candidate_id}
        for field in _PUBLIC_CANDIDATE_STRING_FIELDS:
            value = candidate.get(field)
            if value is None:
                continue
            if isinstance(value, bool) or not isinstance(value, (str, int)) or len(str(value)) > 500:
                _misconfigured(f"Candidate field '{field}' is invalid.")
            public_candidate[field] = str(value)
        if not public_candidate.get("name"):
            _misconfigured("Every candidate must have a name.")
        candidates[candidate_id] = public_candidate

    if division_id == "allstar" and len(candidates) != ALLSTAR_TOTAL_CANDIDATES:
        _misconfigured(
            f"All-Star candidate set must contain exactly {ALLSTAR_TOTAL_CANDIDATES} candidates.",
            candidateCount=len(candidates),
        )

    contests: dict[str, dict[str, Any]] = {}
    assigned_candidates: dict[str, str] = {}
    allstar_contests: set[tuple[str, str]] = set()
    for raw_id, raw_contest in contests_raw.items():
        contest_id = _require_value_key(raw_id, "contestId", config=True)
        contest = _require_mapping(raw_contest, f"contests.{contest_id}", config=True)
        candidate_ids_raw = contest.get("candidateIds")
        if not isinstance(candidate_ids_raw, list) or not candidate_ids_raw or len(candidate_ids_raw) > 100:
            _misconfigured(f"Contest '{contest_id}' has an invalid candidateIds list.")
        candidate_ids = [
            _require_value_key(value, f"contests.{contest_id}.candidateIds", config=True)
            for value in candidate_ids_raw
        ]
        if len(candidate_ids) != len(set(candidate_ids)):
            _misconfigured(f"Contest '{contest_id}' contains duplicate candidate IDs.")
        if any(candidate_id not in candidates for candidate_id in candidate_ids):
            _misconfigured(f"Contest '{contest_id}' references an unknown candidate.")

        min_selections = contest.get("minSelections", 1)
        max_selections = contest.get("maxSelections", 1)
        if (
            isinstance(min_selections, bool)
            or not isinstance(min_selections, int)
            or isinstance(max_selections, bool)
            or not isinstance(max_selections, int)
            or min_selections < 0
            or max_selections < 1
            or min_selections > max_selections
            or max_selections > min(20, len(candidate_ids))
        ):
            _misconfigured(f"Contest '{contest_id}' has invalid selection limits.")
        if division_id == "allstar":
            side = contest.get("side")
            position = contest.get("position")
            if not isinstance(side, str) or side not in ALLSTAR_SIDES:
                _misconfigured(
                    f"All-Star contest '{contest_id}' has an invalid side.",
                    supportedSides=list(ALLSTAR_SIDES),
                )
            if not isinstance(position, str) or position not in ALLSTAR_SELECTION_LIMITS:
                _misconfigured(
                    f"All-Star contest '{contest_id}' has an invalid position.",
                    supportedPositions=list(ALLSTAR_SELECTION_LIMITS),
                )
            contest_key = (side, position)
            if contest_key in allstar_contests:
                _misconfigured(
                    "Every All-Star side and position may have only one contest.",
                    side=side,
                    position=position,
                )
            required_candidates = ALLSTAR_CANDIDATE_COUNTS[position]
            if len(candidate_ids) != required_candidates:
                _misconfigured(
                    f"All-Star contest '{contest_id}' must contain exactly "
                    f"{required_candidates} candidates.",
                    candidateCount=len(candidate_ids),
                )
            required_selections = ALLSTAR_SELECTION_LIMITS[position]
            if (
                min_selections != required_selections
                or max_selections != required_selections
            ):
                _misconfigured(
                    f"All-Star contest '{contest_id}' must require exactly "
                    f"{required_selections} selection(s)."
                )
            allstar_contests.add(contest_key)

        label = contest.get("label", contest_id)
        if not isinstance(label, str) or not label or len(label) > 120:
            _misconfigured(f"Contest '{contest_id}' has an invalid label.")
        public_contest: dict[str, Any] = {
            "id": contest_id,
            "label": label,
            "candidateIds": candidate_ids,
            "minSelections": min_selections,
            "maxSelections": max_selections,
        }
        for field in ("side", "position"):
            value = contest.get(field)
            if value is not None:
                if not isinstance(value, str) or len(value) > 80:
                    _misconfigured(f"Contest '{contest_id}' field '{field}' is invalid.")
                public_contest[field] = value
        for candidate_id in candidate_ids:
            previous_contest = assigned_candidates.get(candidate_id)
            if previous_contest is not None:
                _misconfigured(
                    f"Candidate '{candidate_id}' is assigned to both '{previous_contest}' and '{contest_id}'."
                )
            candidate = candidates[candidate_id]
            for field in ("side", "position"):
                expected = public_contest.get(field)
                actual = candidate.get(field)
                if expected is not None and actual is not None and expected != actual:
                    _misconfigured(
                        f"Candidate '{candidate_id}' field '{field}' does not match contest '{contest_id}'."
                    )
            assigned_candidates[candidate_id] = contest_id
        contests[contest_id] = public_contest

    if division_id == "allstar" and allstar_contests != ALLSTAR_EXPECTED_CONTESTS:
        missing_contests = sorted(ALLSTAR_EXPECTED_CONTESTS - allstar_contests)
        _misconfigured(
            "All-Star candidate set must contain exactly one contest for every side and position.",
            missingContests=[f"{side}:{position}" for side, position in missing_contests],
        )

    unassigned_candidates = sorted(set(candidates) - set(assigned_candidates))
    if unassigned_candidates:
        _misconfigured(
            "Every published candidate must belong to exactly one contest.",
            candidateIds=unassigned_candidates,
        )

    public_set = {
        "version": expected_version,
        "candidates": candidates,
        "contests": contests,
    }
    serialized = json.dumps(
        {"division": division_id, **public_set},
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    public_set["contentHash"] = hashlib.sha256(serialized).hexdigest()
    return public_set


def _validate_selections(
    raw: object,
    contests: Mapping[str, Mapping[str, Any]],
) -> dict[str, list[str]]:
    selections = _require_mapping(raw, "selections")
    if len(selections) > 100:
        _invalid("Selections contain too many contests.", "CONTEST_SET_MISMATCH")
    provided_ids = set(selections.keys())
    expected_ids = set(contests.keys())
    if provided_ids != expected_ids:
        _invalid(
            "Selections must include every configured contest and no others.",
            "CONTEST_SET_MISMATCH",
            missingContests=sorted(expected_ids - provided_ids),
            unknownContests=sorted(str(item) for item in provided_ids - expected_ids),
        )

    canonical: dict[str, list[str]] = {}
    selected_globally: set[str] = set()
    for contest_id in sorted(expected_ids):
        contest = contests[contest_id]
        values = selections.get(contest_id)
        if not isinstance(values, list):
            _invalid(
                f"Selections for contest '{contest_id}' must be a list.",
                "SELECTIONS_NOT_LIST",
                contestId=contest_id,
            )
        if len(values) > 20:
            _invalid(
                f"Contest '{contest_id}' contains too many selections.",
                "SELECTION_LIMIT",
                contestId=contest_id,
                minSelections=int(contest["minSelections"]),
                maxSelections=int(contest["maxSelections"]),
            )
        selected = [
            _require_value_key(value, f"selections.{contest_id}")
            for value in values
        ]
        if len(selected) != len(set(selected)):
            _invalid(
                f"Contest '{contest_id}' contains duplicate candidate IDs.",
                "DUPLICATE_CANDIDATE",
                contestId=contest_id,
            )
        cross_contest_duplicate = selected_globally.intersection(selected)
        if cross_contest_duplicate:
            _invalid(
                "A candidate cannot be selected in more than one contest.",
                "DUPLICATE_CANDIDATE",
                candidateIds=sorted(cross_contest_duplicate),
            )

        min_selections = int(contest["minSelections"])
        max_selections = int(contest["maxSelections"])
        if not min_selections <= len(selected) <= max_selections:
            _invalid(
                f"Contest '{contest_id}' selection count is invalid.",
                "SELECTION_LIMIT",
                contestId=contest_id,
                minSelections=min_selections,
                maxSelections=max_selections,
            )
        allowed_ids = set(contest["candidateIds"])
        unknown = set(selected) - allowed_ids
        if unknown:
            _invalid(
                f"Contest '{contest_id}' contains an ineligible candidate.",
                "CANDIDATE_NOT_ALLOWED",
                contestId=contest_id,
                candidateIds=sorted(unknown),
            )
        canonical[contest_id] = selected
        selected_globally.update(selected)
    return canonical


def _iso(value: object) -> str | None:
    return value.isoformat() if isinstance(value, datetime) else None


def _public_result_summary(
    raw: Mapping[str, Any],
    public_set: Mapping[str, Any],
    expected_version: str,
) -> dict[str, Any]:
    if raw.get("published") is not True:
        _misconfigured("Vote result summary is not published.")
    if raw.get("candidateVersion") != expected_version:
        _misconfigured("Vote result candidate version does not match the active division.")
    if raw.get("candidateSetHash") != public_set.get("contentHash"):
        _misconfigured("Vote result candidate hash does not match the active candidate set.")

    total_ballots = raw.get("totalBallots")
    if (
        isinstance(total_ballots, bool)
        or not isinstance(total_ballots, int)
        or total_ballots < 0
        or total_ballots > 10_000_000
    ):
        _misconfigured("Vote result totalBallots is invalid.")

    candidates = _require_mapping(public_set.get("candidates"), "candidates", config=True)
    raw_counts = _require_mapping(raw.get("counts"), "counts", config=True)
    if len(raw_counts) > len(candidates):
        _misconfigured("Vote result contains too many candidate counts.")

    counts = {candidate_id: 0 for candidate_id in candidates}
    for raw_candidate_id, raw_count in raw_counts.items():
        candidate_id = _require_value_key(raw_candidate_id, "resultCandidateId", config=True)
        if candidate_id not in candidates:
            _misconfigured("Vote result references an unknown candidate.", candidateId=candidate_id)
        if (
            isinstance(raw_count, bool)
            or not isinstance(raw_count, int)
            or raw_count < 0
            or raw_count > total_ballots
        ):
            _misconfigured("Vote result count is invalid.", candidateId=candidate_id)
        counts[candidate_id] = raw_count

    contests = _require_mapping(public_set.get("contests"), "contests", config=True)
    for raw_contest_id, raw_contest in contests.items():
        contest_id = _require_value_key(raw_contest_id, "resultContestId", config=True)
        contest = _require_mapping(raw_contest, f"contests.{contest_id}", config=True)
        candidate_ids = contest.get("candidateIds")
        if not isinstance(candidate_ids, list):
            _misconfigured("Vote result contest candidate list is invalid.")
        min_selections = contest.get("minSelections")
        max_selections = contest.get("maxSelections")
        if not isinstance(min_selections, int) or not isinstance(max_selections, int):
            _misconfigured("Vote result contest selection limits are invalid.")
        contest_total = sum(counts.get(str(candidate_id), 0) for candidate_id in candidate_ids)
        minimum_total = total_ballots * min_selections
        maximum_total = total_ballots * max_selections
        if not minimum_total <= contest_total <= maximum_total:
            _misconfigured(
                "Vote result contest total is inconsistent with the ballot count.",
                contestId=contest_id,
                contestTotal=contest_total,
                minimumTotal=minimum_total,
                maximumTotal=maximum_total,
            )

    updated_at = _as_datetime(raw.get("updatedAt"), "results.updatedAt")
    if updated_at is None:
        _misconfigured("Vote result updatedAt is required.")

    return {
        "available": True,
        "candidateVersion": expected_version,
        "candidateSetHash": public_set["contentHash"],
        "totalBallots": total_ballots,
        "counts": counts,
        "updatedAt": updated_at.isoformat(),
    }


def get_event_config(data: object) -> dict[str, Any]:
    event_id, division_id = _request_ids(data)
    db = admin_firestore.client()
    event_ref = db.collection(EVENTS_COLLECTION).document(event_id)
    event_snapshot = event_ref.get()
    if not event_snapshot.exists:
        _error(
            https_fn.FunctionsErrorCode.NOT_FOUND,
            "Voting event was not found.",
            "EVENT_NOT_FOUND",
        )
    event = event_snapshot.to_dict() or {}
    division = _event_division(event, division_id)
    candidate_set_id, candidate_version = _candidate_set_identity(division)
    policy = _policy(event, division)
    timezone_name = _timezone_name(event, division)
    now = datetime.now(timezone.utc)
    state = _effective_state(event, division, now)
    published = division.get("published") is True
    game_starts_at = _as_datetime(
        division.get("gameStartsAt", event.get("gameStartsAt")),
        "gameStartsAt",
    )
    venue = division.get("venue", event.get("venue"))
    if venue is not None and (
        not isinstance(venue, str)
        or not venue.strip()
        or len(venue.strip()) > 160
    ):
        _misconfigured("Voting event venue is invalid.")

    public_set: dict[str, Any] | None = None
    if published:
        set_snapshot = event_ref.collection(CANDIDATE_SETS_SUBCOLLECTION).document(candidate_set_id).get()
        if not set_snapshot.exists:
            _misconfigured("Published candidate set was not found.")
        public_set = _public_candidate_set(set_snapshot.to_dict() or {}, division_id, candidate_version)

    return {
        "eventId": event_id,
        "division": division_id,
        "title": str(event.get("title", "AUBL ALL-STAR"))[:160],
        "divisionLabel": str(division.get("label", division_id))[:120],
        "state": state,
        "enabled": event.get("enabled") is True and division.get("enabled") is True,
        "published": published,
        "candidateSetId": candidate_set_id,
        "candidateVersion": candidate_version,
        "policy": policy,
        "timezone": timezone_name,
        "allowedAuthProviders": _allowed_auth_providers(event, division),
        "opensAt": _iso(division.get("opensAt", event.get("opensAt"))),
        "closesAt": _iso(division.get("closesAt", event.get("closesAt"))),
        "gameStartsAt": _iso(game_starts_at),
        "venue": venue.strip() if isinstance(venue, str) else None,
        "candidateSet": public_set,
    }


def get_vote_results(data: object) -> dict[str, Any]:
    event_id, division_id = _request_ids(data)
    db = admin_firestore.client()
    event_ref = db.collection(EVENTS_COLLECTION).document(event_id)
    event_snapshot = event_ref.get()
    if not event_snapshot.exists:
        _error(
            https_fn.FunctionsErrorCode.NOT_FOUND,
            "Voting event was not found.",
            "EVENT_NOT_FOUND",
        )
    event = event_snapshot.to_dict() or {}
    division = _event_division(event, division_id)
    candidate_set_id, candidate_version = _candidate_set_identity(division)
    unavailable = {
        "eventId": event_id,
        "division": division_id,
        "available": False,
        "candidateVersion": candidate_version,
        "candidateSetHash": None,
        "totalBallots": 0,
        "counts": {},
        "updatedAt": None,
    }

    if division.get("published") is not True or division.get("resultsPublished") is not True:
        return unavailable

    candidate_snapshot = (
        event_ref.collection(CANDIDATE_SETS_SUBCOLLECTION).document(candidate_set_id).get()
    )
    if not candidate_snapshot.exists:
        _misconfigured("Published candidate set was not found.")
    public_set = _public_candidate_set(
        candidate_snapshot.to_dict() or {},
        division_id,
        candidate_version,
    )

    result_snapshot = (
        event_ref.collection(PUBLIC_RESULTS_SUBCOLLECTION).document(division_id).get()
    )
    if not result_snapshot.exists:
        return unavailable
    raw_result = result_snapshot.to_dict() or {}
    if raw_result.get("published") is not True:
        return unavailable

    return {
        "eventId": event_id,
        "division": division_id,
        **_public_result_summary(raw_result, public_set, candidate_version),
    }


def get_ballot_status(
    request: https_fn.CallableRequest[Any],
    voter_key_secret: str,
) -> dict[str, Any]:
    event_id, division_id = _request_ids(request.data)
    token = _auth_token(request)
    secret = _secret_bytes(voter_key_secret)
    db = admin_firestore.client()
    event_ref = db.collection(EVENTS_COLLECTION).document(event_id)
    event_snapshot = event_ref.get()
    if not event_snapshot.exists:
        _error(
            https_fn.FunctionsErrorCode.NOT_FOUND,
            "Voting event was not found.",
            "EVENT_NOT_FOUND",
        )
    event = event_snapshot.to_dict() or {}
    division = _event_division(event, division_id)
    matched_provider = _validate_auth_provider(token, event, division)
    voter_subject = _stable_voter_subject(token, matched_provider)
    candidate_set_id, candidate_version = _candidate_set_identity(division)
    policy = _policy(event, division)
    timezone_name = _timezone_name(event, division)
    now = datetime.now(timezone.utc)
    period_key, next_eligible_at = _period_for(policy, timezone_name, now)
    local_date = _local_date(timezone_name, now)
    published = division.get("published") is True
    candidate_ready = False
    candidate_set_hash: str | None = None
    if published:
        candidate_snapshot = (
            event_ref.collection(CANDIDATE_SETS_SUBCOLLECTION).document(candidate_set_id).get()
        )
        if not candidate_snapshot.exists:
            _misconfigured("Published candidate set was not found.")
        public_set = _public_candidate_set(
            candidate_snapshot.to_dict() or {},
            division_id,
            candidate_version,
        )
        candidate_set_hash = str(public_set["contentHash"])
        candidate_ready = True

    eligibility_id = _derive_eligibility_id(secret, event_id, division_id, voter_subject)
    eligibility_snapshot = (
        event_ref.collection(ELIGIBILITY_SUBCOLLECTION).document(eligibility_id).get()
    )
    ledger = eligibility_snapshot.to_dict() or {}
    ledger_blocks = _ledger_blocks_vote(
        eligibility_snapshot.exists,
        ledger,
        policy,
        local_date,
    )
    ballot_id = _derive_ballot_id(secret, event_id, division_id, voter_subject, period_key)
    ballot_snapshot = event_ref.collection(BALLOTS_SUBCOLLECTION).document(ballot_id).get()
    state = _effective_state(event, division, now)
    ballot = ballot_snapshot.to_dict() or {}
    submitted = ledger_blocks or ballot_snapshot.exists
    submitted_at = ledger.get("lastSubmittedAt") if ledger_blocks else ballot.get("submittedAt")
    if submitted_at is None and ballot_snapshot.exists:
        submitted_at = ballot.get("submittedAt")

    return {
        "eventId": event_id,
        "division": division_id,
        "state": state,
        "candidateSetId": candidate_set_id,
        "candidateVersion": candidate_version,
        "candidateSetHash": candidate_set_hash,
        "policy": policy,
        "periodKey": period_key,
        "published": published,
        "candidateReady": candidate_ready,
        "submitted": submitted,
        "canVote": state == "OPEN" and candidate_ready and not submitted,
        "submittedAt": _iso(submitted_at) if submitted else None,
        "nextEligibleAt": next_eligible_at if submitted and policy == POLICY_ONCE_PER_DAY else None,
    }


def submit_ballot(
    request: https_fn.CallableRequest[Any],
    voter_key_secret: str,
) -> dict[str, Any]:
    payload = _require_mapping(request.data, "data")
    event_id, division_id = _request_ids(payload)
    requested_version = _require_slug(payload.get("candidateVersion"), "candidateVersion")
    token = _auth_token(request)
    secret = _secret_bytes(voter_key_secret)
    db = admin_firestore.client()
    event_ref = db.collection(EVENTS_COLLECTION).document(event_id)
    transaction = db.transaction()
    # Keep policy-period and open/close decisions stable across transaction retries.
    request_now = datetime.now(timezone.utc)

    @google_firestore.transactional
    def write_ballot(txn: google_firestore.Transaction) -> dict[str, Any]:
        event_snapshot = event_ref.get(transaction=txn)
        if not event_snapshot.exists:
            _error(
                https_fn.FunctionsErrorCode.NOT_FOUND,
                "Voting event was not found.",
                "EVENT_NOT_FOUND",
            )
        event = event_snapshot.to_dict() or {}
        division = _event_division(event, division_id)
        matched_provider = _validate_auth_provider(token, event, division)
        voter_subject = _stable_voter_subject(token, matched_provider)
        state = _effective_state(event, division, request_now)
        if state != "OPEN":
            _error(
                https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                "Voting is not open.",
                "VOTING_NOT_OPEN",
                state=state,
            )
        if division.get("published") is not True:
            _error(
                https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                "Voting candidates are not published.",
                "CANDIDATES_NOT_PUBLISHED",
            )

        candidate_set_id, candidate_version = _candidate_set_identity(division)
        _require_candidate_version(requested_version, candidate_version)

        candidate_ref = event_ref.collection(CANDIDATE_SETS_SUBCOLLECTION).document(candidate_set_id)
        candidate_snapshot = candidate_ref.get(transaction=txn)
        if not candidate_snapshot.exists:
            _misconfigured("Active candidate set was not found.")
        public_set = _public_candidate_set(
            candidate_snapshot.to_dict() or {},
            division_id,
            candidate_version,
        )
        selections = _validate_selections(payload.get("selections"), public_set["contests"])

        policy = _policy(event, division)
        timezone_name = _timezone_name(event, division)
        period_key, next_eligible_at = _period_for(policy, timezone_name, request_now)
        local_date = _local_date(timezone_name, request_now)
        eligibility_id = _derive_eligibility_id(secret, event_id, division_id, voter_subject)
        eligibility_ref = event_ref.collection(ELIGIBILITY_SUBCOLLECTION).document(eligibility_id)
        eligibility_snapshot = eligibility_ref.get(transaction=txn)
        eligibility = eligibility_snapshot.to_dict() or {}
        ballot_id = _derive_ballot_id(secret, event_id, division_id, voter_subject, period_key)
        ballot_ref = event_ref.collection(BALLOTS_SUBCOLLECTION).document(ballot_id)
        existing = ballot_ref.get(transaction=txn)
        if existing.exists or _ledger_blocks_vote(
            eligibility_snapshot.exists,
            eligibility,
            policy,
            local_date,
        ):
            _error(
                https_fn.FunctionsErrorCode.ALREADY_EXISTS,
                "This account has already voted for this period.",
                "ALREADY_VOTED",
                policy=policy,
                nextEligibleAt=next_eligible_at,
            )

        txn.create(
            ballot_ref,
            {
                "schemaVersion": 2,
                "eventId": event_id,
                "division": division_id,
                "candidateSetId": candidate_set_id,
                "candidateVersion": candidate_version,
                "candidateSetHash": public_set["contentHash"],
                "policy": policy,
                "periodKey": period_key,
                "localDate": local_date,
                "selections": selections,
                "voterKeyVersion": "provider-subject-hmac-sha256-v2",
                "submittedAt": admin_firestore.SERVER_TIMESTAMP,
            },
        )
        eligibility_data: dict[str, Any] = {
            "schemaVersion": 1,
            "eventId": event_id,
            "division": division_id,
            "lastPolicy": policy,
            "lastPeriodKey": period_key,
            "lastLocalDate": local_date,
            "lastCandidateVersion": candidate_version,
            "voterKeyVersion": "provider-subject-hmac-sha256-v2",
            "lastSubmittedAt": admin_firestore.SERVER_TIMESTAMP,
        }
        if not eligibility_snapshot.exists:
            eligibility_data["createdAt"] = admin_firestore.SERVER_TIMESTAMP
        txn.set(eligibility_ref, eligibility_data, merge=True)
        return {
            "eventId": event_id,
            "division": division_id,
            "candidateVersion": candidate_version,
            "policy": policy,
            "periodKey": period_key,
            "submitted": True,
            "submittedAt": request_now.isoformat(),
            "nextEligibleAt": next_eligible_at if policy == POLICY_ONCE_PER_DAY else None,
        }

    return write_ballot(transaction)
