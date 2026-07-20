from __future__ import annotations

import unittest
from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from scripts.allstar_voting_dr import AuditError
from scripts.allstar_voting_dr import EXPORT_COLLECTION_GROUPS
from scripts.allstar_voting_dr import _assert_private_shape
from scripts.allstar_voting_dr import _backup_status
from scripts.allstar_voting_dr import _backup_status_commands
from scripts.allstar_voting_dr import _daily_backup_schedule_command
from scripts.allstar_voting_dr import _managed_export_command
from scripts.allstar_voting_dr import _wait_for_managed_export
from scripts.allstar_voting_dr import compare_manifests


def _manifest() -> dict[str, object]:
    return {
        "project": "source-project",
        "database": "(default)",
        "eventId": "event",
        "division": "allstar",
        "eventStatus": "CLOSED",
        "divisionStatus": "CLOSED",
        "eventEnabled": False,
        "divisionEnabled": False,
        "candidateSetPublished": True,
        "resultsPublished": True,
        "candidateSetId": "set-v1",
        "candidateVersion": "v1",
        "candidateSetHash": "a" * 64,
        "configLock": {
            "exists": True,
            "schemaVersion": 1,
            "voterKeyVersion": "provider-subject-hmac-sha256-v2",
            "fingerprintDigest": "d" * 64,
            "matchesActiveConfig": True,
        },
        "policy": "ONCE_PER_EVENT",
        "documentCounts": {
            "allEventBallots": 10,
            "targetBallots": 10,
            "allEventEligibility": 10,
            "targetEligibility": 10,
        },
        "sourceDigest": "b" * 64,
        "generationId": "c" * 64,
        "firstSubmittedAt": "2026-07-20T01:00:00+00:00",
        "lastSubmittedAt": "2026-07-20T02:00:00+00:00",
        "policyCounts": {"ONCE_PER_EVENT": 10},
        "localDateCounts": {"2026-07-20": 10},
        "draftResult": {"exists": True, "matchesSource": True},
        "publicResult": {"exists": True, "matchesSource": True},
    }


class DisasterRecoveryToolTests(unittest.TestCase):
    def test_manifest_compare_ignores_project_and_database_but_checks_ledger(self) -> None:
        source = _manifest()
        restored = {**source, "project": "restore-project", "database": "drill-db"}
        result = compare_manifests(source, restored)
        self.assertTrue(result["matches"])

        changed = deepcopy(restored)
        changed["documentCounts"]["targetBallots"] = 9  # type: ignore[index]
        result = compare_manifests(source, changed)
        self.assertFalse(result["matches"])
        self.assertIn("documentCounts", result["differences"])

    def test_manifest_compare_detects_operational_gate_drift(self) -> None:
        source = _manifest()
        for field, changed_value in (
            ("eventStatus", "OPEN"),
            ("divisionStatus", "OPEN"),
            ("eventEnabled", True),
            ("divisionEnabled", True),
            ("candidateSetPublished", False),
            ("resultsPublished", False),
        ):
            with self.subTest(field=field):
                restored = deepcopy(source)
                restored[field] = changed_value
                result = compare_manifests(source, restored)
                self.assertFalse(result["matches"])
                self.assertIn(field, result["differences"])

    def test_manifest_compare_detects_config_lock_drift(self) -> None:
        source = _manifest()
        restored = deepcopy(source)
        restored["configLock"]["fingerprintDigest"] = "e" * 64  # type: ignore[index]
        result = compare_manifests(source, restored)
        self.assertFalse(result["matches"])
        self.assertIn("configLock", result["differences"])

    def test_export_command_includes_every_required_collection_group(self) -> None:
        command = _managed_export_command(
            SimpleNamespace(
                project="aubl-project",
                database="(default)",
                event="event",
                bucket="gs://aubl-vote-backups",
            )
        )
        collection_arg = next(item for item in command if item.startswith("--collection-ids="))
        for collection in EXPORT_COLLECTION_GROUPS:
            self.assertIn(collection, collection_arg)
        self.assertIn("--project=aubl-project", command)
        self.assertIn("--database=(default)", command)
        self.assertIn("--async", command)

    def test_export_command_rejects_non_gcs_destination(self) -> None:
        with self.assertRaises(AuditError):
            _managed_export_command(
                SimpleNamespace(
                    project="aubl-project",
                    database="(default)",
                    event="event",
                    bucket="/tmp/not-a-backup",
                )
            )

    @patch("scripts.allstar_voting_dr.time.sleep")
    @patch("scripts.allstar_voting_dr._run_gcloud_json")
    def test_managed_export_polls_until_success_and_records_gcs_metadata(
        self, run_json, sleep
    ) -> None:
        operation_name = (
            "projects/aubl-project/databases/(default)/operations/export-123"
        )
        run_json.return_value = {
            "name": operation_name,
            "done": True,
            "metadata": {
                "operationState": "SUCCESSFUL",
                "startTime": "2026-07-21T01:00:00Z",
                "endTime": "2026-07-21T01:01:00Z",
                "progressDocuments": {
                    "workCompleted": "10",
                    "workEstimated": "10",
                },
                "collectionIds": ["allstarVotingEvents"],
            },
            "response": {
                "outputUriPrefix": "gs://aubl-vote-backups/export-123"
            },
        }

        summary = _wait_for_managed_export(
            {
                "name": operation_name,
                "metadata": {"operationState": "PROCESSING"},
            },
            project="aubl-project",
            database="(default)",
            expected_output_uri="gs://aubl-vote-backups/export-123",
            timeout_seconds=30,
            poll_interval_seconds=0.01,
        )

        self.assertTrue(summary["done"])
        self.assertEqual(summary["state"], "SUCCESSFUL")
        self.assertEqual(
            summary["outputUriPrefix"], "gs://aubl-vote-backups/export-123"
        )
        self.assertTrue(summary["outputUriMatchesRequest"])
        self.assertEqual(
            summary["metadata"]["progressDocuments"]["workCompleted"], "10"
        )
        sleep.assert_called_once()
        describe_command = run_json.call_args.args[0]
        self.assertIn("operations", describe_command)
        self.assertIn("describe", describe_command)
        self.assertIn(operation_name, describe_command)
        self.assertIn("--project=aubl-project", describe_command)
        self.assertIn("--database=(default)", describe_command)

    def test_managed_export_accepts_official_success_metadata_shape(self) -> None:
        summary = _wait_for_managed_export(
            {
                "name": "projects/aubl-project/databases/(default)/operations/export-123",
                "metadata": {
                    "operationState": "SUCCESSFUL",
                    "outputUriPrefix": "gs://aubl-vote-backups/export-123",
                    "snapshotTime": "2026-07-21T01:00:00Z",
                },
            },
            project="aubl-project",
            database="(default)",
            expected_output_uri="gs://aubl-vote-backups/export-123/",
            timeout_seconds=30,
            poll_interval_seconds=1,
        )
        self.assertEqual(summary["state"], "SUCCESSFUL")
        self.assertEqual(
            summary["metadata"]["snapshotTime"], "2026-07-21T01:00:00Z"
        )

    def test_managed_export_fails_closed_on_operation_error(self) -> None:
        with self.assertRaisesRegex(AuditError, "quota exceeded"):
            _wait_for_managed_export(
                {
                    "name": "projects/aubl-project/databases/(default)/operations/export-123",
                    "done": True,
                    "error": {"code": 8, "message": "quota exceeded"},
                },
                project="aubl-project",
                database="(default)",
                expected_output_uri="gs://aubl-vote-backups/export-123",
                timeout_seconds=30,
                poll_interval_seconds=1,
            )

    def test_managed_export_rejects_missing_or_wrong_output_uri(self) -> None:
        operation = {
            "name": "projects/aubl-project/databases/(default)/operations/export-123",
            "done": True,
            "metadata": {"operationState": "SUCCESSFUL"},
            "response": {"outputUriPrefix": "gs://unexpected/export"},
        }
        with self.assertRaisesRegex(AuditError, "does not match"):
            _wait_for_managed_export(
                operation,
                project="aubl-project",
                database="(default)",
                expected_output_uri="gs://aubl-vote-backups/export-123",
                timeout_seconds=30,
                poll_interval_seconds=1,
            )

    @patch("scripts.allstar_voting_dr.time.monotonic", side_effect=[0.0, 31.0])
    def test_managed_export_timeout_fails_closed(self, _monotonic) -> None:
        with self.assertRaisesRegex(AuditError, "before the timeout"):
            _wait_for_managed_export(
                {
                    "name": "projects/aubl-project/databases/(default)/operations/export-123",
                    "metadata": {"operationState": "PROCESSING"},
                },
                project="aubl-project",
                database="(default)",
                expected_output_uri="gs://aubl-vote-backups/export-123",
                timeout_seconds=30,
                poll_interval_seconds=1,
            )

    def test_manifest_validator_rejects_identity_fields(self) -> None:
        with self.assertRaises(AuditError):
            _assert_private_shape({"schemaVersion": 2, "email": "hidden@example.com"}, "Ballot")

    def test_daily_backup_command_is_pitr_free_and_guarded(self) -> None:
        command = _daily_backup_schedule_command(
            SimpleNamespace(project="aubl-project", database="(default)", retention="14d")
        )
        self.assertIn("--recurrence=daily", command)
        self.assertIn("--retention=14d", command)
        self.assertFalse(any("pitr" in item.lower() for item in command))

        with self.assertRaises(AuditError):
            _daily_backup_schedule_command(
                SimpleNamespace(project="aubl-project", database="(default)", retention="15w")
            )

    def test_backup_list_uses_location_not_unsupported_database_flag(self) -> None:
        _, backup_command = _backup_status_commands(
            SimpleNamespace(
                project="aubl-project",
                database="(default)",
                location="asia-northeast3",
            )
        )
        self.assertIn("--location=asia-northeast3", backup_command)
        self.assertNotIn("--database=(default)", backup_command)

    @patch("scripts.allstar_voting_dr._run_gcloud_json")
    def test_backup_status_requires_schedule_and_recent_ready_backup(self, run_json) -> None:
        snapshot_time = datetime.now(timezone.utc).isoformat()
        database = "projects/aubl-project/databases/(default)"
        run_json.side_effect = [
            [
                {
                    "name": f"{database}/backupSchedules/daily",
                    "dailyRecurrence": {},
                    "retention": "1209600s",
                }
            ],
            [
                {
                    "name": "projects/aubl-project/locations/asia-northeast3/backups/ready",
                    "database": database,
                    "state": "READY",
                    "snapshotTime": snapshot_time,
                }
            ],
        ]
        status = _backup_status(
            SimpleNamespace(
                project="aubl-project",
                database="(default)",
                max_ready_age_hours=48,
            )
        )
        self.assertTrue(status["dailySchedulePresent"])
        self.assertEqual(status["readyBackupCount"], 1)
        self.assertFalse(status["latestReadyStale"])
        self.assertTrue(status["ready"])

    def test_backup_status_rejects_non_positive_freshness_window(self) -> None:
        with self.assertRaises(AuditError):
            _backup_status(
                SimpleNamespace(
                    project="aubl-project",
                    database="(default)",
                    max_ready_age_hours=0,
                )
            )


if __name__ == "__main__":
    unittest.main()
