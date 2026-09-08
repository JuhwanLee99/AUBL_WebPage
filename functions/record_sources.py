"""Server-only publication boundary. No destructive migration or raw-event copying."""
import hashlib
import json
import os
import time
import urllib.parse
import urllib.request

from firebase_admin import firestore
from firebase_functions import https_fn
from record_source_policy import public_official_record


def promotion_enabled():
    return os.environ.get("RECORD_SOURCE_PROMOTION_ENABLED", "false").lower() == "true"


def promote_record_source(db, match_id, expected_revision, actor):
    if not promotion_enabled():
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.FAILED_PRECONDITION, "공식 전환 기능이 아직 활성화되지 않았습니다.")
    if not isinstance(match_id, str) or not match_id or "/" in match_id or len(match_id) > 300:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.INVALID_ARGUMENT, "올바른 경기 ID가 필요합니다.")
    match_ref = db.collection("matches").document(match_id)
    source_ref = db.collection("recordSources").document(match_id)
    archive_ref = db.collection("recordArchives").document(match_id)
    initial = match_ref.get().to_dict() or {}
    source_id = initial.get("sourceGameId")
    season_id = initial.get("seasonId")
    if not source_id or not season_id:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.FAILED_PRECONDITION, "유니크플레이 경기·시즌 매핑이 필요합니다.")
    # Only the configured trusted backend is queried; no URL or payload from the browser.
    origin = os.environ.get("BACKEND_API_URL", "https://api.aubl.club").rstrip("/")
    if urllib.parse.urlparse(origin).scheme != "https":
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.FAILED_PRECONDITION, "HTTPS 백엔드 설정이 필요합니다.")
    url = f"{origin}/api/games/source/{urllib.parse.quote(str(source_id), safe='')}/details?{urllib.parse.urlencode({'seasonId': season_id})}"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"Accept": "application/json", "Cache-Control": "no-cache"}), timeout=12) as response:
            body = response.read(800001)
        if len(body) > 800000:
            raise ValueError("Official response too large")
        official, digest = public_official_record(initial, json.loads(body), expected_revision)
    except ValueError as error:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.FAILED_PRECONDITION, str(error)) from error
    except Exception as error:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.UNAVAILABLE, "공식 기록 확인에 실패했습니다. 기존 공개 원천은 변경되지 않았습니다.") from error

    @firestore.transactional
    def commit(transaction):
        current = match_ref.get(transaction=transaction).to_dict() or {}
        previous = source_ref.get(transaction=transaction).to_dict()
        archive = archive_ref.get(transaction=transaction)
        core_ref = db.collection("matchStates").document(match_id)
        core = core_ref.get(transaction=transaction)
        live = core.to_dict() or {}
        if live.get("gameStarted") and not live.get("gameOver"):
            raise https_fn.HttpsError(https_fn.FunctionsErrorCode.FAILED_PRECONDITION, "자체 기록의 경기 종료를 먼저 저장해 주세요.")
        updated_at = live.get("updatedAt")
        if isinstance(updated_at, (int, float)) and time.time() * 1000 - updated_at < 15000:
            raise https_fn.HttpsError(https_fn.FunctionsErrorCode.FAILED_PRECONDITION, "자체 기록 저장 직후입니다. 15초 후 저장 상태를 확인하고 다시 전환해 주세요.")
        # CAS binding and schedule revision, including concurrent remaps/deletions.
        binding = ("sourceProvider", "sourceGameId", "seasonId", "syncRevision", "sourceActive", "status", "recordMode", "homeTeamName", "awayTeamName")
        if any(current.get(key) != initial.get(key) for key in binding):
            raise https_fn.HttpsError(https_fn.FunctionsErrorCode.ABORTED, "동기화 상태가 변경되었습니다. 다시 조회해 주세요.")
        if not current or current.get("deleted") is True:
            raise https_fn.HttpsError(https_fn.FunctionsErrorCode.FAILED_PRECONDITION, "삭제된 경기는 전환할 수 없습니다.")
        if previous:
            if (previous.get("official", {}).get("sourceGameId") != source_id
                    or previous.get("official", {}).get("seasonId") != season_id or not archive.exists):
                raise https_fn.HttpsError(https_fn.FunctionsErrorCode.FAILED_PRECONDITION, "원본 보관 또는 경기 매핑 복구가 필요합니다.")
            if previous.get("revision") == expected_revision:
                if previous.get("payloadHash") != digest:
                    raise https_fn.HttpsError(https_fn.FunctionsErrorCode.FAILED_PRECONDITION, "같은 리비전의 내용이 변경되었습니다.")
                return {"matchId": match_id, "revision": expected_revision, "replayed": True}
            # A delayed older task cannot move the boundary back after a new schedule sync.
            if current.get("syncRevision") != expected_revision:
                raise https_fn.HttpsError(https_fn.FunctionsErrorCode.ABORTED, "일정 리비전과 공식 리비전이 다릅니다.")
        elif archive.exists or current.get("recordAuthority") == "UNIQUE_PLAY":
            raise https_fn.HttpsError(https_fn.FunctionsErrorCode.FAILED_PRECONDITION, "불완전한 공식 전환 상태입니다. 원본을 덮어쓰지 않습니다.")
        if current.get("syncRevision") != expected_revision:
            raise https_fn.HttpsError(https_fn.FunctionsErrorCode.ABORTED, "일정 동기화 완료 후 다시 전환해 주세요.")
        if not previous:
            transaction.create(archive_ref, {
                "schemaVersion": 1, "matchId": match_id, "schedule": current,
                "liveStatePath": core_ref.path, "liveStatePresent": core.exists,
                "archivedAt": firestore.SERVER_TIMESTAMP, "firstOfficialRevision": expected_revision,
                "actorUid": actor,
            })
        public = {"schemaVersion": 1, "matchId": match_id, "authority": "UNIQUE_PLAY",
                  "liveVisibility": "ADMIN_ONLY", "revision": expected_revision, "payloadHash": digest,
                  "official": official, "activatedAt": firestore.SERVER_TIMESTAMP}
        transaction.set(source_ref, public)
        revision_id = hashlib.sha256(expected_revision.encode()).hexdigest()
        transaction.create(archive_ref.collection("officialRevisions").document(revision_id), {
            **public, "actorUid": actor,
        })
        # Firestore has document-level reads, so hiding these fields in React is insufficient.
        patch = {key: firestore.DELETE_FIELD for key in ("postGame", "manualEntryDraft", "lineups", "benches", "notes")}
        patch.update({"recordAuthority": "UNIQUE_PLAY", "officialRecordRevision": expected_revision,
                      "homeScore": official["game"]["homeScore"], "awayScore": official["game"]["awayScore"],
                      "updatedAt": firestore.SERVER_TIMESTAMP})
        transaction.update(match_ref, patch)
        return {"matchId": match_id, "revision": expected_revision, "replayed": False}

    return commit(db.transaction())


def promote_from_request(req):
    if not req.auth or req.auth.token.get("admin") is not True:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.PERMISSION_DENIED, "관리자만 공식 전환할 수 있습니다.")
    data = req.data if isinstance(req.data, dict) else {}
    revision = data.get("expectedRevision")
    if not isinstance(revision, str) or not revision or len(revision) > 200:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.INVALID_ARGUMENT, "게시 리비전이 필요합니다.")
    return promote_record_source(firestore.client(), data.get("matchId"), revision, req.auth.uid)
