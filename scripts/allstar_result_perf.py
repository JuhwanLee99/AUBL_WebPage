#!/usr/bin/env python3
"""Pure-Python worst-case rehearsal for closed All-Star result generation.

This benchmark intentionally performs no Firebase or network I/O.  It builds
the maximum supported in-memory ballot ledger, then runs the same candidate,
selection, submission-fingerprint, source-digest, and result-count validation
used by the production result writer.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import resource
import sys
import time
import tracemalloc
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
FUNCTIONS_DIR = ROOT / "functions"
if str(FUNCTIONS_DIR) not in sys.path:
    sys.path.insert(0, str(FUNCTIONS_DIR))

from allstar_results import MAX_RESULT_BALLOTS  # noqa: E402
from allstar_results import build_result_snapshot  # noqa: E402
from allstar_admin import _ledger_link_issues  # noqa: E402
from allstar_voting import ALLSTAR_SELECTION_LIMITS  # noqa: E402
from allstar_voting import ALLSTAR_SIDES  # noqa: E402
from allstar_voting import POLICY_ONCE_PER_EVENT  # noqa: E402
from allstar_voting import _public_candidate_set  # noqa: E402
from allstar_voting import _submission_fingerprint  # noqa: E402


DEFAULT_MAX_AGGREGATION_SECONDS = 120.0
DEFAULT_MAX_PEAK_MIB = 768.0


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
        "version": "perf-v1",
        "candidates": candidates,
        "contests": contests,
    }


def _selections(public_set: dict[str, Any], offset: int) -> dict[str, list[str]]:
    selections: dict[str, list[str]] = {}
    for contest_id, contest in public_set["contests"].items():
        candidate_ids = contest["candidateIds"]
        required = int(contest["maxSelections"])
        start = offset % (len(candidate_ids) - required + 1)
        selections[contest_id] = list(candidate_ids[start:start + required])
    return selections


def _peak_rss_mib() -> float:
    value = float(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
    # macOS reports bytes; Linux and the Functions runtime report KiB.
    divisor = 1024.0 * 1024.0 if sys.platform == "darwin" else 1024.0
    return value / divisor


def run_benchmark(
    ballot_count: int,
    *,
    max_aggregation_seconds: float = DEFAULT_MAX_AGGREGATION_SECONDS,
    max_peak_mib: float = DEFAULT_MAX_PEAK_MIB,
) -> dict[str, Any]:
    if isinstance(ballot_count, bool) or not 1 <= ballot_count <= MAX_RESULT_BALLOTS:
        raise ValueError(f"ballot_count must be between 1 and {MAX_RESULT_BALLOTS}")
    if max_aggregation_seconds <= 0 or max_peak_mib <= 0:
        raise ValueError("performance budgets must be positive")

    raw_candidate_set = _candidate_set()
    public_set = _public_candidate_set(raw_candidate_set, "allstar", "perf-v1")
    submitted_at = datetime(2026, 8, 1, 0, 0, tzinfo=timezone.utc)

    tracemalloc.start()
    total_started = time.perf_counter()
    ballots: list[tuple[str, dict[str, Any]]] = []
    eligibility: list[dict[str, Any]] = []
    try:
        build_started = time.perf_counter()
        for index in range(ballot_count):
            submission_id = f"perf-{index}"
            selections = _selections(public_set, index)
            ballot = {
                "schemaVersion": 2,
                "eventId": "perf-event",
                "division": "allstar",
                "candidateSetId": "perf-set-v1",
                "candidateVersion": "perf-v1",
                "candidateSetHash": public_set["contentHash"],
                "policy": POLICY_ONCE_PER_EVENT,
                "periodKey": "event",
                "localDate": "2026-08-01",
                "selections": selections,
                "submissionId": submission_id,
                "submissionFingerprint": _submission_fingerprint(
                    "perf-event",
                    "allstar",
                    "perf-v1",
                    submission_id,
                    selections,
                ),
                "voterKeyVersion": "provider-subject-hmac-sha256-v2",
                "submittedAt": submitted_at,
            }
            document_id = hashlib.sha256(f"ballot-{index}".encode("utf-8")).hexdigest()
            ballots.append((document_id, ballot))
            eligibility.append(
                {
                    "schemaVersion": 1,
                    "eventId": "perf-event",
                    "division": "allstar",
                    "lastPolicy": POLICY_ONCE_PER_EVENT,
                    "lastPeriodKey": "event",
                    "lastLocalDate": "2026-08-01",
                    "lastCandidateVersion": "perf-v1",
                    "lastSubmissionId": submission_id,
                    "lastSubmissionFingerprint": ballot["submissionFingerprint"],
                    "lastBallotId": document_id,
                    "voterKeyVersion": "provider-subject-hmac-sha256-v2",
                    "lastSubmittedAt": submitted_at,
                }
            )
        build_seconds = time.perf_counter() - build_started

        aggregation_started = time.perf_counter()
        result = build_result_snapshot(
            event_id="perf-event",
            division_id="allstar",
            candidate_set_id="perf-set-v1",
            candidate_version="perf-v1",
            public_candidate_set=public_set,
            ballots=ballots,
            generated_at=datetime.now(timezone.utc),
        )
        ledger_link_issues = _ledger_link_issues(
            event_id="perf-event",
            division_id="allstar",
            policy=POLICY_ONCE_PER_EVENT,
            ballots=ballots,
            eligibility=eligibility,
        )
        aggregation_seconds = time.perf_counter() - aggregation_started
        total_seconds = time.perf_counter() - total_started
        current_bytes, peak_bytes = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()

    expected_selections_per_ballot = sum(ALLSTAR_SELECTION_LIMITS.values()) * len(
        ALLSTAR_SIDES
    )
    count_sum = sum(int(value) for value in result["counts"].values())
    integrity_ok = (
        result["totalBallots"] == ballot_count
        and result["sourceBallotCount"] == ballot_count
        and result["sourcePolicy"] == POLICY_ONCE_PER_EVENT
        and count_sum == ballot_count * expected_selections_per_ballot
        and isinstance(result["sourceDigest"], str)
        and len(result["sourceDigest"]) == 64
        and isinstance(result["generationId"], str)
        and len(result["generationId"]) == 64
        and not ledger_link_issues
    )
    peak_mib = peak_bytes / (1024.0 * 1024.0)
    checks = {
        "integrity": integrity_ok,
        "aggregationWithinBudget": aggregation_seconds <= max_aggregation_seconds,
        "tracedPeakWithinBudget": peak_mib <= max_peak_mib,
    }
    return {
        "ballots": ballot_count,
        "candidateCount": len(public_set["candidates"]),
        "contestCount": len(public_set["contests"]),
        "selectedCandidateReferences": count_sum,
        "eligibilityDocuments": len(eligibility),
        "timingSeconds": {
            "fixtureBuild": round(build_seconds, 3),
            "validationAndAggregation": round(aggregation_seconds, 3),
            "total": round(total_seconds, 3),
        },
        "memoryMiB": {
            "tracedCurrent": round(current_bytes / (1024.0 * 1024.0), 2),
            "tracedPeak": round(peak_mib, 2),
            "processPeakRss": round(_peak_rss_mib(), 2),
        },
        "budgets": {
            "maxValidationAndAggregationSeconds": max_aggregation_seconds,
            "maxTracedPeakMiB": max_peak_mib,
        },
        "checks": checks,
        "passed": all(checks.values()),
        "scope": (
            "Pure Python in-memory validation/digest/count generation only; excludes "
            "Firestore reads, callable transport, Cloud Run cold starts, and deployment concurrency."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ballots", type=int, default=MAX_RESULT_BALLOTS)
    parser.add_argument(
        "--max-aggregation-seconds",
        type=float,
        default=DEFAULT_MAX_AGGREGATION_SECONDS,
    )
    parser.add_argument("--max-peak-mib", type=float, default=DEFAULT_MAX_PEAK_MIB)
    parser.add_argument("--output")
    args = parser.parse_args()

    try:
        report = run_benchmark(
            args.ballots,
            max_aggregation_seconds=args.max_aggregation_seconds,
            max_peak_mib=args.max_peak_mib,
        )
    except ValueError as error:
        parser.error(str(error))
    serialized = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True)
    if args.output:
        output = Path(args.output).expanduser().resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(f"{serialized}\n", encoding="utf-8")
        print(output)
    else:
        print(serialized)
    return 0 if report["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
