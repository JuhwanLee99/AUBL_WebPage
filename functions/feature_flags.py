"""Fail-closed runtime feature flags shared by public Cloud Functions."""

from __future__ import annotations

from typing import Any, Mapping, NoReturn

from firebase_functions import https_fn
from firebase_functions import logger as functions_logger


PUBLIC_FEATURE_FLAGS_COLLECTION = "publicFeatureFlags"
FEATURE_FLAG_AUDIT_COLLECTION = "featureFlagAudit"
ALLSTAR_FEATURE_ID = "allstar"
FEATURE_FLAG_SCHEMA_VERSION = 1


def allstar_feature_ref(db: Any) -> Any:
    return db.collection(PUBLIC_FEATURE_FLAGS_COLLECTION).document(ALLSTAR_FEATURE_ID)


def parse_allstar_feature(snapshot: Any) -> dict[str, Any]:
    raw = snapshot.to_dict() if getattr(snapshot, "exists", False) else None
    if not isinstance(raw, Mapping):
        return {"enabled": False, "revision": 0, "updatedAt": None}
    revision = raw.get("revision")
    valid_revision = (
        isinstance(revision, int)
        and not isinstance(revision, bool)
        and revision > 0
    )
    schema_version = raw.get("schemaVersion")
    valid_schema = schema_version == FEATURE_FLAG_SCHEMA_VERSION
    return {
        "enabled": raw.get("enabled") is True and valid_revision and valid_schema,
        "revision": revision if valid_revision else 0,
        "updatedAt": raw.get("updatedAt"),
    }


def _feature_disabled() -> NoReturn:
    raise https_fn.HttpsError(
        code=https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
        message="This feature is not currently available.",
        details={"reason": "FEATURE_DISABLED", "feature": ALLSTAR_FEATURE_ID},
    )


def require_allstar_feature_enabled(db: Any, transaction: Any | None = None) -> dict[str, Any]:
    reference = allstar_feature_ref(db)
    try:
        snapshot = reference.get(transaction=transaction) if transaction is not None else reference.get()
    except Exception as error:  # noqa: BLE001 - a flag read failure must fail closed
        functions_logger.error(
            "All-Star feature flag could not be verified",
            event="allstar_feature_flag_read_failed",
            errorType=type(error).__name__,
        )
        _feature_disabled()
    state = parse_allstar_feature(snapshot)
    if state["enabled"] is not True:
        _feature_disabled()
    return state
