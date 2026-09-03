"""Read-only, privacy-preserving administration views for All-Star voting.

The dashboard deliberately returns receipt metadata and integrity results only.
It never returns voter identities, raw HMAC document IDs, or ballot selections.
"""

from __future__ import annotations

import hashlib
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping

from firebase_admin import firestore as admin_firestore
from firebase_functions import https_fn
from google.cloud import firestore as google_firestore
from google.cloud.firestore_v1 import aggregation
from google.cloud.firestore_v1.base_query import FieldFilter

from allstar_voting import BALLOTS_SUBCOLLECTION
from allstar_voting import CANDIDATE_SETS_SUBCOLLECTION
from allstar_voting import EVENTS_COLLECTION
from allstar_voting import POLICY_ONCE_PER_DAY
from allstar_voting import POLICY_ONCE_PER_EVENT
from allstar_voting import PUBLIC_RESULTS_SUBCOLLECTION
from allstar_voting import RESULT_DRAFTS_SUBCOLLECTION
from allstar_voting import SUPPORTED_POLICIES
from allstar_voting import ELIGIBILITY_SUBCOLLECTION
from allstar_voting import _auth_token
from allstar_voting import _candidate_set_identity
from allstar_voting import _effective_state
from allstar_voting import _error
from allstar_voting import _event_division
from allstar_voting import _iso
from allstar_voting import _policy
from allstar_voting import _public_candidate_set
from allstar_voting import _public_result_summary
from allstar_voting import _request_ids
from allstar_voting import _require_slug
from allstar_voting import _submission_fingerprint
from allstar_voting import _timezone_name
from allstar_voting import _validate_selections
from feature_flags import ALLSTAR_FEATURE_ID
from feature_flags import FEATURE_FLAG_AUDIT_COLLECTION
from feature_flags import FEATURE_FLAG_SCHEMA_VERSION
from feature_flags import allstar_feature_ref
from feature_flags import parse_allstar_feature


DEFAULT_LOG_LIMIT = 100
MAX_LOG_LIMIT = 200
# Keep the manual audit ceiling aligned with the result rebuild ceiling.  Ballots
# and eligibility ledgers are independent collections, so the limit applies to
# each collection rather than to their combined document count.
MAX_AUDIT_BALLOTS = 20_000
MAX_AUDIT_ELIGIBILITY = 20_000
_SAFE_METADATA_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,100}$")
_SHA256_PATTERN = re.compile(r"^[0-9a-fA-F]{64}$")


def _is_admin_token(token: Mapping[str, Any]) -> bool:
    return token.get("admin") is True


def _require_admin(request: https_fn.CallableRequest[Any]) -> Mapping[str, Any]:
    token = _auth_token(request)
    if not _is_admin_token(token):
        _error(
            https_fn.FunctionsErrorCode.PERMISSION_DENIED,
            "Administrator permission is required.",
            "ADMIN_REQUIRED",
        )
    return token


def set_allstar_feature_enabled(
    request: https_fn.CallableRequest[Any],
) -> dict[str, Any]:
    """Change the public master switch with revision checks and an audit record."""
    payload = request.data
    if not isinstance(payload, Mapping):
        _error(
            https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            "Request data must be an object.",
            "INVALID_REQUEST",
        )
    token = _require_admin(request)
    enabled = payload.get("enabled")
    if not isinstance(enabled, bool):
        _error(
            https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            "'enabled' must be a boolean.",
            "INVALID_FEATURE_STATE",
        )
    expected_revision = payload.get("expectedRevision")
    if (
        isinstance(expected_revision, bool)
        or not isinstance(expected_revision, int)
        or expected_revision < 0
    ):
        _error(
            https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            "'expectedRevision' must be a non-negative integer.",
            "INVALID_FEATURE_REVISION",
        )
    event_id = _require_slug(payload.get("eventId"), "eventId")
    confirmation = payload.get("confirmation", "")
    if enabled and confirmation != "올스타 기능 공개":
        _error(
            https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            "The activation confirmation phrase is incorrect.",
            "FEATURE_CONFIRMATION_REQUIRED",
        )
    reason = payload.get("reason", "")
    if not isinstance(reason, str) or len(reason.strip()) > 240:
        _error(
            https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            "'reason' must be a string up to 240 characters.",
            "INVALID_FEATURE_REASON",
        )

    db = admin_firestore.client()
    feature_ref = allstar_feature_ref(db)
    event_ref = db.collection(EVENTS_COLLECTION).document(event_id)
    audit_ref = db.collection(FEATURE_FLAG_AUDIT_COLLECTION).document()
    transaction = db.transaction()
    actor_uid = getattr(getattr(request, "auth", None), "uid", None)
    if not isinstance(actor_uid, str) or not actor_uid:
        actor_uid = token.get("uid") if isinstance(token.get("uid"), str) else "unknown-admin"

    @google_firestore.transactional
    def update_flag(txn: google_firestore.Transaction) -> tuple[bool, int]:
        feature_snapshot = feature_ref.get(transaction=txn)
        before = parse_allstar_feature(feature_snapshot)
        current_revision = int(before["revision"])
        if current_revision != expected_revision:
            _error(
                https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                "Feature state changed in another administrator session.",
                "FEATURE_FLAG_REVISION_CONFLICT",
                currentRevision=current_revision,
            )

        event_snapshot = event_ref.get(transaction=txn)
        event = event_snapshot.to_dict() or {} if event_snapshot.exists else {}
        if enabled:
            divisions = event.get("divisions")
            if not event_snapshot.exists or not isinstance(divisions, Mapping) or not divisions:
                _error(
                    https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                    "A valid All-Star event configuration is required before publication.",
                    "FEATURE_ACTIVATION_NOT_READY",
                )

        next_revision = current_revision + 1
        changed_at = admin_firestore.SERVER_TIMESTAMP
        txn.set(
            feature_ref,
            {
                "schemaVersion": FEATURE_FLAG_SCHEMA_VERSION,
                "enabled": enabled,
                "revision": next_revision,
                "updatedAt": changed_at,
            },
        )

        # Emergency OFF is a one-way safety action for the active round. The
        # public switch can later be enabled, but event intake must be reopened
        # explicitly in a separate operation.
        if not enabled and event_snapshot.exists:
            divisions = event.get("divisions")
            disabled_divisions: dict[str, Any] = {}
            if isinstance(divisions, Mapping):
                for division_id, raw_division in divisions.items():
                    if isinstance(raw_division, Mapping):
                        disabled_divisions[str(division_id)] = {
                            **dict(raw_division),
                            "enabled": False,
                        }
            txn.update(
                event_ref,
                {
                    "enabled": False,
                    "divisions": disabled_divisions,
                    "updatedAt": changed_at,
                },
            )

        txn.create(
            audit_ref,
            {
                "schemaVersion": 1,
                "feature": ALLSTAR_FEATURE_ID,
                "before": before["enabled"] is True,
                "after": enabled,
                "revision": next_revision,
                "eventId": event_id,
                "actorUid": actor_uid,
                "reason": reason.strip() or None,
                "changedAt": changed_at,
            },
        )
        return before["enabled"] is True, next_revision

    before_enabled, revision = update_flag(transaction)
    after_snapshot = feature_ref.get()
    after = parse_allstar_feature(after_snapshot)
    return {
        "feature": ALLSTAR_FEATURE_ID,
        "enabled": after["enabled"] is True,
        "before": before_enabled,
        "revision": revision,
        "updatedAt": _iso(after.get("updatedAt")),
        "eventIntakeDisabled": not enabled,
    }


def _log_limit(payload: Mapping[str, Any]) -> int:
    value = payload.get("limit", DEFAULT_LOG_LIMIT)
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= MAX_LOG_LIMIT:
        _error(
            https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            f"'limit' must be an integer between 1 and {MAX_LOG_LIMIT}.",
            "INVALID_LOG_LIMIT",
        )
    return value


def _full_audit_requested(payload: Mapping[str, Any]) -> bool:
    value = payload.get("fullAudit", False)
    if not isinstance(value, bool):
        _error(
            https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            "'fullAudit' must be a boolean.",
            "INVALID_FULL_AUDIT",
        )
    return value


def _aggregation_count(query: Any) -> int:
    aggregate_query = aggregation.AggregationQuery(query)
    aggregate_query.count(alias="count")
    results = list(aggregate_query.get())
    if not results or not results[0]:
        return 0
    value = results[0][0].value
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        _error(
            https_fn.FunctionsErrorCode.INTERNAL,
            "Voting count aggregation returned an invalid value.",
            "COUNT_AGGREGATION_INVALID",
        )
    return value


def _receipt_code(document_id: str) -> str:
    # Do not expose the provider-subject-derived HMAC document ID to the browser.
    digest = hashlib.sha256(f"admin-receipt-v1\n{document_id}".encode("utf-8")).hexdigest()
    return digest[:12].upper()


def _safe_metadata(value: object) -> str | None:
    return value if isinstance(value, str) and _SAFE_METADATA_PATTERN.fullmatch(value) else None


def _error_reason(error: https_fn.HttpsError) -> str:
    details = getattr(error, "details", None)
    if isinstance(details, Mapping):
        reason = details.get("reason")
        if isinstance(reason, str) and reason:
            return reason
    return "VALIDATION_ERROR"


def _submitted_sort_value(value: object) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    return datetime.min.replace(tzinfo=timezone.utc)


def _admin_ballot_log(
    document_id: str,
    ballot: Mapping[str, Any],
    event_id: str,
    division_id: str,
    candidate_sets: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    issues: list[str] = []
    candidate_set_id = ballot.get("candidateSetId")
    candidate_version = _safe_metadata(ballot.get("candidateVersion"))
    selected_count = 0

    if ballot.get("schemaVersion") != 2:
        issues.append("SCHEMA_VERSION")
    if _SHA256_PATTERN.fullmatch(document_id) is None:
        issues.append("BALLOT_ID_INVALID")
    if ballot.get("eventId") != event_id:
        issues.append("EVENT_MISMATCH")
    if ballot.get("division") != division_id:
        issues.append("DIVISION_MISMATCH")
    if ballot.get("policy") not in SUPPORTED_POLICIES:
        issues.append("POLICY_INVALID")
    if not isinstance(ballot.get("submittedAt"), datetime):
        issues.append("SUBMITTED_AT_MISSING")
    if ballot.get("voterKeyVersion") != "provider-subject-hmac-sha256-v2":
        issues.append("VOTER_KEY_VERSION")

    if not isinstance(candidate_set_id, str) or candidate_version is None:
        issues.append("CANDIDATE_IDENTITY_MISSING")
    else:
        raw_candidate_set = candidate_sets.get(candidate_set_id)
        if raw_candidate_set is None:
            issues.append("CANDIDATE_SET_MISSING")
        else:
            try:
                public_set = _public_candidate_set(
                    raw_candidate_set,
                    division_id,
                    candidate_version,
                )
                if ballot.get("candidateSetHash") != public_set["contentHash"]:
                    issues.append("CANDIDATE_HASH_MISMATCH")
                selections = _validate_selections(
                    ballot.get("selections"),
                    public_set["contests"],
                )
                selected_count = sum(len(values) for values in selections.values())
                submission_id = _safe_metadata(ballot.get("submissionId"))
                submission_fingerprint = ballot.get("submissionFingerprint")
                if submission_id is None:
                    issues.append("SUBMISSION_ID_MISSING")
                elif (
                    not isinstance(submission_fingerprint, str)
                    or _SHA256_PATTERN.fullmatch(submission_fingerprint) is None
                ):
                    issues.append("SUBMISSION_FINGERPRINT_MISSING")
                elif submission_fingerprint != _submission_fingerprint(
                    event_id,
                    division_id,
                    candidate_version,
                    submission_id,
                    selections,
                ):
                    issues.append("SUBMISSION_FINGERPRINT_MISMATCH")
            except https_fn.HttpsError as error:
                issues.append(_error_reason(error))

    return {
        "receiptCode": _receipt_code(document_id),
        "submittedAt": _iso(ballot.get("submittedAt")),
        "division": division_id if ballot.get("division") == division_id else None,
        "candidateVersion": candidate_version,
        "candidateSetHashPrefix": (
            str(ballot.get("candidateSetHash"))[:12]
            if isinstance(ballot.get("candidateSetHash"), str)
            and _SHA256_PATTERN.fullmatch(ballot["candidateSetHash"])
            else None
        ),
        "policy": ballot.get("policy") if ballot.get("policy") in SUPPORTED_POLICIES else None,
        "periodKey": _safe_metadata(ballot.get("periodKey")),
        "localDate": _safe_metadata(ballot.get("localDate")),
        "selectedCount": selected_count,
        "integrity": "OK" if not issues else "REVIEW",
        "issues": sorted(set(issues)),
    }


def _ledger_link_issues(
    *,
    event_id: str,
    division_id: str,
    policy: str,
    ballots: list[tuple[str, Mapping[str, Any]]],
    eligibility: list[Mapping[str, Any]],
) -> Counter[str]:
    """Verify that every eligibility pointer resolves to the same atomic ballot."""
    issues: Counter[str] = Counter()
    ballot_by_id = {document_id: ballot for document_id, ballot in ballots}
    pointed_ballot_ids: set[str] = set()

    for ledger in eligibility:
        if (
            ledger.get("schemaVersion") != 1
            or ledger.get("eventId") != event_id
            or ledger.get("division") != division_id
            or ledger.get("voterKeyVersion") != "provider-subject-hmac-sha256-v2"
        ):
            issues["ELIGIBILITY_SCHEMA_INVALID"] += 1

        ballot_id = ledger.get("lastBallotId")
        if not isinstance(ballot_id, str) or _SHA256_PATTERN.fullmatch(ballot_id) is None:
            issues["ELIGIBILITY_BALLOT_POINTER_INVALID"] += 1
            continue
        if ballot_id in pointed_ballot_ids:
            issues["ELIGIBILITY_BALLOT_POINTER_DUPLICATE"] += 1
        pointed_ballot_ids.add(ballot_id)

        ballot = ballot_by_id.get(ballot_id)
        if ballot is None:
            issues["ELIGIBILITY_BALLOT_NOT_FOUND"] += 1
            continue
        if (
            ledger.get("lastSubmissionId") != ballot.get("submissionId")
            or ledger.get("lastSubmissionFingerprint")
            != ballot.get("submissionFingerprint")
        ):
            issues["ELIGIBILITY_SUBMISSION_MISMATCH"] += 1
        if (
            ledger.get("lastPolicy") != ballot.get("policy")
            or ledger.get("lastPeriodKey") != ballot.get("periodKey")
            or ledger.get("lastLocalDate") != ballot.get("localDate")
            or ledger.get("lastCandidateVersion")
            != ballot.get("candidateVersion")
        ):
            issues["ELIGIBILITY_BALLOT_METADATA_MISMATCH"] += 1

    ballot_ids = set(ballot_by_id)
    if policy == POLICY_ONCE_PER_EVENT and pointed_ballot_ids != ballot_ids:
        issues["ELIGIBILITY_BALLOT_SET_MISMATCH"] += 1
    elif policy == POLICY_ONCE_PER_DAY and ballot_ids and not pointed_ballot_ids:
        issues["ELIGIBILITY_BALLOT_SET_MISMATCH"] += 1
    return issues


def _counter_rows(counter: Counter[str]) -> list[dict[str, Any]]:
    return [
        {"key": key, "count": count}
        for key, count in sorted(counter.items(), key=lambda item: (-item[1], item[0]))
    ]


def _recompute_active_counts(
    ballots: list[tuple[str, Mapping[str, Any]]],
    division_id: str,
    active_candidate_set_id: str,
    active_candidate_set: Mapping[str, Any],
    active_version: str,
) -> tuple[int, dict[str, int]]:
    candidates = active_candidate_set.get("candidates")
    contests = active_candidate_set.get("contests")
    if not isinstance(candidates, Mapping) or not isinstance(contests, Mapping):
        _error(
            https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
            "Active candidate set is invalid.",
            "CONFIG_INVALID",
        )
    expected_hash = active_candidate_set.get("contentHash")
    counts = {str(candidate_id): 0 for candidate_id in candidates}
    valid_ballots = 0
    for _, ballot in ballots:
        if (
            ballot.get("division") != division_id
            or ballot.get("candidateSetId") != active_candidate_set_id
            or ballot.get("candidateVersion") != active_version
            or ballot.get("candidateSetHash") != expected_hash
        ):
            continue
        try:
            selections = _validate_selections(ballot.get("selections"), contests)
        except https_fn.HttpsError:
            continue
        valid_ballots += 1
        for selected in selections.values():
            for candidate_id in selected:
                counts[candidate_id] += 1
    return valid_ballots, counts


def _safe_result_summary(
    raw_result: Mapping[str, Any],
    active_candidate_set: Mapping[str, Any],
    active_version: str,
    ballot_count: int,
    recomputed_counts: Mapping[str, int] | None = None,
    allow_unpublished: bool = False,
) -> dict[str, Any]:
    total_ballots = raw_result.get("totalBallots")
    result_count = total_ballots if isinstance(total_ballots, int) and not isinstance(total_ballots, bool) else None
    candidate_hash = raw_result.get("candidateSetHash")
    expected_hash = active_candidate_set.get("contentHash")
    schema_valid: bool | None = None
    validation_issue: str | None = None
    normalized_counts: Mapping[str, int] | None = None
    if raw_result and (raw_result.get("published") is True or allow_unpublished):
        try:
            validated = _public_result_summary(
                {**raw_result, "published": True},
                active_candidate_set,
                active_version,
            )
            schema_valid = True
            normalized_counts = validated["counts"]
        except https_fn.HttpsError as error:
            schema_valid = False
            validation_issue = _error_reason(error)
    return {
        "exists": bool(raw_result),
        "published": raw_result.get("published") is True,
        "candidateVersion": raw_result.get("candidateVersion") if isinstance(raw_result.get("candidateVersion"), str) else None,
        "candidateSetHashPrefix": str(candidate_hash)[:12] if isinstance(candidate_hash, str) else None,
        "writerVersion": _safe_metadata(raw_result.get("writerVersion")),
        "generationId": _safe_metadata(raw_result.get("generationId")),
        "sourceDigest": (
            raw_result.get("sourceDigest")
            if isinstance(raw_result.get("sourceDigest"), str)
            and _SHA256_PATTERN.fullmatch(raw_result["sourceDigest"])
            else None
        ),
        "sourceBallotCount": (
            raw_result.get("sourceBallotCount")
            if isinstance(raw_result.get("sourceBallotCount"), int)
            and not isinstance(raw_result.get("sourceBallotCount"), bool)
            else None
        ),
        "totalBallots": result_count,
        "updatedAt": _iso(raw_result.get("updatedAt")),
        "matchesActiveCandidate": (
            raw_result.get("candidateVersion") == active_version
            and candidate_hash == expected_hash
        ),
        "matchesBallotCount": result_count == ballot_count if result_count is not None else False,
        "schemaValid": schema_valid,
        "countsMatchBallots": (
            normalized_counts == recomputed_counts
            if normalized_counts is not None and recomputed_counts is not None
            else None
        ),
        "validationIssue": validation_issue,
    }


def _build_admin_overview(
    *,
    event_id: str,
    division_id: str,
    event: Mapping[str, Any],
    ballots: list[tuple[str, Mapping[str, Any]]],
    eligibility: list[Mapping[str, Any]],
    candidate_sets: Mapping[str, Mapping[str, Any]],
    raw_result: Mapping[str, Any],
    raw_draft: Mapping[str, Any] | None = None,
    now: datetime,
    limit: int,
    auditor: bool,
    ballot_count_override: int | None = None,
    eligibility_count_override: int | None = None,
    active_ballot_count_override: int | None = None,
    recent_five_minutes_override: int | None = None,
    recent_hour_override: int | None = None,
    full_audit: bool = True,
) -> dict[str, Any]:
    division = _event_division(event, division_id)
    active_set_id, active_version = _candidate_set_identity(division)
    active_raw_set = candidate_sets.get(active_set_id)
    if active_raw_set is None:
        _error(
            https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
            "Active candidate set was not found.",
            "CONFIG_INVALID",
        )
    active_candidate_set = _public_candidate_set(active_raw_set, division_id, active_version)

    target_ballots = [
        (document_id, ballot)
        for document_id, ballot in ballots
        if ballot.get("division") == division_id
    ]
    target_eligibility = [item for item in eligibility if item.get("division") == division_id]
    log_entries = [
        (
            _admin_ballot_log(
                document_id,
                ballot,
                event_id,
                division_id,
                candidate_sets,
            ),
            _submitted_sort_value(ballot.get("submittedAt")),
        )
        for document_id, ballot in target_ballots
    ]
    log_entries.sort(key=lambda entry: entry[1], reverse=True)
    logs = [entry[0] for entry in log_entries]
    ballot_count = ballot_count_override if ballot_count_override is not None else len(target_ballots)
    eligibility_count = (
        eligibility_count_override
        if eligibility_count_override is not None
        else len(target_eligibility)
    )

    recomputed_counts: dict[str, int] | None = None
    if full_audit:
        active_ballot_count, recomputed_counts = _recompute_active_counts(
            target_ballots,
            division_id,
            active_set_id,
            active_candidate_set,
            active_version,
        )
    else:
        active_ballot_count = (
            active_ballot_count_override
            if active_ballot_count_override is not None
            else ballot_count
        )

    version_counts = Counter(
        value
        for _, ballot in target_ballots
        for value in [_safe_metadata(ballot.get("candidateVersion"))]
        if value is not None
    )
    policy_counts = Counter(
        str(ballot.get("policy"))
        for _, ballot in target_ballots
        if ballot.get("policy") in {POLICY_ONCE_PER_EVENT, POLICY_ONCE_PER_DAY}
    )
    date_counts = Counter(
        value
        for _, ballot in target_ballots
        for value in [_safe_metadata(ballot.get("localDate"))]
        if value is not None
    )
    issue_counts = Counter(
        issue
        for log in logs
        for issue in log["issues"]
    )
    submitted_values = [
        _submitted_sort_value(ballot.get("submittedAt"))
        for _, ballot in target_ballots
        if isinstance(ballot.get("submittedAt"), datetime)
    ]
    latest_submitted = max(submitted_values) if submitted_values else None
    recent_five_minutes = (
        recent_five_minutes_override
        if recent_five_minutes_override is not None
        else sum(1 for submitted in submitted_values if submitted >= now - timedelta(minutes=5))
    )
    recent_hour = (
        recent_hour_override
        if recent_hour_override is not None
        else sum(1 for submitted in submitted_values if submitted >= now - timedelta(hours=1))
    )
    state = _effective_state(event, division, now)
    public_result = _safe_result_summary(
        raw_result,
        active_candidate_set,
        active_version,
        active_ballot_count,
        recomputed_counts,
    )
    draft_result = _safe_result_summary(
        raw_draft or {},
        active_candidate_set,
        active_version,
        active_ballot_count,
        recomputed_counts,
        allow_unpublished=True,
    )
    configured_policy = _policy(event, division)
    ledger_link_issue_counts = (
        _ledger_link_issues(
            event_id=event_id,
            division_id=division_id,
            policy=configured_policy,
            ballots=target_ballots,
            eligibility=target_eligibility,
        )
        if full_audit
        else Counter()
    )
    all_issue_counts = issue_counts + ledger_link_issue_counts
    has_daily_ballots = configured_policy == POLICY_ONCE_PER_DAY
    if has_daily_ballots:
        ledger_consistent = (
            eligibility_count == 0
            if ballot_count == 0
            else 0 < eligibility_count <= ballot_count
        )
    else:
        ledger_consistent = ballot_count == eligibility_count

    warnings: list[str] = []
    if not ledger_consistent and (full_audit or state != "OPEN"):
        warnings.append("BALLOT_ELIGIBILITY_COUNT_MISMATCH")
    if issue_counts:
        warnings.append("BALLOT_INTEGRITY_REVIEW_REQUIRED")
    if ledger_link_issue_counts:
        warnings.append("BALLOT_ELIGIBILITY_LINK_MISMATCH")
    if len(policy_counts) > 1:
        warnings.append("MIXED_VOTING_POLICIES")
    if public_result["published"] and (
        public_result["schemaValid"] is False
        or not public_result["matchesActiveCandidate"]
        or not public_result["matchesBallotCount"]
        or public_result["countsMatchBallots"] is False
    ):
        warnings.append("PUBLIC_RESULT_RECONCILIATION_REQUIRED")
    if division.get("resultsPublished") is True and not public_result["published"]:
        warnings.append("PUBLIC_RESULT_RECONCILIATION_REQUIRED")
    if draft_result["exists"] and (
        draft_result["schemaValid"] is False
        or not draft_result["matchesActiveCandidate"]
        or not draft_result["matchesBallotCount"]
        or draft_result["countsMatchBallots"] is False
    ):
        warnings.append("RESULT_DRAFT_RECONCILIATION_REQUIRED")
    if full_audit and state == "OPEN":
        warnings.append("FULL_AUDIT_REQUIRES_CLOSED_EVENT")

    return {
        "generatedAt": now.isoformat(),
        "eventId": event_id,
        "division": division_id,
        "auditor": auditor,
        "event": {
            "title": str(event.get("title", event_id)),
            "divisionLabel": str(division.get("label", division_id)),
            "state": state,
            "enabled": event.get("enabled") is True and division.get("enabled") is True,
            "published": division.get("published") is True,
            "resultsPublished": division.get("resultsPublished") is True,
            "policy": configured_policy,
            "timezone": _timezone_name(event, division),
            "candidateSetId": active_set_id,
            "candidateVersion": active_version,
            "candidateSetHash": active_candidate_set["contentHash"],
            "opensAt": _iso(division.get("opensAt", event.get("opensAt"))),
            "closesAt": _iso(division.get("closesAt", event.get("closesAt"))),
        },
        "metrics": {
            "ballotCount": ballot_count,
            "activeCandidateBallotCount": active_ballot_count,
            "eligibilityCount": eligibility_count,
            "ledgerConsistent": ledger_consistent,
            "ledgerLinksConsistent": (
                not ledger_link_issue_counts if full_audit else None
            ),
            "validBallotCount": sum(1 for log in logs if log["integrity"] == "OK"),
            "integrityIssueCount": sum(1 for log in logs if log["integrity"] != "OK"),
            "inspectedBallotCount": len(logs),
            "recentFiveMinutes": recent_five_minutes,
            "recentHour": recent_hour,
            "latestSubmittedAt": latest_submitted.isoformat() if latest_submitted else None,
        },
        "distributions": {
            "candidateVersions": _counter_rows(version_counts),
            "policies": _counter_rows(policy_counts),
            "localDates": _counter_rows(date_counts),
            "issues": _counter_rows(all_issue_counts),
        },
        "publicResult": public_result,
        "draftResult": draft_result,
        "warnings": sorted(set(warnings)),
        "logs": logs[:limit],
        "logLimit": limit,
        "audit": {
            "mode": "FULL" if full_audit else "RECENT",
            "complete": full_audit,
            "stable": full_audit and state != "OPEN",
            "scopeDescription": (
                "대상 부문의 전체 원장을 검사했습니다."
                if full_audit
                else f"최근 접수 {min(len(logs), limit)}건을 검사하고 전체 수량은 집계 쿼리로 조회했습니다."
            ),
        },
        "redacted": True,
    }


def get_admin_vote_overview(
    request: https_fn.CallableRequest[Any],
) -> dict[str, Any]:
    payload = request.data
    if not isinstance(payload, Mapping):
        _error(
            https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            "Request data must be an object.",
            "INVALID_REQUEST",
        )
    event_id, division_id = _request_ids(payload)
    limit = _log_limit(payload)
    full_audit = _full_audit_requested(payload)
    token = _require_admin(request)
    db = admin_firestore.client()
    request_now = datetime.now(timezone.utc)
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
    active_set_id, active_version = _candidate_set_identity(division)
    active_candidate_snapshot = (
        event_ref.collection(CANDIDATE_SETS_SUBCOLLECTION)
        .document(active_set_id)
        .get()
    )
    if not active_candidate_snapshot.exists:
        _error(
            https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
            "Active candidate set was not found.",
            "CONFIG_INVALID",
        )
    active_raw_candidate_set = active_candidate_snapshot.to_dict() or {}
    active_candidate_set = _public_candidate_set(
        active_raw_candidate_set,
        division_id,
        active_version,
    )

    ballots_ref = event_ref.collection(BALLOTS_SUBCOLLECTION)
    eligibility_ref = event_ref.collection(ELIGIBILITY_SUBCOLLECTION)
    ballot_query = ballots_ref.where(filter=FieldFilter("division", "==", division_id))
    eligibility_query = eligibility_ref.where(filter=FieldFilter("division", "==", division_id))

    ballot_count_override: int | None = None
    eligibility_count_override: int | None = None
    active_ballot_count_override: int | None = None
    recent_five_minutes_override: int | None = None
    recent_hour_override: int | None = None
    if full_audit:
        ballot_snapshots = list(ballot_query.limit(MAX_AUDIT_BALLOTS + 1).stream())
        if len(ballot_snapshots) > MAX_AUDIT_BALLOTS:
            _error(
                https_fn.FunctionsErrorCode.RESOURCE_EXHAUSTED,
                "Voting audit contains too many ballots for one full scan.",
                "AUDIT_SCAN_LIMIT",
                collection="ballots",
                maxDocuments=MAX_AUDIT_BALLOTS,
            )
        eligibility_snapshots = list(
            eligibility_query.limit(MAX_AUDIT_ELIGIBILITY + 1).stream()
        )
        if len(eligibility_snapshots) > MAX_AUDIT_ELIGIBILITY:
            _error(
                https_fn.FunctionsErrorCode.RESOURCE_EXHAUSTED,
                "Voting audit contains too many eligibility ledgers for one full scan.",
                "AUDIT_SCAN_LIMIT",
                collection="voterEligibility",
                maxDocuments=MAX_AUDIT_ELIGIBILITY,
            )
        eligibility = [snapshot.to_dict() or {} for snapshot in eligibility_snapshots]
    else:
        ballot_snapshots = list(
            ballot_query
            .order_by("submittedAt", direction=admin_firestore.Query.DESCENDING)
            .limit(limit)
            .stream()
        )
        eligibility = []
        ballot_count_override = _aggregation_count(ballot_query)
        eligibility_count_override = _aggregation_count(eligibility_query)
        active_ballot_query = (
            ballot_query
            .where(filter=FieldFilter("candidateSetId", "==", active_set_id))
            .where(filter=FieldFilter("candidateVersion", "==", active_version))
            .where(
                filter=FieldFilter(
                    "candidateSetHash",
                    "==",
                    active_candidate_set["contentHash"],
                )
            )
        )
        active_ballot_count_override = _aggregation_count(active_ballot_query)
        recent_five_minutes_override = _aggregation_count(
            ballot_query.where(
                filter=FieldFilter(
                    "submittedAt",
                    ">=",
                    request_now - timedelta(minutes=5),
                )
            )
        )
        recent_hour_override = _aggregation_count(
            ballot_query.where(
                filter=FieldFilter(
                    "submittedAt",
                    ">=",
                    request_now - timedelta(hours=1),
                )
            )
        )

    ballots = [(snapshot.id, snapshot.to_dict() or {}) for snapshot in ballot_snapshots]
    candidate_set_ids = {
        ballot.get("candidateSetId")
        for _, ballot in ballots
        if ballot.get("division") == division_id and isinstance(ballot.get("candidateSetId"), str)
    }
    candidate_set_ids.add(active_set_id)
    candidate_sets: dict[str, Mapping[str, Any]] = {
        active_set_id: active_raw_candidate_set,
    }
    for candidate_set_id in candidate_set_ids:
        if candidate_set_id in candidate_sets:
            continue
        candidate_snapshot = (
            event_ref.collection(CANDIDATE_SETS_SUBCOLLECTION)
            .document(candidate_set_id)
            .get()
        )
        if candidate_snapshot.exists:
            candidate_sets[candidate_set_id] = candidate_snapshot.to_dict() or {}

    result_snapshot = (
        event_ref.collection(PUBLIC_RESULTS_SUBCOLLECTION).document(division_id).get()
    )
    draft_snapshot = (
        event_ref.collection(RESULT_DRAFTS_SUBCOLLECTION).document(division_id).get()
    )
    return _build_admin_overview(
        event_id=event_id,
        division_id=division_id,
        event=event,
        ballots=ballots,
        eligibility=eligibility,
        candidate_sets=candidate_sets,
        raw_result=result_snapshot.to_dict() or {} if result_snapshot.exists else {},
        raw_draft=draft_snapshot.to_dict() or {} if draft_snapshot.exists else {},
        now=request_now,
        limit=limit,
        auditor=token.get("allstarVoteAuditor") is True,
        ballot_count_override=ballot_count_override,
        eligibility_count_override=eligibility_count_override,
        active_ballot_count_override=active_ballot_count_override,
        recent_five_minutes_override=recent_five_minutes_override,
        recent_hour_override=recent_hour_override,
        full_audit=full_audit,
    )
