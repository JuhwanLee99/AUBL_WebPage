"""Closed-event result generation and publication for AUBL All-Star voting.

Public result documents are derived data.  This module rebuilds them only from
the immutable ballot ledger after voting is closed, validates every ballot,
and stores a source digest so an operator can prove which ledger snapshot was
used.  No voter identifier or individual selection is returned to the admin
browser.
"""

from __future__ import annotations

import hashlib
import json
import re
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Mapping

from firebase_admin import firestore as admin_firestore
from firebase_functions import https_fn
from google.cloud import firestore as google_firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from allstar_admin import _aggregation_count
from allstar_admin import _ledger_link_issues
from allstar_admin import _require_admin
from allstar_voting import BALLOTS_SUBCOLLECTION
from allstar_voting import CANDIDATE_SETS_SUBCOLLECTION
from allstar_voting import ELIGIBILITY_SUBCOLLECTION
from allstar_voting import EVENTS_COLLECTION
from allstar_voting import POLICY_ONCE_PER_DAY
from allstar_voting import POLICY_ONCE_PER_EVENT
from allstar_voting import PUBLIC_RESULTS_SUBCOLLECTION
from allstar_voting import RESULT_DRAFTS_SUBCOLLECTION
from allstar_voting import SUPPORTED_POLICIES
from allstar_voting import _candidate_set_identity
from allstar_voting import _effective_state
from allstar_voting import _error
from allstar_voting import _event_division
from allstar_voting import _policy
from allstar_voting import _public_candidate_set
from allstar_voting import _public_result_summary
from allstar_voting import _request_ids
from allstar_voting import _require_mapping
from allstar_voting import _require_slug
from allstar_voting import _submission_fingerprint
from allstar_voting import _validate_selections


MAX_RESULT_BALLOTS = 20_000
RESULT_SCHEMA_VERSION = 2
RESULT_WRITER_VERSION = "allstar-results-v1"
_SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
_SUBMISSION_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")


def _require_boolean(payload: Mapping[str, Any], field: str) -> bool:
    value = payload.get(field)
    if not isinstance(value, bool):
        _error(
            https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            f"'{field}' must be a boolean.",
            "INVALID_REQUEST",
        )
    return value


def _require_closed(
    event: Mapping[str, Any],
    division: Mapping[str, Any],
    now: datetime,
) -> None:
    state = _effective_state(event, division, now)
    if state != "CLOSED":
        _error(
            https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
            "Voting results can be generated or published only after voting is closed.",
            "VOTING_MUST_BE_CLOSED",
            state=state,
        )
    event_status = str(event.get("status", "DRAFT")).upper()
    division_status = str(division.get("status", "DRAFT")).upper()
    if event_status != "CLOSED" and division_status != "CLOSED":
        _error(
            https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
            "Store an explicit CLOSED status before generating results.",
            "VOTING_CLOSE_BARRIER_REQUIRED",
        )


def _source_digest_entry(
    document_id: str,
    ballot: Mapping[str, Any],
    selections: Mapping[str, list[str]],
) -> str:
    submitted_at = ballot.get("submittedAt")
    normalized = {
        "documentId": document_id,
        "periodKey": ballot.get("periodKey"),
        "localDate": ballot.get("localDate"),
        "submissionId": ballot.get("submissionId"),
        "submittedAt": (
            submitted_at.isoformat() if isinstance(submitted_at, datetime) else None
        ),
        "selections": {
            contest_id: sorted(candidate_ids)
            for contest_id, candidate_ids in sorted(selections.items())
        },
    }
    serialized = json.dumps(
        normalized,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(serialized).hexdigest()


def build_result_snapshot(
    *,
    event_id: str,
    division_id: str,
    candidate_set_id: str,
    candidate_version: str,
    public_candidate_set: Mapping[str, Any],
    ballots: list[tuple[str, Mapping[str, Any]]],
    generated_at: datetime,
) -> dict[str, Any]:
    """Strictly validate a closed ledger and derive candidate counts.

    Unlike the dashboard audit, this function never skips an invalid or stale
    ballot.  A single mismatch aborts generation so an operator must resolve it
    instead of silently publishing a partial total.
    """

    candidates = _require_mapping(
        public_candidate_set.get("candidates"),
        "candidates",
        config=True,
    )
    contests = _require_mapping(
        public_candidate_set.get("contests"),
        "contests",
        config=True,
    )
    candidate_hash = public_candidate_set.get("contentHash")
    if not isinstance(candidate_hash, str):
        _error(
            https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
            "Candidate set hash is missing.",
            "CONFIG_INVALID",
        )

    counts = {str(candidate_id): 0 for candidate_id in candidates}
    ballot_digests: list[str] = []
    policy_counts: dict[str, int] = {}
    for index, (document_id, ballot) in enumerate(ballots, start=1):
        policy = ballot.get("policy")
        period_key = ballot.get("periodKey")
        local_date = ballot.get("localDate")
        identity_valid = (
            _SHA256_PATTERN.fullmatch(document_id) is not None
            and ballot.get("schemaVersion") == 2
            and ballot.get("eventId") == event_id
            and ballot.get("division") == division_id
            and ballot.get("candidateSetId") == candidate_set_id
            and ballot.get("candidateVersion") == candidate_version
            and ballot.get("candidateSetHash") == candidate_hash
            and policy in SUPPORTED_POLICIES
            and (
                (policy == POLICY_ONCE_PER_EVENT and period_key == "event")
                or (
                    policy == POLICY_ONCE_PER_DAY
                    and isinstance(local_date, str)
                    and period_key == local_date
                )
            )
            and isinstance(ballot.get("submissionId"), str)
            and _SUBMISSION_ID_PATTERN.fullmatch(str(ballot.get("submissionId")))
            is not None
            and isinstance(ballot.get("submissionFingerprint"), str)
            and _SHA256_PATTERN.fullmatch(str(ballot.get("submissionFingerprint")))
            is not None
            and ballot.get("voterKeyVersion")
            == "provider-subject-hmac-sha256-v2"
            and isinstance(ballot.get("submittedAt"), datetime)
        )
        if not identity_valid:
            _error(
                https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                "A ballot does not match the active closed candidate set.",
                "BALLOT_INTEGRITY_ERROR",
                ballotNumber=index,
            )

        selections = _validate_selections(ballot.get("selections"), contests)
        if ballot.get("submissionFingerprint") != _submission_fingerprint(
            event_id,
            division_id,
            candidate_version,
            str(ballot.get("submissionId")),
            selections,
        ):
            _error(
                https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                "A ballot submission fingerprint does not match its contents.",
                "BALLOT_INTEGRITY_ERROR",
                ballotNumber=index,
            )
        for selected_ids in selections.values():
            for candidate_id in selected_ids:
                counts[candidate_id] += 1
        stored_policy = str(ballot["policy"])
        policy_counts[stored_policy] = policy_counts.get(stored_policy, 0) + 1
        ballot_digests.append(_source_digest_entry(document_id, ballot, selections))

    if len(policy_counts) > 1:
        _error(
            https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
            "Ballots contain mixed voting policies.",
            "MIXED_VOTING_POLICIES",
        )

    source_payload = {
        "schemaVersion": RESULT_SCHEMA_VERSION,
        "eventId": event_id,
        "division": division_id,
        "candidateSetId": candidate_set_id,
        "candidateVersion": candidate_version,
        "candidateSetHash": candidate_hash,
        "ballotDigests": sorted(ballot_digests),
    }
    source_digest = hashlib.sha256(
        json.dumps(
            source_payload,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()
    generation_id = hashlib.sha256(
        f"{RESULT_WRITER_VERSION}\n{source_digest}".encode("utf-8")
    ).hexdigest()

    result = {
        "schemaVersion": RESULT_SCHEMA_VERSION,
        "writerVersion": RESULT_WRITER_VERSION,
        "generationId": generation_id,
        "eventId": event_id,
        "division": division_id,
        "candidateSetId": candidate_set_id,
        "candidateVersion": candidate_version,
        "candidateSetHash": candidate_hash,
        "totalBallots": len(ballots),
        "counts": counts,
        "sourceDigest": source_digest,
        "sourceBallotCount": len(ballots),
        "sourcePolicy": next(iter(policy_counts), None),
        "published": False,
        "updatedAt": generated_at,
    }

    # Reuse the public contract validator before anything is written.
    _public_result_summary(
        {**result, "published": True},
        public_candidate_set,
        candidate_version,
    )
    return result


def _ledger_is_consistent(policy: str, ballots: int, eligibility: int) -> bool:
    if policy == POLICY_ONCE_PER_EVENT:
        return ballots == eligibility
    if policy == POLICY_ONCE_PER_DAY:
        return eligibility == 0 if ballots == 0 else 0 < eligibility <= ballots
    return False


def rebuild_vote_results(request: https_fn.CallableRequest[Any]) -> dict[str, Any]:
    payload = _require_mapping(request.data, "data")
    event_id, division_id = _request_ids(payload)
    requested_version = _require_slug(
        payload.get("candidateVersion"),
        "candidateVersion",
    )
    _require_admin(request)

    db = admin_firestore.client()
    now = datetime.now(timezone.utc)
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
    _require_closed(event, division, now)
    if division.get("published") is not True:
        _error(
            https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
            "Voting candidates are not published.",
            "CANDIDATES_NOT_PUBLISHED",
        )

    candidate_set_id, candidate_version = _candidate_set_identity(division)
    if requested_version != candidate_version:
        _error(
            https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
            "Candidate list has changed. Refresh the admin page.",
            "CANDIDATE_VERSION_MISMATCH",
            currentCandidateVersion=candidate_version,
        )
    candidate_ref = (
        event_ref.collection(CANDIDATE_SETS_SUBCOLLECTION).document(candidate_set_id)
    )
    candidate_snapshot = candidate_ref.get()
    if not candidate_snapshot.exists:
        _error(
            https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
            "Active candidate set was not found.",
            "CONFIG_INVALID",
        )
    public_candidate_set = _public_candidate_set(
        candidate_snapshot.to_dict() or {},
        division_id,
        candidate_version,
    )

    ballots_ref = event_ref.collection(BALLOTS_SUBCOLLECTION)
    ballot_query = ballots_ref.where(
        filter=FieldFilter("division", "==", division_id)
    )
    ballot_snapshots = list(ballot_query.limit(MAX_RESULT_BALLOTS + 1).stream())
    if len(ballot_snapshots) > MAX_RESULT_BALLOTS:
        _error(
            https_fn.FunctionsErrorCode.RESOURCE_EXHAUSTED,
            "Voting result contains too many ballots for one synchronous rebuild.",
            "RESULT_SCAN_LIMIT",
        )
    ballots: list[tuple[str, Mapping[str, Any]]] = []
    for snapshot in ballot_snapshots:
        ballot = snapshot.to_dict() or {}
        stored_division = ballot.get("division")
        if not isinstance(stored_division, str):
            _error(
                https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                "A ballot is missing its division identity.",
                "BALLOT_INTEGRITY_ERROR",
            )
        if stored_division != division_id:
            _error(
                https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                "A ballot query returned a mismatched division identity.",
                "BALLOT_INTEGRITY_ERROR",
            )
        ballots.append((snapshot.id, ballot))
    result = build_result_snapshot(
        event_id=event_id,
        division_id=division_id,
        candidate_set_id=candidate_set_id,
        candidate_version=candidate_version,
        public_candidate_set=public_candidate_set,
        ballots=ballots,
        generated_at=now,
    )

    eligibility_query = event_ref.collection(ELIGIBILITY_SUBCOLLECTION).where(
        filter=FieldFilter("division", "==", division_id)
    )
    eligibility_snapshots = list(
        eligibility_query.limit(MAX_RESULT_BALLOTS + 1).stream()
    )
    if len(eligibility_snapshots) > MAX_RESULT_BALLOTS:
        _error(
            https_fn.FunctionsErrorCode.RESOURCE_EXHAUSTED,
            "Voting result contains too many eligibility documents for one synchronous rebuild.",
            "RESULT_SCAN_LIMIT",
        )
    eligibility = [snapshot.to_dict() or {} for snapshot in eligibility_snapshots]
    eligibility_count = len(eligibility)
    configured_policy = _policy(event, division)
    if result.get("sourcePolicy") not in {None, configured_policy}:
        _error(
            https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
            "Ballot policy does not match the closed division configuration.",
            "BALLOT_POLICY_MISMATCH",
            configuredPolicy=configured_policy,
            sourcePolicy=result.get("sourcePolicy"),
        )
    ledger_link_issues = _ledger_link_issues(
        event_id=event_id,
        division_id=division_id,
        policy=configured_policy,
        ballots=ballots,
        eligibility=eligibility,
    )
    if ledger_link_issues:
        _error(
            https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
            "Ballot and eligibility ledger links are inconsistent.",
            "BALLOT_ELIGIBILITY_LINK_MISMATCH",
            issues=sorted(ledger_link_issues),
        )
    if not _ledger_is_consistent(
        configured_policy,
        result["totalBallots"],
        eligibility_count,
    ):
        _error(
            https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
            "Ballot and eligibility ledgers are inconsistent.",
            "BALLOT_ELIGIBILITY_COUNT_MISMATCH",
            ballotCount=result["totalBallots"],
            eligibilityCount=eligibility_count,
        )

    # Detect a late ledger change before committing the derived document.
    if (
        _aggregation_count(ballot_query) != len(ballot_snapshots)
        or _aggregation_count(eligibility_query) != len(eligibility_snapshots)
    ):
        _error(
            https_fn.FunctionsErrorCode.ABORTED,
            "Ballot ledger changed during result generation. Run it again.",
            "RESULT_SOURCE_CHANGED",
        )

    result_ref = event_ref.collection(RESULT_DRAFTS_SUBCOLLECTION).document(division_id)
    transaction = db.transaction()

    @google_firestore.transactional
    def write_draft(txn: google_firestore.Transaction) -> None:
        latest_event_snapshot = event_ref.get(transaction=txn)
        latest_candidate_snapshot = candidate_ref.get(transaction=txn)
        if not latest_event_snapshot.exists or not latest_candidate_snapshot.exists:
            _error(
                https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                "Voting configuration changed during result generation.",
                "RESULT_SOURCE_CHANGED",
            )
        latest_event = latest_event_snapshot.to_dict() or {}
        latest_division = _event_division(latest_event, division_id)
        _require_closed(latest_event, latest_division, now)
        if _candidate_set_identity(latest_division) != (
            candidate_set_id,
            candidate_version,
        ):
            _error(
                https_fn.FunctionsErrorCode.ABORTED,
                "Candidate configuration changed during result generation.",
                "RESULT_SOURCE_CHANGED",
            )
        latest_public_set = _public_candidate_set(
            latest_candidate_snapshot.to_dict() or {},
            division_id,
            candidate_version,
        )
        if latest_public_set["contentHash"] != result["candidateSetHash"]:
            _error(
                https_fn.FunctionsErrorCode.ABORTED,
                "Candidate content changed during result generation.",
                "RESULT_SOURCE_CHANGED",
            )

        divisions = deepcopy(latest_event.get("divisions"))
        if not isinstance(divisions, dict) or not isinstance(divisions.get(division_id), dict):
            _error(
                https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                "Voting division configuration is invalid.",
                "CONFIG_INVALID",
            )
        divisions[division_id]["resultsPublished"] = False
        divisions[division_id]["resultSourceDigest"] = result["sourceDigest"]
        divisions[division_id]["resultGenerationId"] = result["generationId"]
        txn.set(
            result_ref,
            {
                **result,
                "generatedAt": admin_firestore.SERVER_TIMESTAMP,
                "updatedAt": admin_firestore.SERVER_TIMESTAMP,
            },
        )
        txn.update(
            event_ref,
            {
                "divisions": divisions,
                "updatedAt": admin_firestore.SERVER_TIMESTAMP,
            },
        )

    write_draft(transaction)
    return {
        "eventId": event_id,
        "division": division_id,
        "candidateVersion": candidate_version,
        "candidateSetHash": result["candidateSetHash"],
        "totalBallots": result["totalBallots"],
        "sourceDigest": result["sourceDigest"],
        "generationId": result["generationId"],
        "published": False,
        "generatedAt": now.isoformat(),
    }


def set_vote_results_published(
    request: https_fn.CallableRequest[Any],
) -> dict[str, Any]:
    payload = _require_mapping(request.data, "data")
    event_id, division_id = _request_ids(payload)
    requested_version = _require_slug(
        payload.get("candidateVersion"),
        "candidateVersion",
    )
    expected_generation_id = _require_slug(
        payload.get("generationId"),
        "generationId",
    )
    publish = _require_boolean(payload, "published")
    _require_admin(request)

    if publish:
        # Re-scan the CLOSED ledger immediately before publication. This catches
        # source changes made before the scan completes and keeps a reviewed
        # generation stable for the normal callable path. It is not an atomic
        # seal against an out-of-band Admin SDK write after this scan; IAM,
        # audit logs, and the no-manual-ledger-write runbook remain that trust
        # boundary.
        rebuilt = rebuild_vote_results(request)
        if rebuilt.get("generationId") != expected_generation_id:
            _error(
                https_fn.FunctionsErrorCode.ABORTED,
                "Voting source changed after the reviewed result draft was generated.",
                "RESULT_SOURCE_CHANGED",
                currentGenerationId=rebuilt.get("generationId"),
            )

    db = admin_firestore.client()
    now = datetime.now(timezone.utc)
    event_ref = db.collection(EVENTS_COLLECTION).document(event_id)
    draft_ref = event_ref.collection(RESULT_DRAFTS_SUBCOLLECTION).document(division_id)
    public_result_ref = event_ref.collection(PUBLIC_RESULTS_SUBCOLLECTION).document(division_id)
    transaction = db.transaction()

    @google_firestore.transactional
    def update_publication(txn: google_firestore.Transaction) -> dict[str, Any]:
        event_snapshot = event_ref.get(transaction=txn)
        result_snapshot = (
            draft_ref.get(transaction=txn)
            if publish
            else public_result_ref.get(transaction=txn)
        )
        if not event_snapshot.exists:
            _error(
                https_fn.FunctionsErrorCode.NOT_FOUND,
                "Voting event was not found.",
                "EVENT_NOT_FOUND",
            )
        if not result_snapshot.exists:
            _error(
                https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                "Generate a result draft before changing publication.",
                "RESULT_NOT_FOUND",
            )
        event = event_snapshot.to_dict() or {}
        division = _event_division(event, division_id)
        _require_closed(event, division, now)
        candidate_set_id, candidate_version = _candidate_set_identity(division)
        if requested_version != candidate_version:
            _error(
                https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                "Candidate list has changed. Refresh the admin page.",
                "CANDIDATE_VERSION_MISMATCH",
                currentCandidateVersion=candidate_version,
            )
        candidate_ref = (
            event_ref.collection(CANDIDATE_SETS_SUBCOLLECTION).document(candidate_set_id)
        )
        candidate_snapshot = candidate_ref.get(transaction=txn)
        if not candidate_snapshot.exists:
            _error(
                https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                "Active candidate set was not found.",
                "CONFIG_INVALID",
            )
        public_candidate_set = _public_candidate_set(
            candidate_snapshot.to_dict() or {},
            division_id,
            candidate_version,
        )
        result = result_snapshot.to_dict() or {}
        if result.get("generationId") != expected_generation_id:
            _error(
                https_fn.FunctionsErrorCode.ABORTED,
                "Result draft changed. Refresh the admin page before publishing.",
                "RESULT_SOURCE_CHANGED",
            )
        if (
            division.get("resultGenerationId") != expected_generation_id
            or division.get("resultSourceDigest") != result.get("sourceDigest")
        ):
            _error(
                https_fn.FunctionsErrorCode.ABORTED,
                "Event result metadata no longer matches the validated result draft.",
                "RESULT_SOURCE_CHANGED",
            )
        _public_result_summary(
            {**result, "published": True},
            public_candidate_set,
            candidate_version,
        )

        divisions = deepcopy(event.get("divisions"))
        if not isinstance(divisions, dict) or not isinstance(divisions.get(division_id), dict):
            _error(
                https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                "Voting division configuration is invalid.",
                "CONFIG_INVALID",
            )
        divisions[division_id]["resultsPublished"] = publish
        divisions[division_id]["resultSourceDigest"] = result.get("sourceDigest")
        divisions[division_id]["resultGenerationId"] = expected_generation_id
        divisions[division_id]["resultsPublishedAt"] = (
            admin_firestore.SERVER_TIMESTAMP if publish else None
        )
        if publish:
            txn.set(
                public_result_ref,
                {
                    **result,
                    "published": True,
                    "publishedAt": admin_firestore.SERVER_TIMESTAMP,
                    "updatedAt": admin_firestore.SERVER_TIMESTAMP,
                },
            )
            txn.update(
                draft_ref,
                {
                    "lastPublishedAt": admin_firestore.SERVER_TIMESTAMP,
                },
            )
        else:
            txn.update(
                public_result_ref,
                {
                    "published": False,
                    "publishedAt": None,
                    "updatedAt": admin_firestore.SERVER_TIMESTAMP,
                },
            )
        txn.update(
            event_ref,
            {
                "divisions": divisions,
                "updatedAt": admin_firestore.SERVER_TIMESTAMP,
            },
        )
        return {
            "eventId": event_id,
            "division": division_id,
            "candidateVersion": candidate_version,
            "candidateSetHash": public_candidate_set["contentHash"],
            "sourceDigest": result.get("sourceDigest"),
            "generationId": expected_generation_id,
            "totalBallots": int(result["totalBallots"]),
            "published": publish,
            "updatedAt": now.isoformat(),
        }

    return update_publication(transaction)
