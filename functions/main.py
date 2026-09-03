import json
import logging
import os
import re
import urllib.request

from firebase_admin import auth as admin_auth
from firebase_admin import firestore as admin_firestore
from firebase_admin import messaging
from firebase_admin import initialize_app
from firebase_functions import firestore_fn, https_fn
from firebase_functions import logger as functions_logger
from firebase_functions.options import set_global_options
from firebase_functions.params import SecretParam

from allstar_admin import get_admin_vote_overview as get_allstar_vote_admin_overview_impl
from allstar_admin import set_allstar_feature_enabled as set_allstar_feature_enabled_impl
from allstar_results import rebuild_vote_results as rebuild_allstar_vote_results_impl
from allstar_results import set_vote_results_published as set_allstar_vote_results_published_impl
from allstar_voting import CUSTOM_GOOGLE_SUBJECT_CLAIM
from allstar_voting import get_ballot_status as get_allstar_ballot_status_impl
from allstar_voting import get_event_config as get_allstar_vote_event_impl
from allstar_voting import get_vote_results as get_allstar_vote_results_impl
from allstar_voting import google_subject_from_token
from allstar_voting import submit_ballot as submit_allstar_ballot_impl

logger = logging.getLogger(__name__)

BACKEND_API_URL = os.environ.get("BACKEND_API_URL", "https://api.aubl.club")
_COMPLETED_STATUSES = {"completed", "final", "ended", "종료"}
ALLSTAR_VOTER_KEY_SECRET = SecretParam("ALLSTAR_VOTER_KEY_SECRET")
_LEGACY_ALLSTAR_APP_CHECK = os.environ.get("ALLSTAR_ENFORCE_APP_CHECK", "false")
ALLSTAR_ENFORCE_APP_CHECK_SENSITIVE = os.environ.get(
    "ALLSTAR_ENFORCE_APP_CHECK_SENSITIVE",
    _LEGACY_ALLSTAR_APP_CHECK,
).strip().lower() == "true"
ALLSTAR_ENFORCE_APP_CHECK_PUBLIC = os.environ.get(
    "ALLSTAR_ENFORCE_APP_CHECK_PUBLIC",
    "false",
).strip().lower() == "true"

set_global_options(max_instances=10)
initialize_app()


def _normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _safe_log_label(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = re.sub(r"[^A-Za-z0-9._:-]", "_", value)
    return normalized[:100] or None


def _delta_ops_to_text(ops: list[object]) -> str:
    chunks: list[str] = []
    for op in ops:
        if not isinstance(op, dict):
            continue
        insert = op.get("insert")
        if isinstance(insert, str):
            value = insert.strip()
            if value:
                chunks.append(value)
            continue
        if isinstance(insert, dict):
            if "image" in insert:
                chunks.append("[이미지]")
            if "video" in insert:
                chunks.append("[동영상]")
    return _normalize_whitespace(" ".join(chunks))


def _extract_insert_fragments(raw: str) -> str:
    fragments: list[str] = []
    normalized = raw.replace(r"\"", '"')

    quoted = re.finditer(r'"insert"\s*:\s*"((?:\\.|[^"\\])*)"', normalized, flags=re.DOTALL)
    for match in quoted:
        value = match.group(1)
        if not value:
            continue
        try:
            unescaped = json.loads(f'"{value}"')
            if isinstance(unescaped, str):
                cleaned = _normalize_whitespace(unescaped)
                if cleaned:
                    fragments.append(cleaned)
        except Exception:  # noqa: BLE001
            cleaned = _normalize_whitespace(value)
            if cleaned:
                fragments.append(cleaned)

    # 비정형 payload 대응 (예: {"ops":[f"insert":... 처럼 깨진 형태)
    permissive = re.finditer(
        r"""(?:^|[^A-Za-z0-9_])(?:[fFrRbBuU])?["']?insert["']?\s*:\s*(?:(["'])([\s\S]*?)\1|([^,\}\]]+))""",
        normalized,
        flags=re.DOTALL,
    )
    for match in permissive:
        raw_value = (match.group(2) or match.group(3) or "").strip()
        if not raw_value:
            continue
        cleaned = _normalize_whitespace(raw_value.strip("[]"))
        if cleaned:
            fragments.append(cleaned)

    if re.search(r'"image"\s*:', normalized):
        fragments.append("[이미지]")
    if re.search(r'"video"\s*:', normalized):
        fragments.append("[동영상]")

    return _normalize_whitespace(" ".join(fragments))


def _extract_notice_preview(content: str) -> str:
    raw = (content or "").strip()
    if not raw:
        return ""

    try:
        decoded = json.loads(raw)
        if isinstance(decoded, dict) and isinstance(decoded.get("ops"), list):
            return _delta_ops_to_text(decoded["ops"])
        if isinstance(decoded, list):
            return _delta_ops_to_text(decoded)
        if isinstance(decoded, str):
            nested = json.loads(decoded)
            if isinstance(nested, dict) and isinstance(nested.get("ops"), list):
                return _delta_ops_to_text(nested["ops"])
            if isinstance(nested, list):
                return _delta_ops_to_text(nested)
    except Exception:  # noqa: BLE001
        pass

    # Delta 형식 문자열이 아니면 plain text 처리
    if '"ops"' not in raw and '"insert"' not in raw and r"\"ops\"" not in raw and r"\"insert\"" not in raw:
        return _normalize_whitespace(raw)

    return _extract_insert_fragments(raw)


def _build_notice_body(title: str, content: str, max_len: int = 120) -> str:
    title_text = (title or "새 공지").strip() or "새 공지"
    preview = _extract_notice_preview(content)
    if not preview:
        return title_text

    combined = f"{title_text}: {preview}"
    if len(combined) <= max_len:
        return combined

    available = max_len - len(title_text) - 5  # ': ' + '...'
    if available <= 0:
        return f"{title_text[:max_len - 3]}..."
    return f"{title_text}: {preview[:available]}..."


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
        apns=messaging.APNSConfig(
            payload=messaging.APNSPayload(
                aps=messaging.Aps(sound="default"),
            ),
        ),
        android=messaging.AndroidConfig(priority="high"),
    )
    messaging.send(message)


@https_fn.on_call(
    region="asia-northeast3",
    enforce_app_check=ALLSTAR_ENFORCE_APP_CHECK_PUBLIC,
)
def get_allstar_vote_event(req: https_fn.CallableRequest[object]) -> dict[str, object]:
    """Return only the published event/candidate configuration; never results."""
    return get_allstar_vote_event_impl(req.data)


@https_fn.on_call(
    region="asia-northeast3",
    enforce_app_check=ALLSTAR_ENFORCE_APP_CHECK_PUBLIC,
)
def get_allstar_vote_results(req: https_fn.CallableRequest[object]) -> dict[str, object]:
    """Return only an explicitly published, candidate-version-bound aggregate."""
    return get_allstar_vote_results_impl(req.data)


@https_fn.on_call(
    region="asia-northeast3",
    secrets=[ALLSTAR_VOTER_KEY_SECRET],
    enforce_app_check=ALLSTAR_ENFORCE_APP_CHECK_SENSITIVE,
)
def get_allstar_ballot_status(req: https_fn.CallableRequest[object]) -> dict[str, object]:
    """Return whether the authenticated account may vote in the current period."""
    return get_allstar_ballot_status_impl(req, ALLSTAR_VOTER_KEY_SECRET.value)


@https_fn.on_call(
    region="asia-northeast3",
    secrets=[ALLSTAR_VOTER_KEY_SECRET],
    enforce_app_check=ALLSTAR_ENFORCE_APP_CHECK_SENSITIVE,
)
def submit_allstar_ballot(req: https_fn.CallableRequest[object]) -> dict[str, object]:
    """Validate and atomically create one immutable ballot for the policy period."""
    payload = req.data if isinstance(req.data, dict) else {}
    log_context = {
        "eventId": _safe_log_label(payload.get("eventId")),
        "division": _safe_log_label(payload.get("division")),
        "candidateVersion": _safe_log_label(payload.get("candidateVersion")),
    }
    try:
        result = submit_allstar_ballot_impl(req, ALLSTAR_VOTER_KEY_SECRET.value)
        functions_logger.info(
            "All-Star ballot accepted",
            event="allstar_ballot_accepted",
            **log_context,
            policy=_safe_log_label(result.get("policy")),
            periodKey=_safe_log_label(result.get("periodKey")),
            idempotent=result.get("idempotent") is True,
        )
        return result
    except https_fn.HttpsError as exc:
        details = exc.details if isinstance(exc.details, dict) else {}
        functions_logger.warn(
            "All-Star ballot rejected",
            event="allstar_ballot_rejected",
            **log_context,
            reason=_safe_log_label(details.get("reason")) or "UNKNOWN",
        )
        raise
    except Exception as error:
        functions_logger.error(
            "All-Star ballot failed unexpectedly",
            event="allstar_ballot_failed",
            **log_context,
            reason="UNEXPECTED_ERROR",
            errorType=type(error).__name__,
        )
        raise


@https_fn.on_call(
    region="asia-northeast3",
    timeout_sec=300,
    memory=1024,
    max_instances=1,
    enforce_app_check=ALLSTAR_ENFORCE_APP_CHECK_SENSITIVE,
)
def get_allstar_vote_admin_overview(req: https_fn.CallableRequest[object]) -> dict[str, object]:
    """Return redacted ballot receipts and integrity metrics to administrators."""
    return get_allstar_vote_admin_overview_impl(req)


@https_fn.on_call(
    region="asia-northeast3",
    enforce_app_check=ALLSTAR_ENFORCE_APP_CHECK_SENSITIVE,
)
def set_allstar_feature_enabled(req: https_fn.CallableRequest[object]) -> dict[str, object]:
    """Allow an administrator to change the audited, fail-closed master switch."""
    result = set_allstar_feature_enabled_impl(req)
    functions_logger.warn(
        "All-Star public feature state changed",
        event="allstar_feature_changed",
        enabled=result.get("enabled") is True,
        before=result.get("before") is True,
        revision=result.get("revision"),
    )
    return result


@https_fn.on_call(
    region="asia-northeast3",
    timeout_sec=300,
    memory=1024,
    max_instances=1,
    enforce_app_check=ALLSTAR_ENFORCE_APP_CHECK_SENSITIVE,
)
def rebuild_allstar_vote_results(req: https_fn.CallableRequest[object]) -> dict[str, object]:
    """Strictly rebuild a private result draft from every closed-event ballot."""
    result = rebuild_allstar_vote_results_impl(req)
    functions_logger.info(
        "All-Star result draft rebuilt",
        event="allstar_result_rebuilt",
        eventId=_safe_log_label(result.get("eventId")),
        division=_safe_log_label(result.get("division")),
        candidateVersion=_safe_log_label(result.get("candidateVersion")),
        totalBallots=result.get("totalBallots"),
    )
    return result


@https_fn.on_call(
    region="asia-northeast3",
    timeout_sec=300,
    memory=1024,
    max_instances=1,
    enforce_app_check=ALLSTAR_ENFORCE_APP_CHECK_SENSITIVE,
)
def set_allstar_vote_results_published(
    req: https_fn.CallableRequest[object],
) -> dict[str, object]:
    """Atomically publish or hide a validated, source-digest-bound result."""
    result = set_allstar_vote_results_published_impl(req)
    functions_logger.info(
        "All-Star result publication changed",
        event="allstar_result_publication_changed",
        eventId=_safe_log_label(result.get("eventId")),
        division=_safe_log_label(result.get("division")),
        candidateVersion=_safe_log_label(result.get("candidateVersion")),
        published=result.get("published") is True,
    )
    return result


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
        google_subject = google_subject_from_token(decoded)
        if google_subject is None:
            inherited_subject = decoded.get(CUSTOM_GOOGLE_SUBJECT_CLAIM)
            if isinstance(inherited_subject, str) and inherited_subject:
                google_subject = inherited_subject
        developer_claims = (
            {CUSTOM_GOOGLE_SUBJECT_CLAIM: google_subject}
            if google_subject is not None
            else None
        )
        custom_token = admin_auth.create_custom_token(
            decoded["uid"],
            developer_claims=developer_claims,
        ).decode("utf-8")
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
    notice_title = (data.get("title") or "새 공지").strip()
    content = (data.get("content") or "").strip()
    body = _build_notice_body(notice_title, content)
    _send_topic_notification(
        f"team_{team_id}_notices",
        "팀 공지",
        body,
        {"teamId": str(team_id), "noticeId": str(notice_id or ""), "nav_type": "team_notice"},
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
        {"matchId": str(match_id or ""), "teamId": "all", "nav_type": "match"},
    )
    for team_id in [home_id, away_id]:
        if not team_id:
            continue
        _send_topic_notification(
            f"team_{team_id}_matches",
            "경기 시작",
            matchup,
            {"matchId": str(match_id or ""), "teamId": str(team_id), "nav_type": "match"},
        )


@firestore_fn.on_document_created(document="notices/{noticeId}", region="asia-northeast3")
def notify_community_urgent(event: firestore_fn.Event[firestore_fn.DocumentSnapshot]) -> None:
    data = event.data.to_dict() if event.data else {}
    notice_title = (data.get("title") or "새 공지").strip()
    content = (data.get("content") or "").strip()
    notice_id = event.params.get("noticeId")
    category = (data.get("category") or "일반").strip()

    body = _build_notice_body(notice_title, content)
    if category == "긴급":
        _send_topic_notification(
            "community_urgent",
            "긴급 공지",
            body,
            {"noticeId": str(notice_id or ""), "category": "긴급", "nav_type": "community_urgent"},
        )
        return
    notif_title = f"{category} 공지" if category not in ("일반", "") else "커뮤니티 공지"
    _send_topic_notification(
        "community_notices",
        notif_title,
        body,
        {"noticeId": str(notice_id or ""), "category": category, "nav_type": "community_notice"},
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


@firestore_fn.on_document_updated(document="inquiries/{inquiryId}", region="asia-northeast3")
def notify_inquiry_status(event: firestore_fn.Event[firestore_fn.Change[firestore_fn.DocumentSnapshot]]) -> None:
    """Notify the inquiry author when processing status changes."""
    before = event.data.before.to_dict() if event.data and event.data.before else {}
    after = event.data.after.to_dict() if event.data and event.data.after else {}
    if not after:
        return
    if before.get("status") == after.get("status"):
        return
    uid = after.get("uid")
    if not uid:
        return
    inquiry_id = event.params.get("inquiryId")
    title = (after.get("title") or "건의/문의").strip()
    new_status = after.get("status") or "미처리"
    _send_topic_notification(
        f"inquiry_{uid}",
        "처리 상태 변경",
        f'"{title}" 글이 {new_status} 상태로 변경되었습니다.',
        {"inquiryId": str(inquiry_id or ""), "type": "status", "nav_type": "inquiry"},
    )


@firestore_fn.on_document_created(document="inquiries/{inquiryId}/comments/{commentId}", region="asia-northeast3")
def notify_inquiry_comment(event: firestore_fn.Event[firestore_fn.DocumentSnapshot]) -> None:
    """Notify the inquiry author when a new comment is posted."""
    comment_data = event.data.to_dict() if event.data else {}
    inquiry_id = event.params.get("inquiryId")
    if not inquiry_id:
        return
    db = admin_firestore.client()
    inquiry_snap = db.collection("inquiries").document(inquiry_id).get()
    if not inquiry_snap.exists:
        return
    inquiry_data = inquiry_snap.to_dict() or {}
    uid = inquiry_data.get("uid")
    if not uid:
        return
    commenter_uid = comment_data.get("uid")
    if commenter_uid == uid:
        return
    inquiry_title = (inquiry_data.get("title") or "건의/문의").strip()
    author = (comment_data.get("author") or "누군가").strip()
    _send_topic_notification(
        f"inquiry_{uid}",
        "새 댓글",
        f'"{inquiry_title}"에 {author}님이 댓글을 남겼습니다.',
        {"inquiryId": str(inquiry_id), "type": "comment", "nav_type": "inquiry"},
    )
