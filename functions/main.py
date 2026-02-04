import json

from firebase_admin import auth as admin_auth
from firebase_admin import initialize_app
from firebase_functions import https_fn
from firebase_functions.options import set_global_options

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
