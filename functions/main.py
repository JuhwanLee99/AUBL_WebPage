import json
import logging
import os
import urllib.request

from firebase_admin import auth as admin_auth
from firebase_admin import messaging
from firebase_admin import initialize_app
from firebase_functions import firestore_fn, https_fn
from firebase_functions.options import set_global_options

logger = logging.getLogger(__name__)

BACKEND_API_URL = os.environ.get("BACKEND_API_URL", "https://api.aubl.club")
_COMPLETED_STATUSES = {"completed", "final", "ended", "종료"}

set_global_options(max_instances=10)
initialize_app()


def _cors_headers() -> dict[str, str]:
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    }


def _json_response(payload: dict[str, object], status: int = 200) -> https_fn.Response:
    headers = _cors_headers()
    headers["Content-Type"] = "application/json"
    return https_fn.Response(
        json.dumps(payload, ensure_ascii=False),
        status=status,
        headers=headers,
    )


def _send_topic_notification(topic: str, title: str, body: str, data: dict[str, str] | None = None) -> None:
    message = messaging.Message(
        topic=topic,
        notification=messaging.Notification(title=title, body=body),
        data=data or {},
    )
    messaging.send(message)


@https_fn.on_request(region="asia-northeast3")
def exchange_web_id_token(req: https_fn.Request) -> https_fn.Response:
    if req.method == "OPTIONS":
        return https_fn.Response("", status=204, headers=_cors_headers())

    if req.method != "POST":
        return _json_response({"error": "method_not_allowed"}, status=405)

    data = req.get_json(silent=True) or {}
    id_token = data.get("idToken")

    if not isinstance(id_token, str) or not id_token.strip():
        return _json_response({"error": "invalid_request", "message": "idToken is required."}, status=400)

    try:
        decoded = admin_auth.verify_id_token(id_token)
        custom_token = admin_auth.create_custom_token(decoded["uid"]).decode("utf-8")
        return _json_response({"customToken": custom_token})
    except Exception as exc:  # noqa: BLE001
        return _json_response(
            {
                "error": "token_exchange_failed",
                "message": str(exc),
            },
            status=401,
        )


@firestore_fn.on_document_created(document="teams/{teamId}/notices/{noticeId}", region="asia-northeast3")
def notify_team_notice(event: firestore_fn.Event[firestore_fn.DocumentSnapshot]) -> None:
    data = event.data.to_dict() if event.data else {}
    team_id = event.params.get("teamId")
    notice_id = event.params.get("noticeId")
    if not team_id:
        return
    title = (data.get("title") or "새 팀 공지").strip()
    content = (data.get("content") or "공지 내용이 등록되었습니다.").strip()
    body = content if len(content) <= 120 else f"{content[:117]}..."
    _send_topic_notification(
        f"team_{team_id}_notices",
        title,
        body,
        {"teamId": str(team_id), "noticeId": str(notice_id or "")},
    )


@firestore_fn.on_document_updated(document="matches/{matchId}", region="asia-northeast3")
def notify_match_live(event: firestore_fn.Event[firestore_fn.Change[firestore_fn.DocumentSnapshot]]) -> None:
    before = event.data.before.to_dict() if event.data and event.data.before else {}
    after = event.data.after.to_dict() if event.data and event.data.after else {}
    if not after:
        return
    if before.get("status") == after.get("status"):
        return
    if after.get("status") != "inProgress":
        return
    match_id = event.params.get("matchId")
    home_id = after.get("homeTeamId")
    away_id = after.get("awayTeamId")
    home_name = after.get("homeTeamName") or ""
    away_name = after.get("awayTeamName") or ""
    matchup = "경기가 시작되었습니다."
    if home_name or away_name:
        matchup = f"{away_name} vs {home_name} 경기가 시작되었습니다."
    _send_topic_notification(
        "matches_all",
        "경기 시작",
        matchup,
        {"matchId": str(match_id or ""), "teamId": "all"},
    )
    for team_id in [home_id, away_id]:
        if not team_id:
            continue
        _send_topic_notification(
            f"team_{team_id}_matches",
            "경기 시작",
            matchup,
            {"matchId": str(match_id or ""), "teamId": str(team_id)},
        )


@firestore_fn.on_document_created(document="notices/{noticeId}", region="asia-northeast3")
def notify_community_urgent(event: firestore_fn.Event[firestore_fn.DocumentSnapshot]) -> None:
    data = event.data.to_dict() if event.data else {}
    title = (data.get("title") or "긴급 공지").strip()
    content = (data.get("content") or "긴급 공지가 등록되었습니다.").strip()
    body = content if len(content) <= 120 else f"{content[:117]}..."
    notice_id = event.params.get("noticeId")
    if data.get("category") == "긴급":
        _send_topic_notification(
            "community_urgent",
            title,
            body,
            {"noticeId": str(notice_id or ""), "category": "긴급"},
        )
        return
    _send_topic_notification(
        "community_notices",
        title,
        body,
        {"noticeId": str(notice_id or ""), "category": str(data.get("category") or "")},
    )


@firestore_fn.on_document_updated(document="matches/{matchId}", region="asia-northeast3")
def import_completed_match(event: firestore_fn.Event[firestore_fn.Change[firestore_fn.DocumentSnapshot]]) -> None:
    """When a match status changes to completed, import its data to MariaDB via backend API."""
    before = event.data.before.to_dict() if event.data and event.data.before else {}
    after = event.data.after.to_dict() if event.data and event.data.after else {}
    if not after:
        return
    old_status = (before.get("status") or "").lower()
    new_status = (after.get("status") or "").lower()
    if old_status == new_status:
        return
    if new_status not in _COMPLETED_STATUSES:
        return
    match_id = event.params.get("matchId")
    if not match_id:
        return
    url = f"{BACKEND_API_URL}/api/import/firestore/matches/{match_id}"
    try:
        req = urllib.request.Request(url, method="POST", data=b"")
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=30) as resp:
            logger.info("import_completed_match: %s -> %s (HTTP %s)", match_id, new_status, resp.status)
    except Exception:
        logger.exception("import_completed_match failed for %s", match_id)
