from __future__ import annotations

import argparse
import unittest
from datetime import datetime, timedelta, timezone

from scripts.firestore_backup_dr import BackupError
from scripts.firestore_backup_dr import backup_status
from scripts.firestore_backup_dr import daily_backup_schedule_command


class FirestoreBackupDrTests(unittest.TestCase):
    def _args(self, **overrides):
        values = {
            "project": "example-project",
            "database": "(default)",
            "location": "asia-northeast3",
            "retention": "14d",
            "max_ready_age_hours": 48.0,
        }
        values.update(overrides)
        return argparse.Namespace(**values)

    def test_schedule_command_is_daily_and_does_not_change_pitr(self) -> None:
        command = daily_backup_schedule_command(self._args())
        self.assertIn("--recurrence=daily", command)
        self.assertIn("--retention=14d", command)
        self.assertFalse(any("pitr" in item.lower() for item in command))

    def test_schedule_rejects_retention_over_firestore_limit(self) -> None:
        with self.assertRaises(BackupError):
            daily_backup_schedule_command(self._args(retention="99d"))

    def test_status_is_ready_only_with_recent_ready_backup_and_schedule(self) -> None:
        database = "projects/example-project/databases/(default)"
        snapshot_time = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        payloads = iter(
            [
                [{"name": f"{database}/backupSchedules/daily", "database": database, "dailyRecurrence": {}}],
                [{"name": "backup-1", "database": database, "state": "READY", "snapshotTime": snapshot_time}],
            ]
        )

        status = backup_status(self._args(), runner=lambda _command: next(payloads))

        self.assertTrue(status["ready"])
        self.assertFalse(status["pitrChanged"])
        self.assertLess(status["latestReadyAgeHours"], 48)

    def test_status_fails_closed_for_stale_backup(self) -> None:
        database = "projects/example-project/databases/(default)"
        snapshot_time = (datetime.now(timezone.utc) - timedelta(hours=72)).isoformat()
        payloads = iter(
            [
                [{"name": f"{database}/backupSchedules/daily", "database": database, "dailyRecurrence": {}}],
                [{"name": "backup-1", "database": database, "state": "READY", "snapshotTime": snapshot_time}],
            ]
        )

        status = backup_status(self._args(), runner=lambda _command: next(payloads))

        self.assertFalse(status["ready"])
        self.assertTrue(status["latestReadyStale"])


if __name__ == "__main__":
    unittest.main()
