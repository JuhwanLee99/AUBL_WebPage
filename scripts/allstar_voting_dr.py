#!/usr/bin/env python3
"""Disaster-recovery tooling for AUBL All-Star Firestore voting data.

The tool never exports raw ballots to a local JSON file.  It creates a
redacted integrity manifest, can run a guarded managed export, and compares a
restored named database with the source manifest.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

try:
    from scripts import firestore_backup_dr
except ModuleNotFoundError:  # direct execution: python scripts/allstar_voting_dr.py
    import firestore_backup_dr  # type: ignore[no-redef]


ROOT = Path(__file__).resolve().parents[1]
FUNCTIONS_DIR = ROOT / "functions"
if str(FUNCTIONS_DIR) not in sys.path:
    sys.path.insert(0, str(FUNCTIONS_DIR))

from firebase_admin import firestore as admin_firestore  # noqa: E402
from firebase_admin import get_app, initialize_app  # noqa: E402
from firebase_functions import https_fn  # noqa: E402

from allstar_results import build_result_snapshot  # noqa: E402
from allstar_voting import BALLOTS_SUBCOLLECTION  # noqa: E402
from allstar_voting import CANDIDATE_SETS_SUBCOLLECTION  # noqa: E402
from allstar_voting import CONFIG_LOCK_SCHEMA_VERSION  # noqa: E402
from allstar_voting import CONFIG_LOCKS_SUBCOLLECTION  # noqa: E402
from allstar_voting import ELIGIBILITY_SUBCOLLECTION  # noqa: E402
from allstar_voting import EVENTS_COLLECTION  # noqa: E402
from allstar_voting import POLICY_ONCE_PER_DAY  # noqa: E402
from allstar_voting import POLICY_ONCE_PER_EVENT  # noqa: E402
from allstar_voting import PUBLIC_RESULTS_SUBCOLLECTION  # noqa: E402
from allstar_voting import RESULT_DRAFTS_SUBCOLLECTION  # noqa: E402
from allstar_voting import VOTER_KEY_VERSION  # noqa: E402
from allstar_voting import _candidate_set_identity  # noqa: E402
from allstar_voting import _event_division  # noqa: E402
from allstar_voting import _policy  # noqa: E402
from allstar_voting import _public_candidate_set  # noqa: E402
from allstar_voting import _public_result_summary  # noqa: E402
from allstar_voting import _timezone_name  # noqa: E402


EXPORT_COLLECTION_GROUPS = (
    EVENTS_COLLECTION,
    CANDIDATE_SETS_SUBCOLLECTION,
    CONFIG_LOCKS_SUBCOLLECTION,
    BALLOTS_SUBCOLLECTION,
    ELIGIBILITY_SUBCOLLECTION,
    RESULT_DRAFTS_SUBCOLLECTION,
    PUBLIC_RESULTS_SUBCOLLECTION,
)
MANIFEST_SCHEMA_VERSION = 1
_HASH_ID = re.compile(r"^[0-9a-f]{64}$")
_FORBIDDEN_FIELDS = {
    "uid",
    "email",
    "displayname",
    "ip",
    "ipaddress",
    "useragent",
    "providerdata",
}
_SUCCESSFUL_OPERATION_STATES = {"SUCCESSFUL"}
_FAILED_OPERATION_STATES = {"FAILED", "CANCELLED"}


class AuditError(RuntimeError):
    pass


def _fail(message: str) -> None:
    raise AuditError(message)


def _iso(value: object) -> str | None:
    if not isinstance(value, datetime):
        return None
    aware = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    return aware.astimezone(timezone.utc).isoformat()


def _assert_private_shape(document: Mapping[str, Any], kind: str) -> None:
    forbidden = {str(key).replace("_", "").lower() for key in document}.intersection(
        _FORBIDDEN_FIELDS
    )
    if forbidden:
        _fail(f"{kind} contains a forbidden identity/network field.")


def _firebase_app(project: str):
    name = f"allstar-dr-{project}"
    try:
        return get_app(name)
    except ValueError:
        return initialize_app(options={"projectId": project}, name=name)


def _load_document(reference: Any, label: str) -> Mapping[str, Any]:
    snapshot = reference.get()
    if not snapshot.exists:
        _fail(f"{label} was not found.")
    return snapshot.to_dict() or {}


def audit_database(
    *,
    project: str,
    database: str,
    event_id: str,
    division_id: str,
) -> dict[str, Any]:
    app = _firebase_app(project)
    db = admin_firestore.client(app=app, database_id=database)
    event_ref = db.collection(EVENTS_COLLECTION).document(event_id)
    event = _load_document(event_ref, "Voting event")
    division = _event_division(event, division_id)
    event_status = str(event.get("status", "DRAFT")).upper()
    division_status = str(division.get("status", "DRAFT")).upper()
    if event_status != "CLOSED" and division_status != "CLOSED":
        _fail("The source division has no explicit CLOSED barrier.")

    candidate_set_id, candidate_version = _candidate_set_identity(division)
    candidate_raw = _load_document(
        event_ref.collection(CANDIDATE_SETS_SUBCOLLECTION).document(candidate_set_id),
        "Active candidate set",
    )
    public_candidate_set = _public_candidate_set(
        candidate_raw,
        division_id,
        candidate_version,
    )

    all_ballot_snapshots = list(event_ref.collection(BALLOTS_SUBCOLLECTION).stream())
    ballots: list[tuple[str, Mapping[str, Any]]] = []
    ballot_by_id: dict[str, Mapping[str, Any]] = {}
    submitted_values: list[datetime] = []
    policy_counts: Counter[str] = Counter()
    date_counts: Counter[str] = Counter()
    for snapshot in all_ballot_snapshots:
        ballot = snapshot.to_dict() or {}
        _assert_private_shape(ballot, "Ballot")
        if not _HASH_ID.fullmatch(snapshot.id):
            _fail("A ballot document ID is not a 64-character HMAC digest.")
        stored_division = ballot.get("division")
        if not isinstance(stored_division, str):
            _fail("A ballot is missing its division identity.")
        if stored_division != division_id:
            continue
        submission_id = ballot.get("submissionId")
        if not isinstance(submission_id, str) or not submission_id:
            _fail("A target ballot is missing submissionId.")
        submitted_at = ballot.get("submittedAt")
        if isinstance(submitted_at, datetime):
            submitted_values.append(submitted_at)
        if isinstance(ballot.get("policy"), str):
            policy_counts[str(ballot["policy"])] += 1
        if isinstance(ballot.get("localDate"), str):
            date_counts[str(ballot["localDate"])] += 1
        ballots.append((snapshot.id, ballot))
        ballot_by_id[snapshot.id] = ballot

    generated_at = datetime.now(timezone.utc)
    result = build_result_snapshot(
        event_id=event_id,
        division_id=division_id,
        candidate_set_id=candidate_set_id,
        candidate_version=candidate_version,
        public_candidate_set=public_candidate_set,
        ballots=ballots,
        generated_at=generated_at,
    )

    config_lock_snapshot = (
        event_ref.collection(CONFIG_LOCKS_SUBCOLLECTION).document(division_id).get()
    )
    if ballots and not config_lock_snapshot.exists:
        _fail("Voting ballots exist without a division configuration lock.")
    config_lock_status: dict[str, Any] = {
        "exists": config_lock_snapshot.exists,
        "schemaVersion": None,
        "voterKeyVersion": None,
        "fingerprintDigest": None,
        "matchesActiveConfig": None,
    }
    if config_lock_snapshot.exists:
        config_lock = config_lock_snapshot.to_dict() or {}
        _assert_private_shape(config_lock, "Voting configuration lock")
        voter_key_fingerprint = config_lock.get("voterKeyFingerprint")
        expected_config = {
            "schemaVersion": CONFIG_LOCK_SCHEMA_VERSION,
            "eventId": event_id,
            "division": division_id,
            "candidateSetId": candidate_set_id,
            "candidateVersion": candidate_version,
            "candidateSetHash": public_candidate_set["contentHash"],
            "policy": _policy(event, division),
            "timezone": _timezone_name(event, division),
            "voterKeyVersion": VOTER_KEY_VERSION,
        }
        if any(config_lock.get(field) != value for field, value in expected_config.items()):
            _fail("Voting configuration lock does not match the active closed division.")
        if (
            not isinstance(voter_key_fingerprint, str)
            or not _HASH_ID.fullmatch(voter_key_fingerprint)
        ):
            _fail("Voting configuration lock has an invalid key fingerprint.")
        config_lock_status = {
            "exists": True,
            "schemaVersion": CONFIG_LOCK_SCHEMA_VERSION,
            "voterKeyVersion": VOTER_KEY_VERSION,
            # Compare restore fidelity without placing the stored key fingerprint
            # itself in the redacted manifest.
            "fingerprintDigest": hashlib.sha256(
                f"allstar-config-lock-manifest-v1\n{voter_key_fingerprint}".encode(
                    "utf-8"
                )
            ).hexdigest(),
            "matchesActiveConfig": True,
        }

    all_eligibility_snapshots = list(
        event_ref.collection(ELIGIBILITY_SUBCOLLECTION).stream()
    )
    target_eligibility: list[Mapping[str, Any]] = []
    latest_ledger_ballot_ids: list[str] = []
    for snapshot in all_eligibility_snapshots:
        ledger = snapshot.to_dict() or {}
        _assert_private_shape(ledger, "Eligibility ledger")
        if not _HASH_ID.fullmatch(snapshot.id):
            _fail("An eligibility document ID is not a 64-character HMAC digest.")
        stored_division = ledger.get("division")
        if not isinstance(stored_division, str):
            _fail("An eligibility ledger is missing its division identity.")
        if stored_division != division_id:
            continue
        if (
            ledger.get("schemaVersion") != 1
            or ledger.get("eventId") != event_id
            or ledger.get("lastCandidateVersion") != candidate_version
            or ledger.get("voterKeyVersion") != "provider-subject-hmac-sha256-v2"
        ):
            _fail("An eligibility ledger failed schema or candidate validation.")
        last_submission_id = ledger.get("lastSubmissionId")
        if not isinstance(last_submission_id, str) or not last_submission_id:
            _fail("An eligibility ledger is missing lastSubmissionId.")
        last_submission_fingerprint = ledger.get("lastSubmissionFingerprint")
        if (
            not isinstance(last_submission_fingerprint, str)
            or not _HASH_ID.fullmatch(last_submission_fingerprint)
        ):
            _fail("An eligibility ledger is missing a valid submission fingerprint.")
        last_ballot_id = ledger.get("lastBallotId")
        if not isinstance(last_ballot_id, str) or not _HASH_ID.fullmatch(last_ballot_id):
            _fail("An eligibility ledger is missing a valid ballot pointer.")
        linked_ballot = ballot_by_id.get(last_ballot_id)
        if linked_ballot is None:
            _fail("An eligibility ledger points to a missing target ballot.")
        if (
            linked_ballot.get("submissionId") != last_submission_id
            or linked_ballot.get("submissionFingerprint")
            != last_submission_fingerprint
            or linked_ballot.get("policy") != ledger.get("lastPolicy")
            or linked_ballot.get("periodKey") != ledger.get("lastPeriodKey")
            or linked_ballot.get("localDate") != ledger.get("lastLocalDate")
            or linked_ballot.get("candidateVersion")
            != ledger.get("lastCandidateVersion")
        ):
            _fail("An eligibility ledger does not match its linked ballot.")
        latest_ledger_ballot_ids.append(last_ballot_id)
        target_eligibility.append(ledger)

    configured_policy = _policy(event, division)
    if result.get("sourcePolicy") not in {None, configured_policy}:
        _fail("Ballot policy does not match the closed division configuration.")
    if configured_policy == POLICY_ONCE_PER_EVENT:
        if (
            len(latest_ledger_ballot_ids) != len(set(latest_ledger_ballot_ids))
            or set(latest_ledger_ballot_ids) != set(ballot_by_id)
        ):
            _fail("ONCE_PER_EVENT ballot and eligibility ledgers do not match.")
    elif configured_policy == POLICY_ONCE_PER_DAY:
        if ballots and not target_eligibility:
            _fail("ONCE_PER_DAY ballots exist without eligibility ledgers.")
        if len(target_eligibility) > len(ballots):
            _fail("ONCE_PER_DAY eligibility count exceeds ballot count.")
        if len(latest_ledger_ballot_ids) != len(set(latest_ledger_ballot_ids)):
            _fail("Duplicate ONCE_PER_DAY ballot pointers were found.")
        if not set(latest_ledger_ballot_ids).issubset(set(ballot_by_id)):
            _fail("An ONCE_PER_DAY ledger does not point to an existing ballot.")
    else:
        _fail("Voting policy is unsupported.")

    def result_status(collection: str) -> dict[str, Any]:
        snapshot = event_ref.collection(collection).document(division_id).get()
        if not snapshot.exists:
            return {
                "exists": False,
                "published": False,
                "generationId": None,
                "sourceDigest": None,
                "matchesSource": None,
            }
        raw = snapshot.to_dict() or {}
        try:
            _public_result_summary(
                {**raw, "published": True},
                public_candidate_set,
                candidate_version,
            )
        except https_fn.HttpsError as error:
            reason = (
                error.details.get("reason")
                if isinstance(error.details, Mapping)
                else "VALIDATION_ERROR"
            )
            _fail(f"{collection} failed public result validation: {reason}")
        return {
            "exists": True,
            "published": raw.get("published") is True,
            "generationId": raw.get("generationId"),
            "sourceDigest": raw.get("sourceDigest"),
            "matchesSource": (
                raw.get("sourceDigest") == result["sourceDigest"]
                and raw.get("totalBallots") == result["totalBallots"]
                and raw.get("counts") == result["counts"]
            ),
        }

    count_digest = result["generationId"]
    return {
        "schemaVersion": MANIFEST_SCHEMA_VERSION,
        "generatedAt": generated_at.isoformat(),
        "project": project,
        "database": database,
        "eventId": event_id,
        "division": division_id,
        "eventStatus": event_status,
        "divisionStatus": division_status,
        "eventEnabled": event.get("enabled") is True,
        "divisionEnabled": division.get("enabled") is True,
        "candidateSetPublished": division.get("published") is True,
        "resultsPublished": division.get("resultsPublished") is True,
        "candidateSetId": candidate_set_id,
        "candidateVersion": candidate_version,
        "candidateSetHash": public_candidate_set["contentHash"],
        "configLock": config_lock_status,
        "policy": configured_policy,
        "documentCounts": {
            "allEventBallots": len(all_ballot_snapshots),
            "targetBallots": len(ballots),
            "allEventEligibility": len(all_eligibility_snapshots),
            "targetEligibility": len(target_eligibility),
        },
        "sourceDigest": result["sourceDigest"],
        "generationId": count_digest,
        "firstSubmittedAt": _iso(min(submitted_values)) if submitted_values else None,
        "lastSubmittedAt": _iso(max(submitted_values)) if submitted_values else None,
        "policyCounts": dict(sorted(policy_counts.items())),
        "localDateCounts": dict(sorted(date_counts.items())),
        "draftResult": result_status(RESULT_DRAFTS_SUBCOLLECTION),
        "publicResult": result_status(PUBLIC_RESULTS_SUBCOLLECTION),
        "redacted": True,
    }


def _manifest_integrity_view(manifest: Mapping[str, Any]) -> dict[str, Any]:
    return {
        key: manifest.get(key)
        for key in (
            "eventId",
            "division",
            "eventStatus",
            "divisionStatus",
            "eventEnabled",
            "divisionEnabled",
            "candidateSetPublished",
            "resultsPublished",
            "candidateSetId",
            "candidateVersion",
            "candidateSetHash",
            "configLock",
            "policy",
            "documentCounts",
            "sourceDigest",
            "generationId",
            "firstSubmittedAt",
            "lastSubmittedAt",
            "policyCounts",
            "localDateCounts",
            "draftResult",
            "publicResult",
        )
    }


def compare_manifests(
    source: Mapping[str, Any],
    restored: Mapping[str, Any],
) -> dict[str, Any]:
    left = _manifest_integrity_view(source)
    right = _manifest_integrity_view(restored)
    differences = [
        key for key in left
        if left.get(key) != right.get(key)
    ]
    return {
        "matches": not differences,
        "differences": differences,
        "sourceProject": source.get("project"),
        "sourceDatabase": source.get("database"),
        "restoredProject": restored.get("project"),
        "restoredDatabase": restored.get("database"),
    }


def _write_json(payload: Mapping[str, Any], output: str | None) -> None:
    serialized = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)
    if output:
        path = Path(output).expanduser().resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"{serialized}\n", encoding="utf-8")
        print(path)
    else:
        print(serialized)


def _read_json(path: str) -> Mapping[str, Any]:
    payload = json.loads(Path(path).expanduser().read_text(encoding="utf-8"))
    if not isinstance(payload, Mapping):
        _fail("Manifest must contain a JSON object.")
    return payload


def _common_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--project", required=True)
    parser.add_argument("--database", required=True)
    parser.add_argument("--event", required=True)
    parser.add_argument("--division", required=True)


def _managed_export_command(args: argparse.Namespace) -> list[str]:
    if not args.bucket.startswith("gs://"):
        _fail("--bucket must be a gs:// URI.")
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    prefix = f"{args.bucket.rstrip('/')}/allstar-voting/{args.event}/{timestamp}"
    return [
        "gcloud",
        "firestore",
        "export",
        prefix,
        f"--project={args.project}",
        f"--database={args.database}",
        f"--collection-ids={','.join(EXPORT_COLLECTION_GROUPS)}",
        "--async",
        "--format=json",
    ]


def _daily_backup_schedule_command(args: argparse.Namespace) -> list[str]:
    try:
        return firestore_backup_dr.daily_backup_schedule_command(args)
    except firestore_backup_dr.BackupError as error:
        _fail(str(error))


def _backup_status_commands(args: argparse.Namespace) -> list[list[str]]:
    try:
        return firestore_backup_dr.backup_status_commands(args)
    except firestore_backup_dr.BackupError as error:
        _fail(str(error))


def _run_gcloud_json(command: list[str]) -> Any:
    if shutil.which("gcloud") is None:
        _fail("gcloud is not installed. Run the printed plan in Cloud Shell.")
    try:
        completed = subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as error:
        message = (error.stderr or error.stdout or "gcloud command failed").strip()
        _fail(message)
    try:
        return json.loads(completed.stdout or "[]")
    except json.JSONDecodeError as error:
        _fail(f"gcloud returned invalid JSON: {error}")


def _operation_mapping(payload: Mapping[str, Any], key: str) -> Mapping[str, Any]:
    value = payload.get(key)
    return value if isinstance(value, Mapping) else {}


def _operation_state(payload: Mapping[str, Any]) -> str | None:
    metadata = _operation_mapping(payload, "metadata")
    value = metadata.get("operationState", payload.get("operationState"))
    if not isinstance(value, str) or not value.strip():
        return None
    return value.strip().upper().rsplit("_", 1)[-1]


def _operation_output_uri(payload: Mapping[str, Any]) -> str | None:
    for container in (
        _operation_mapping(payload, "response"),
        _operation_mapping(payload, "metadata"),
        payload,
    ):
        for key in ("outputUriPrefix", "outputUri"):
            value = container.get(key)
            if isinstance(value, str) and value.startswith("gs://"):
                return value.rstrip("/")
    return None


def _operation_error(payload: Mapping[str, Any]) -> str | None:
    error = payload.get("error")
    if not isinstance(error, Mapping):
        return None
    code = error.get("code")
    message = error.get("message")
    details = " ".join(
        str(value) for value in (code, message) if value not in (None, "")
    )
    return details or "Firestore managed export operation failed."


def _managed_export_operation_command(
    *, project: str, database: str, operation_name: str
) -> list[str]:
    if not operation_name.startswith(f"projects/{project}/"):
        _fail("Managed export returned an operation outside the confirmed project.")
    return [
        "gcloud",
        "firestore",
        "operations",
        "describe",
        operation_name,
        f"--project={project}",
        f"--database={database}",
        "--format=json",
    ]


def _managed_export_summary(
    payload: Mapping[str, Any],
    *,
    expected_output_uri: str,
) -> dict[str, Any]:
    output_uri = _operation_output_uri(payload)
    expected = expected_output_uri.rstrip("/")
    if output_uri is None:
        _fail("Completed managed export did not report a GCS output URI.")
    if output_uri != expected:
        _fail("Managed export output URI does not match the requested destination.")

    metadata = _operation_mapping(payload, "metadata")
    safe_metadata = {
        key: metadata.get(key)
        for key in (
            "database",
            "startTime",
            "endTime",
            "snapshotTime",
            "collectionIds",
            "namespaceIds",
            "progressBytes",
            "progressDocuments",
            "outputUriPrefix",
        )
        if key in metadata
    }
    state = _operation_state(payload) or "SUCCESSFUL"
    return {
        "operationName": payload.get("name"),
        "done": True,
        "state": state,
        "outputUriPrefix": output_uri,
        "outputUriMatchesRequest": True,
        "metadata": safe_metadata,
    }


def _wait_for_managed_export(
    initial_payload: Any,
    *,
    project: str,
    database: str,
    expected_output_uri: str,
    timeout_seconds: float,
    poll_interval_seconds: float,
) -> dict[str, Any]:
    """Wait for a Firestore export LRO and return only verified safe metadata."""
    if timeout_seconds <= 0:
        _fail("--operation-timeout-seconds must be positive.")
    if poll_interval_seconds <= 0:
        _fail("--operation-poll-interval-seconds must be positive.")
    if not isinstance(initial_payload, Mapping):
        _fail("Managed export did not return a JSON operation object.")

    operation: Mapping[str, Any] = initial_payload
    deadline = time.monotonic() + timeout_seconds
    while True:
        error = _operation_error(operation)
        if error:
            _fail(f"Managed export operation failed: {error}")

        state = _operation_state(operation)
        done = operation.get("done") is True
        if state in _FAILED_OPERATION_STATES:
            _fail(f"Managed export operation ended in {state} state.")
        if done or state in _SUCCESSFUL_OPERATION_STATES:
            if state is not None and state not in _SUCCESSFUL_OPERATION_STATES:
                _fail(
                    "Managed export operation reported done before a successful state."
                )
            return _managed_export_summary(
                operation,
                expected_output_uri=expected_output_uri,
            )

        operation_name = operation.get("name")
        if not isinstance(operation_name, str) or not operation_name:
            _fail("Pending managed export did not return an operation name.")
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            _fail("Managed export operation did not finish before the timeout.")
        time.sleep(min(poll_interval_seconds, remaining))
        operation = _run_gcloud_json(
            _managed_export_operation_command(
                project=project,
                database=database,
                operation_name=operation_name,
            )
        )
        if not isinstance(operation, Mapping):
            _fail("Managed export operation status was not a JSON object.")


def _backup_status(args: argparse.Namespace) -> dict[str, Any]:
    try:
        return firestore_backup_dr.backup_status(args, runner=_run_gcloud_json)
    except firestore_backup_dr.BackupError as error:
        _fail(str(error))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    audit_parser = subparsers.add_parser("audit", help="Create a redacted source manifest")
    _common_arguments(audit_parser)
    audit_parser.add_argument("--output")

    compare_parser = subparsers.add_parser("compare", help="Compare two redacted manifests")
    compare_parser.add_argument("--source", required=True)
    compare_parser.add_argument("--restored", required=True)

    restore_parser = subparsers.add_parser(
        "verify-restored",
        help="Audit a restored named database and compare it with a source manifest",
    )
    _common_arguments(restore_parser)
    restore_parser.add_argument("--source-manifest", required=True)
    restore_parser.add_argument("--output")

    export_parser = subparsers.add_parser(
        "export",
        help="Plan or execute a guarded managed export after CLOSED verification",
    )
    _common_arguments(export_parser)
    export_parser.add_argument("--bucket", required=True)
    export_parser.add_argument("--manifest", required=True)
    export_parser.add_argument("--execute", action="store_true")
    export_parser.add_argument("--confirm-project")
    export_parser.add_argument("--operation-timeout-seconds", type=float, default=1800.0)
    export_parser.add_argument("--operation-poll-interval-seconds", type=float, default=5.0)

    backup_plan_parser = subparsers.add_parser(
        "backup-plan",
        help="Print a PITR-free daily backup setup and verification plan",
    )
    backup_plan_parser.add_argument("--project", required=True)
    backup_plan_parser.add_argument("--database", required=True)
    backup_plan_parser.add_argument("--location", default="asia-northeast3")
    backup_plan_parser.add_argument("--retention", default="14d")

    backup_status_parser = subparsers.add_parser(
        "backup-status",
        help="Read scheduled backup metadata without reading voting documents",
    )
    backup_status_parser.add_argument("--project", required=True)
    backup_status_parser.add_argument("--database", required=True)
    backup_status_parser.add_argument("--location", default="asia-northeast3")
    backup_status_parser.add_argument("--max-ready-age-hours", type=float, default=48.0)
    backup_status_parser.add_argument("--output")

    backup_schedule_parser = subparsers.add_parser(
        "create-daily-backup",
        help="Plan or explicitly create one Firestore daily backup schedule",
    )
    backup_schedule_parser.add_argument("--project", required=True)
    backup_schedule_parser.add_argument("--database", required=True)
    backup_schedule_parser.add_argument("--location", default="asia-northeast3")
    backup_schedule_parser.add_argument("--retention", default="14d")
    backup_schedule_parser.add_argument("--execute", action="store_true")
    backup_schedule_parser.add_argument("--confirm-project")

    args = parser.parse_args()
    try:
        if args.command == "audit":
            _write_json(
                audit_database(
                    project=args.project,
                    database=args.database,
                    event_id=args.event,
                    division_id=args.division,
                ),
                args.output,
            )
            return 0

        if args.command == "compare":
            result = compare_manifests(
                _read_json(args.source),
                _read_json(args.restored),
            )
            _write_json(result, None)
            return 0 if result["matches"] else 2

        if args.command == "verify-restored":
            source = _read_json(args.source_manifest)
            if args.database == "(default)" or args.database == source.get("database"):
                _fail("Restore verification must target a different named database.")
            restored = audit_database(
                project=args.project,
                database=args.database,
                event_id=args.event,
                division_id=args.division,
            )
            report = {
                "restoredManifest": restored,
                "comparison": compare_manifests(source, restored),
            }
            _write_json(report, args.output)
            return 0 if report["comparison"]["matches"] else 2

        if args.command == "export":
            command = _managed_export_command(args)
            manifest = audit_database(
                project=args.project,
                database=args.database,
                event_id=args.event,
                division_id=args.division,
            )
            if not args.execute:
                _write_json(
                    {
                        "dryRun": True,
                        "command": command,
                        "manifestPreview": manifest,
                    },
                    None,
                )
                return 0
            if args.confirm_project != args.project:
                _fail("--confirm-project must exactly match --project for execution.")
            operation = _wait_for_managed_export(
                _run_gcloud_json(command),
                project=args.project,
                database=args.database,
                expected_output_uri=command[3],
                timeout_seconds=args.operation_timeout_seconds,
                poll_interval_seconds=args.operation_poll_interval_seconds,
            )
            post_manifest = audit_database(
                project=args.project,
                database=args.database,
                event_id=args.event,
                division_id=args.division,
            )
            comparison = compare_manifests(manifest, post_manifest)
            if not comparison["matches"]:
                _fail("Source changed while managed export was running.")
            manifest = {
                **manifest,
                "managedExport": {
                    "command": command,
                    "completedAt": datetime.now(timezone.utc).isoformat(),
                    "operation": operation,
                    "successful": True,
                    "outputUriPrefix": operation["outputUriPrefix"],
                    "sourceStable": True,
                },
            }
            _write_json(manifest, args.manifest)
            return 0

        if args.command == "backup-plan":
            _write_json(
                {
                    "dryRun": True,
                    "project": args.project,
                    "database": args.database,
                    "location": args.location,
                    "pitrChanged": False,
                    "statusCommands": _backup_status_commands(args),
                    "createDailyScheduleCommand": _daily_backup_schedule_command(args),
                    "nextStep": (
                        "Run backup-status first. Create a schedule only when no daily "
                        "schedule exists, then wait for the first READY backup."
                    ),
                },
                None,
            )
            return 0

        if args.command == "backup-status":
            status = _backup_status(args)
            _write_json(status, args.output)
            return 0 if status["ready"] else 2

        if args.command == "create-daily-backup":
            command = _daily_backup_schedule_command(args)
            if not args.execute:
                _write_json(
                    {
                        "dryRun": True,
                        "project": args.project,
                        "database": args.database,
                        "location": args.location,
                        "pitrChanged": False,
                        "command": command,
                    },
                    None,
                )
                return 0
            if args.confirm_project != args.project:
                _fail("--confirm-project must exactly match --project for execution.")
            status_before = _backup_status(args)
            if status_before["dailySchedulePresent"]:
                _fail("A daily backup schedule already exists; inspect or update it instead.")
            created = _run_gcloud_json(command)
            status_after = _backup_status(args)
            if not status_after["dailySchedulePresent"]:
                _fail("The create command returned, but no daily backup schedule is visible.")
            _write_json(
                {
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                    "project": args.project,
                    "database": args.database,
                    "location": args.location,
                    "pitrChanged": False,
                    "createdSchedule": created,
                    "status": status_after,
                    "ready": False,
                    "nextStep": "Wait for and verify the first READY scheduled backup.",
                },
                None,
            )
            return 0
    except AuditError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
