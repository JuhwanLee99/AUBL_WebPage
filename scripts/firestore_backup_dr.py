#!/usr/bin/env python3
"""PITR-free Firestore scheduled-backup planning and health checks.

This utility is intentionally independent of application collections. It is
safe by default: status commands are read-only, schedule creation is a dry run
unless both --execute and an exact --confirm-project value are supplied, and
it never enables or disables PITR.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping


_RETENTION = re.compile(r"^[1-9][0-9]*(?:d|w)$")


class BackupError(RuntimeError):
    pass


def _fail(message: str) -> None:
    raise BackupError(message)


def write_json(payload: Mapping[str, Any], output: str | None) -> None:
    serialized = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)
    if output:
        path = Path(output).expanduser().resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"{serialized}\n", encoding="utf-8")
        print(path)
    else:
        print(serialized)


def daily_backup_schedule_command(args: argparse.Namespace) -> list[str]:
    match = _RETENTION.fullmatch(args.retention)
    if not match:
        _fail("--retention must use a positive day/week duration such as 14d or 8w.")
    value = int(args.retention[:-1])
    unit = args.retention[-1]
    if (unit == "d" and value > 98) or (unit == "w" and value > 14):
        _fail("Firestore scheduled backup retention cannot exceed 14 weeks (98 days).")
    return [
        "gcloud",
        "firestore",
        "backups",
        "schedules",
        "create",
        f"--project={args.project}",
        f"--database={args.database}",
        "--recurrence=daily",
        f"--retention={args.retention}",
        "--format=json",
    ]


def backup_status_commands(args: argparse.Namespace) -> list[list[str]]:
    location = str(getattr(args, "location", "asia-northeast3"))
    if not re.fullmatch(r"[a-z0-9-]+", location):
        _fail("--location must be a valid Google Cloud location ID.")
    return [
        [
            "gcloud",
            "firestore",
            "backups",
            "schedules",
            "list",
            f"--project={args.project}",
            f"--database={args.database}",
            "--format=json",
        ],
        [
            "gcloud",
            "firestore",
            "backups",
            "list",
            f"--project={args.project}",
            f"--location={location}",
            "--format=json",
        ],
    ]


def run_gcloud_json(command: list[str]) -> Any:
    if shutil.which("gcloud") is None:
        _fail("gcloud is not installed. Run the printed plan in Cloud Shell.")
    try:
        completed = subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as error:
        message = (error.stderr or error.stdout or "gcloud command failed").strip()
        _fail(message)
    try:
        return json.loads(completed.stdout or "[]")
    except json.JSONDecodeError as error:
        _fail(f"gcloud returned invalid JSON: {error}")


def _database_resource(project: str, database: str) -> str:
    return f"projects/{project}/databases/{database}"


def backup_status(
    args: argparse.Namespace,
    runner: Callable[[list[str]], Any] = run_gcloud_json,
) -> dict[str, Any]:
    max_ready_age_hours = float(getattr(args, "max_ready_age_hours", 48.0))
    if max_ready_age_hours <= 0:
        _fail("--max-ready-age-hours must be positive.")
    schedule_command, backup_command = backup_status_commands(args)
    schedules_payload = runner(schedule_command)
    backups_payload = runner(backup_command)
    if not isinstance(schedules_payload, list) or not isinstance(backups_payload, list):
        _fail("gcloud backup status output must be a JSON list.")

    database_resource = _database_resource(args.project, args.database)
    schedules = [
        item
        for item in schedules_payload
        if isinstance(item, Mapping)
        and (
            item.get("database") == database_resource
            or database_resource in str(item.get("name", ""))
        )
    ]
    backups = [
        item
        for item in backups_payload
        if isinstance(item, Mapping) and item.get("database") == database_resource
    ]
    ready_backups = [item for item in backups if item.get("state") == "READY"]
    ready_backups.sort(key=lambda item: str(item.get("snapshotTime", "")), reverse=True)
    latest_ready = ready_backups[0] if ready_backups else None
    latest_ready_age_hours: float | None = None
    latest_ready_stale = True
    if latest_ready and isinstance(latest_ready.get("snapshotTime"), str):
        try:
            snapshot_time = datetime.fromisoformat(
                str(latest_ready["snapshotTime"]).replace("Z", "+00:00")
            )
            if snapshot_time.tzinfo is None:
                snapshot_time = snapshot_time.replace(tzinfo=timezone.utc)
            latest_ready_age_hours = round(
                (
                    datetime.now(timezone.utc)
                    - snapshot_time.astimezone(timezone.utc)
                ).total_seconds()
                / 3600,
                2,
            )
            latest_ready_stale = latest_ready_age_hours > max_ready_age_hours
        except ValueError:
            latest_ready_stale = True
    daily_schedules = [item for item in schedules if "dailyRecurrence" in item]
    unhealthy_backups = [
        {
            "name": item.get("name"),
            "state": item.get("state"),
            "snapshotTime": item.get("snapshotTime"),
        }
        for item in backups
        if item.get("state") not in {"READY", "CREATING"}
    ]
    return {
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "project": args.project,
        "database": args.database,
        "location": str(getattr(args, "location", "asia-northeast3")),
        "pitrChanged": False,
        "dailySchedulePresent": bool(daily_schedules),
        "dailySchedules": daily_schedules,
        "backupCount": len(backups),
        "readyBackupCount": len(ready_backups),
        "latestReadyBackup": latest_ready,
        "latestReadyAgeHours": latest_ready_age_hours,
        "latestReadyStale": latest_ready_stale,
        "unhealthyBackups": unhealthy_backups,
        "ready": (
            bool(daily_schedules)
            and latest_ready is not None
            and not latest_ready_stale
            and not unhealthy_backups
        ),
    }


def _add_common_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--project", required=True)
    parser.add_argument("--database", required=True)
    parser.add_argument("--location", default="asia-northeast3")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    plan_parser = subparsers.add_parser("backup-plan")
    _add_common_arguments(plan_parser)
    plan_parser.add_argument("--retention", default="14d")

    status_parser = subparsers.add_parser("backup-status")
    _add_common_arguments(status_parser)
    status_parser.add_argument("--max-ready-age-hours", type=float, default=48.0)
    status_parser.add_argument("--output")

    create_parser = subparsers.add_parser("create-daily-backup")
    _add_common_arguments(create_parser)
    create_parser.add_argument("--retention", default="14d")
    create_parser.add_argument("--execute", action="store_true")
    create_parser.add_argument("--confirm-project")

    args = parser.parse_args()
    try:
        if args.command == "backup-plan":
            write_json(
                {
                    "dryRun": True,
                    "project": args.project,
                    "database": args.database,
                    "location": args.location,
                    "pitrChanged": False,
                    "statusCommands": backup_status_commands(args),
                    "createDailyScheduleCommand": daily_backup_schedule_command(args),
                    "nextStep": "Run backup-status first; create only when no daily schedule exists.",
                },
                None,
            )
            return 0
        if args.command == "backup-status":
            status = backup_status(args)
            write_json(status, args.output)
            return 0 if status["ready"] else 2

        command = daily_backup_schedule_command(args)
        if not args.execute:
            write_json(
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
        status_before = backup_status(args)
        if status_before["dailySchedulePresent"]:
            _fail("A daily backup schedule already exists; inspect or update it instead.")
        created = run_gcloud_json(command)
        status_after = backup_status(args)
        if not status_after["dailySchedulePresent"]:
            _fail("The create command returned, but no daily backup schedule is visible.")
        write_json(
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
    except BackupError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
