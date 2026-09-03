#!/usr/bin/env python3
"""Concurrency and response-loss rehearsal against the Firestore emulator.

This invokes the same transaction implementation used by the callable but does
not measure HTTP, App Check, cold starts, or Cloud Run autoscaling.  It refuses
to run unless FIRESTORE_EMULATOR_HOST points to localhost.
"""

from __future__ import annotations

import argparse
import os
import statistics
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
FUNCTIONS_DIR = ROOT / "functions"
if str(FUNCTIONS_DIR) not in sys.path:
    sys.path.insert(0, str(FUNCTIONS_DIR))

from firebase_admin import firestore as admin_firestore  # noqa: E402
from firebase_admin import credentials as admin_credentials  # noqa: E402
from firebase_admin import initialize_app  # noqa: E402
from firebase_functions import https_fn  # noqa: E402
from flask import Request  # noqa: E402
from google.auth.credentials import AnonymousCredentials  # noqa: E402

from allstar_voting import ALLSTAR_SELECTION_LIMITS  # noqa: E402
from allstar_voting import ALLSTAR_SIDES  # noqa: E402
from allstar_voting import BALLOTS_SUBCOLLECTION  # noqa: E402
from allstar_voting import CONFIG_LOCKS_SUBCOLLECTION  # noqa: E402
from allstar_voting import ELIGIBILITY_SUBCOLLECTION  # noqa: E402
from allstar_voting import EVENTS_COLLECTION  # noqa: E402
from allstar_voting import get_ballot_status  # noqa: E402
from allstar_voting import submit_ballot  # noqa: E402
from feature_flags import ALLSTAR_FEATURE_ID  # noqa: E402
from feature_flags import FEATURE_FLAG_SCHEMA_VERSION  # noqa: E402
from feature_flags import PUBLIC_FEATURE_FLAGS_COLLECTION  # noqa: E402


SECRET = "emulator-only-secret-value-with-more-than-32-bytes"
ROTATED_SECRET = "rotated-emulator-secret-value-with-more-than-32-bytes"


class _EmulatorCredential(admin_credentials.Base):
    def get_credential(self) -> AnonymousCredentials:
        return AnonymousCredentials()


def _require_emulator() -> None:
    host = os.environ.get("FIRESTORE_EMULATOR_HOST", "")
    hostname = host.rsplit(":", 1)[0].strip("[]").lower()
    if hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit(
            "Refusing to run: FIRESTORE_EMULATOR_HOST must point to localhost."
        )


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


def _selections(candidate_set: dict[str, Any], offset: int = 0) -> dict[str, list[str]]:
    selections: dict[str, list[str]] = {}
    for contest_id, contest in candidate_set["contests"].items():
        candidate_ids = contest["candidateIds"]
        required = contest["maxSelections"]
        start = offset % (len(candidate_ids) - required + 1)
        selections[contest_id] = candidate_ids[start:start + required]
    return selections


def _request(event_id: str, subject: str, submission_id: str, selections: dict[str, list[str]]) -> https_fn.CallableRequest[Any]:
    auth = https_fn.AuthData(
        uid=f"firebase-{subject}",
        token={
            "sub": f"firebase-{subject}",
            "firebase": {
                "sign_in_provider": "google.com",
                "identities": {"google.com": [subject]},
            },
        },
    )
    raw_request = Request.from_values(path="/emulator-load", method="POST")
    return https_fn.CallableRequest(
        data={
            "eventId": event_id,
            "division": "allstar",
            "candidateVersion": "v1",
            "submissionId": submission_id,
            "selections": selections,
        },
        raw_request=raw_request,
        auth=auth,
    )


def _seed_event(db: Any, event_id: str, candidate_set: dict[str, Any]) -> None:
    event_ref = db.collection(EVENTS_COLLECTION).document(event_id)
    event_ref.set(
        {
            "enabled": True,
            "status": "OPEN",
            "title": "AUBL emulator load test",
            "policy": "ONCE_PER_EVENT",
            "timezone": "Asia/Seoul",
            "allowedAuthProviders": ["google.com"],
            "divisions": {
                "allstar": {
                    "label": "올스타",
                    "enabled": True,
                    "published": True,
                    "status": "OPEN",
                    "candidateSetId": "set-v1",
                    "candidateVersion": "v1",
                }
            },
        }
    )
    event_ref.collection("candidateSets").document("set-v1").set(candidate_set)


def _reason(error: BaseException) -> str:
    if isinstance(error, https_fn.HttpsError) and isinstance(error.details, dict):
        value = error.details.get("reason")
        if isinstance(value, str):
            return value
    return type(error).__name__


def _submit_timed(request: https_fn.CallableRequest[Any]) -> tuple[str, float]:
    started = time.perf_counter()
    try:
        result = submit_ballot(request, SECRET)
        outcome = "IDEMPOTENT" if result.get("idempotent") is True else "SUCCESS"
    except BaseException as error:  # test harness must classify all worker failures
        outcome = _reason(error)
    return outcome, (time.perf_counter() - started) * 1000


def _percentile(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * percentile)))
    return ordered[index]


def _counts(db: Any, event_id: str) -> tuple[int, int]:
    event_ref = db.collection(EVENTS_COLLECTION).document(event_id)
    ballots = sum(1 for _ in event_ref.collection(BALLOTS_SUBCOLLECTION).stream())
    eligibility = sum(1 for _ in event_ref.collection(ELIGIBILITY_SUBCOLLECTION).stream())
    return ballots, eligibility


def _config_lock_count(db: Any, event_id: str) -> int:
    event_ref = db.collection(EVENTS_COLLECTION).document(event_id)
    return sum(1 for _ in event_ref.collection(CONFIG_LOCKS_SUBCOLLECTION).stream())


def _run_parallel(requests: list[https_fn.CallableRequest[Any]], concurrency: int) -> tuple[dict[str, int], list[float]]:
    outcomes: dict[str, int] = {}
    latencies: list[float] = []
    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [executor.submit(_submit_timed, request) for request in requests]
        for future in as_completed(futures):
            outcome, latency = future.result()
            outcomes[outcome] = outcomes.get(outcome, 0) + 1
            latencies.append(latency)
    return outcomes, latencies


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--users", type=int, default=100)
    parser.add_argument("--concurrency", type=int, default=20)
    parser.add_argument("--same-account-burst", type=int, default=50)
    args = parser.parse_args()
    if args.users < 1 or args.concurrency < 1 or args.same_account_burst < 2:
        parser.error("users/concurrency must be positive and same-account-burst must be at least 2")

    _require_emulator()
    project = os.environ.get("GCLOUD_PROJECT", "aubl-allstar-load-test")
    initialize_app(_EmulatorCredential(), options={"projectId": project})
    db = admin_firestore.client()
    db.collection(PUBLIC_FEATURE_FLAGS_COLLECTION).document(ALLSTAR_FEATURE_ID).set(
        {
            "schemaVersion": FEATURE_FLAG_SCHEMA_VERSION,
            "enabled": True,
            "revision": 1,
            "updatedAt": admin_firestore.SERVER_TIMESTAMP,
        }
    )
    candidate_set = _candidate_set()
    run_id = uuid.uuid4().hex[:10]

    same_event = f"loadtest-same-{run_id}"
    _seed_event(db, same_event, candidate_set)
    same_requests = [
        _request(
            same_event,
            "same-google-subject",
            f"same-{index}-{uuid.uuid4().hex}",
            _selections(candidate_set),
        )
        for index in range(args.same_account_burst)
    ]
    same_outcomes, _ = _run_parallel(same_requests, args.concurrency)
    same_counts = _counts(db, same_event)
    if same_outcomes.get("SUCCESS") != 1 or same_counts != (1, 1):
        raise SystemExit(
            f"same-account invariant failed: outcomes={same_outcomes}, ledgers={same_counts}"
        )

    response_event = f"loadtest-response-{run_id}"
    _seed_event(db, response_event, candidate_set)
    submission_id = f"response-loss-{uuid.uuid4().hex}"
    response_request = _request(
        response_event,
        "response-google-subject",
        submission_id,
        _selections(candidate_set),
    )
    submit_ballot(response_request, SECRET)
    status = get_ballot_status(response_request, SECRET)
    retry_outcome, _ = _submit_timed(response_request)
    changed_retry = _request(
        response_event,
        "response-google-subject",
        submission_id,
        _selections(candidate_set, offset=1),
    )
    changed_retry_outcome, _ = _submit_timed(changed_retry)
    if (
        status.get("submissionId") != submission_id
        or retry_outcome != "IDEMPOTENT"
        or changed_retry_outcome != "ALREADY_VOTED"
        or _counts(db, response_event) != (1, 1)
    ):
        raise SystemExit(
            "response-loss recovery failed: "
            f"status={status.get('submissionId')}, retry={retry_outcome}, "
            f"changedRetry={changed_retry_outcome}, ledgers={_counts(db, response_event)}"
        )

    legacy_event = f"loadtest-legacy-{run_id}"
    _seed_event(db, legacy_event, candidate_set)
    legacy_request = _request(
        legacy_event,
        "legacy-google-subject",
        f"legacy-{uuid.uuid4().hex}",
        _selections(candidate_set),
    )
    submit_ballot(legacy_request, SECRET)
    legacy_event_ref = db.collection(EVENTS_COLLECTION).document(legacy_event)
    legacy_event_ref.collection(CONFIG_LOCKS_SUBCOLLECTION).document("allstar").delete()
    rotated_request = _request(
        legacy_event,
        "different-google-subject",
        f"rotated-{uuid.uuid4().hex}",
        _selections(candidate_set, offset=1),
    )
    try:
        get_ballot_status(rotated_request, ROTATED_SECRET)
        legacy_status_outcome = "SUCCESS"
    except BaseException as error:
        legacy_status_outcome = _reason(error)
    try:
        submit_ballot(rotated_request, ROTATED_SECRET)
        legacy_submit_outcome = "SUCCESS"
    except BaseException as error:
        legacy_submit_outcome = _reason(error)
    legacy_lock_exists = (
        legacy_event_ref.collection(CONFIG_LOCKS_SUBCOLLECTION)
        .document("allstar")
        .get()
        .exists
    )
    if (
        legacy_status_outcome != "VOTING_CONFIG_LOCK_MISSING"
        or legacy_submit_outcome != "VOTING_CONFIG_LOCK_MISSING"
        or _counts(db, legacy_event) != (1, 1)
        or legacy_lock_exists
    ):
        raise SystemExit(
            "legacy pre-lock fail-closed invariant failed: "
            f"status={legacy_status_outcome}, submit={legacy_submit_outcome}, "
            f"ledgers={_counts(db, legacy_event)}, lockExists={legacy_lock_exists}"
        )

    distinct_event = f"loadtest-distinct-{run_id}"
    _seed_event(db, distinct_event, candidate_set)
    distinct_requests = [
        _request(
            distinct_event,
            f"google-subject-{index}",
            f"distinct-{index}-{uuid.uuid4().hex}",
            _selections(candidate_set, offset=index),
        )
        for index in range(args.users)
    ]
    outcomes, latencies = _run_parallel(distinct_requests, args.concurrency)
    ledger_counts = _counts(db, distinct_event)
    if outcomes != {"SUCCESS": args.users} or ledger_counts != (args.users, args.users):
        raise SystemExit(
            f"distinct-account invariant failed: outcomes={outcomes}, ledgers={ledger_counts}"
        )

    steady_event = f"loadtest-steady-{run_id}"
    _seed_event(db, steady_event, candidate_set)
    steady_seed_request = _request(
        steady_event,
        "steady-seed-google-subject",
        f"steady-seed-{uuid.uuid4().hex}",
        _selections(candidate_set),
    )
    steady_seed_result = submit_ballot(steady_seed_request, SECRET)
    if steady_seed_result.get("idempotent") is True:
        raise SystemExit("steady-state seed unexpectedly used an existing ballot")
    steady_requests = [
        _request(
            steady_event,
            f"steady-google-subject-{index}",
            f"steady-{index}-{uuid.uuid4().hex}",
            _selections(candidate_set, offset=index),
        )
        for index in range(args.users)
    ]
    steady_outcomes, steady_latencies = _run_parallel(
        steady_requests,
        args.concurrency,
    )
    steady_counts = _counts(db, steady_event)
    steady_lock_count = _config_lock_count(db, steady_event)
    expected_steady_count = args.users + 1
    if (
        steady_outcomes != {"SUCCESS": args.users}
        or steady_counts != (expected_steady_count, expected_steady_count)
        or steady_lock_count != 1
    ):
        raise SystemExit(
            "steady-state invariant failed: "
            f"outcomes={steady_outcomes}, ledgers={steady_counts}, "
            f"locks={steady_lock_count}"
        )

    close_event = f"loadtest-closed-{run_id}"
    _seed_event(db, close_event, candidate_set)
    event_ref = db.collection(EVENTS_COLLECTION).document(close_event)
    event = event_ref.get().to_dict() or {}
    event["divisions"]["allstar"]["status"] = "CLOSED"
    event_ref.set(event)
    closed_requests = [
        _request(
            close_event,
            f"closed-subject-{index}",
            f"closed-{index}-{uuid.uuid4().hex}",
            _selections(candidate_set),
        )
        for index in range(min(args.users, 50))
    ]
    closed_outcomes, _ = _run_parallel(closed_requests, args.concurrency)
    if closed_outcomes.get("SUCCESS", 0) != 0 or _counts(db, close_event) != (0, 0):
        raise SystemExit(
            f"closed-event invariant failed: outcomes={closed_outcomes}, ledgers={_counts(db, close_event)}"
        )

    report = {
        "emulator": os.environ["FIRESTORE_EMULATOR_HOST"],
        "users": args.users,
        "concurrency": args.concurrency,
        "sameAccount": {"outcomes": same_outcomes, "ledgers": same_counts},
        "responseLoss": {
            "submissionRecovered": True,
            "retry": retry_outcome,
            "changedPayloadRetry": changed_retry_outcome,
            "ledgers": [1, 1],
        },
        "legacyPreLock": {
            "status": legacy_status_outcome,
            "submit": legacy_submit_outcome,
            "ledgers": [1, 1],
            "lockRecreated": legacy_lock_exists,
            "rotatedSecret": True,
        },
        "firstBurst": {
            "outcomes": outcomes,
            "ledgers": ledger_counts,
            "latencyMs": {
                "mean": round(statistics.mean(latencies), 2),
                "p50": round(_percentile(latencies, 0.50), 2),
                "p95": round(_percentile(latencies, 0.95), 2),
                "p99": round(_percentile(latencies, 0.99), 2),
            },
        },
        "steadyState": {
            "seedBallots": 1,
            "outcomes": steady_outcomes,
            "ledgers": steady_counts,
            "configLocks": steady_lock_count,
            "latencyMs": {
                "mean": round(statistics.mean(steady_latencies), 2),
                "p50": round(_percentile(steady_latencies, 0.50), 2),
                "p95": round(_percentile(steady_latencies, 0.95), 2),
                "p99": round(_percentile(steady_latencies, 0.99), 2),
            },
        },
        "closedEvent": {"outcomes": closed_outcomes, "ledgers": [0, 0]},
        "scope": "Firestore emulator transaction integrity; excludes HTTP/App Check/cold start/autoscaling",
    }
    print(__import__("json").dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
