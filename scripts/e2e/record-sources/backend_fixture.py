"""Emulator-only fixture driver for the actual publication transaction."""
import argparse
import copy
import io
import json
import os
from pathlib import Path
import re
import sys
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "functions"))
from google.auth.credentials import AnonymousCredentials
from google.cloud import firestore
from record_sources import promote_record_source

BASE = json.loads(Path(__file__).with_name("fixture.json").read_text())


def connect():
    host = os.environ.get("FIRESTORE_EMULATOR_HOST", "")
    project = os.environ.get("GCLOUD_PROJECT") or os.environ.get("GOOGLE_CLOUD_PROJECT")
    if not re.fullmatch(r"(127\.0\.0\.1|localhost):\d+", host) or project != "demo-aubl-scoring":
        raise RuntimeError("Refusing a missing emulator or a production project")
    return firestore.Client(project=project, credentials=AnonymousCredentials())


def fixture(match_id):
    if not match_id.startswith("LOCAL_TEST_SOURCE_") or not re.fullmatch(r"[A-Za-z0-9_-]+", match_id):
        raise ValueError("Explicit local test ID required")
    official = copy.deepcopy(BASE)
    official["sourceGameId"] = official["detail"]["sourceGameId"] = "up-" + match_id
    core = {"activeMatchId": match_id, "gameStarted": True, "gameOver": True, "updatedAt": 0,
            "score": {"home": 1, "away": 4}, "lineScore": {"home": [0, 1], "away": [2, 2]},
            "teamNames": {"home": "LOCAL HOME", "away": "LOCAL AWAY"}, "lastPlay": "PRIVATE_TEST_FEED",
            "scorerUid": "LOCAL_SOURCE_SCORER", "scorerPaused": True, "feed": [], "events": []}
    schedule = {"id": match_id, "sourceProvider": "UNIQUE_PLAY", "sourceGameId": official["sourceGameId"],
                "seasonId": 99, "sourceActive": True, "syncRevision": official["syncRevision"],
                "status": "completed", "recordMode": "official", "scoreInputMode": "live", "startTime": official["game"]["playedAt"],
                "venue": "LOCAL TEST ONLY", "homeTeamName": "LOCAL HOME", "awayTeamName": "LOCAL AWAY", "homeScore": 1, "awayScore": 4,
                "notes": "PRIVATE_TEST_NOTE", "lineups": {"home": [], "away": []}, "benches": {"home": [], "away": []},
                "manualEntryDraft": {"note": "PRIVATE_TEST_DRAFT"},
                "postGame": {"totals": {"away": {"runs": 4, "hits": 3, "errors": 1}, "home": {"runs": 1, "hits": 1, "errors": 0}},
                             "lineScore": core["lineScore"], "batters": {"away": [{"name": "Alice(7)", "ab": 4, "h": 2, "r": 1, "rbi": 1, "sb": 0}], "home": []},
                             "pitchers": {"away": [{"name": "Ann(12)", "ip": "2", "h": 1, "r": 1, "er": 0, "bb": 0, "hbp": 0, "so": 2}], "home": []}}}
    return official, schedule, core


def seed(db, match_id):
    official, schedule, core = fixture(match_id)
    batch = db.batch()
    batch.set(db.document("matches", match_id), schedule)
    batch.set(db.document("matchStates", match_id), core)
    batch.set(db.document("matchStates", match_id, "feed", "f1"), {"eventId": "LOCAL_PRIVATE_EVENT", "summary": "PRIVATE_TEST_FEED", "order": 1})
    batch.set(db.document("matchStates", match_id, "events", "e1"), {"eventId": "LOCAL_PRIVATE_EVENT", "notes": "PRIVATE_TEST_EVENT", "order": 1})
    batch.commit()
    return official, schedule, core


def promote(db, match_id, official=None, revision=None):
    official = copy.deepcopy(official if official is not None else fixture(match_id)[0])
    source_id = official["sourceGameId"]
    def fetch(request, timeout):
        if request.full_url != f"https://official-fixture.invalid/api/games/source/{source_id}/details?seasonId=99" or timeout != 12:
            raise AssertionError("Unexpected outgoing URL blocked")
        return io.BytesIO(json.dumps(official).encode())
    with mock.patch.dict(os.environ, {"RECORD_SOURCE_PROMOTION_ENABLED": "true", "BACKEND_API_URL": "https://official-fixture.invalid"}), mock.patch("record_sources.urllib.request.urlopen", side_effect=fetch):
        return promote_record_source(db, match_id, revision or official["syncRevision"], "LOCAL_SOURCE_ADMIN")


def clean(db, match_id):
    fixture(match_id)
    for collection in ("matches", "matchStates", "recordSources", "recordArchives", "recordSourceJobs"):
        db.recursive_delete(db.document(collection, match_id))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["seed", "promote", "clean"])
    parser.add_argument("match_id")
    args = parser.parse_args()
    db = connect()
    try:
        if args.action == "seed":
            official, schedule, core = seed(db, args.match_id)
            print(json.dumps({"official": official, "schedule": schedule, "core": core}))
        elif args.action == "promote":
            print(json.dumps(promote(db, args.match_id)))
        else:
            clean(db, args.match_id)
            print(json.dumps({"cleaned": args.match_id}))
    finally:
        db.close()
