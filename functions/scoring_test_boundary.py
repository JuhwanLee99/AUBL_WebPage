"""Closed-by-default server boundary. No callable endpoint or production fallback.

UID and operator privileges must come from verified authentication, never payload.
Every future scoped handler must use this boundary AND enforce its own operation
semantics. A reservation is not a scoring commit or a publication receipt.
"""

import hashlib
import os
import re
import time
from copy import deepcopy
from urllib.parse import urlsplit


class ScoringTestBoundaryError(ValueError):
    pass


_ID = re.compile(r"[A-Za-z0-9_-]{1,128}")
_ROLES = {
    "admin": {"read", "record", "review", "promote"},
    "scorer": {"read", "record"},
    "viewer": {"read"},
}
_COLLECTIONS = {"matches", "matchStates", "recordSources", "recordArchives", "scoringAtomicMatches"}


def _require(condition, code):
    if not condition:
        raise ScoringTestBoundaryError(code)


def _id(value):
    return isinstance(value, str) and _ID.fullmatch(value) is not None


def _integer(value):
    return type(value) is int and 0 <= value <= 9007199254740991


def validate_run(raw):
    """Validate persisted server registry data before trusting any of its fields."""
    _require(isinstance(raw, dict), "invalid-run")
    _require(type(raw.get("version")) is int and raw["version"] == 1, "invalid-version")
    _require(_id(raw.get("runId")) and raw["runId"].startswith("TEST_RUN_"), "invalid-run-id")
    _require(_id(raw.get("projectId")), "invalid-project")
    origin = raw.get("apiOrigin")
    _require(isinstance(origin, str), "invalid-api-origin")
    try:
        parsed = urlsplit(origin)
        valid_origin = (parsed.scheme == "https" and parsed.hostname and not parsed.username
                        and not parsed.password and not parsed.path and not parsed.query
                        and not parsed.fragment and parsed.port != 0
                        and origin == f"https://{parsed.netloc}"
                        and not any(char.isspace() for char in origin))
    except ValueError:
        valid_origin = False
    _require(valid_origin, "invalid-api-origin")
    _require(raw.get("status") in ("disabled", "active", "stopped", "closed"), "invalid-status")
    for field in ("createdAtMs", "approvedAtMs", "expiresAtMs"):
        _require(_integer(raw.get(field)), "invalid-time")
    _require(raw["createdAtMs"] <= raw["approvedAtMs"] < raw["expiresAtMs"], "invalid-approval-window")
    _require(0 < raw["expiresAtMs"] - raw["createdAtMs"] <= 86400000, "invalid-duration")
    matches = raw.get("matchIds")
    _require(isinstance(matches, list) and 1 <= len(matches) <= 3, "invalid-matches")
    _require(all(_id(item) and item.startswith("TEST_SCORING_") for item in matches), "invalid-match-id")
    _require(len(set(matches)) == len(matches), "duplicate-match")
    participants = raw.get("participants")
    _require(isinstance(participants, list) and 1 <= len(participants) <= 10, "invalid-participants")
    _require(all(isinstance(item, dict) and _id(item.get("uid"))
                 and isinstance(item.get("role"), str) and item["role"] in _ROLES
                 for item in participants), "invalid-participant")
    _require(len({item["uid"] for item in participants}) == len(participants), "duplicate-participant")
    _require(any(item["uid"] == raw.get("approvedByUid") and item["role"] == "admin"
                 for item in participants), "invalid-approver")
    operations = raw.get("operations")
    _require(isinstance(operations, list) and 1 <= len(operations) <= 4, "invalid-operations")
    _require(all(isinstance(item, str) and item in _ROLES["admin"] for item in operations), "invalid-operation")
    _require(len(set(operations)) == len(operations), "duplicate-operation")
    _require(_integer(raw.get("maxRequests")) and 1 <= raw["maxRequests"] <= 10000, "invalid-request-limit")
    return deepcopy(raw)


def authorize_run(raw, *, uid, match_id, operation, project_id, api_origin, now_ms):
    run = validate_run(raw)
    _require(_id(uid), "unauthenticated")
    _require(_integer(now_ms), "invalid-server-time")
    _require(run["status"] == "active", "run-not-active")
    _require(run["approvedAtMs"] <= now_ms < run["expiresAtMs"], "run-expired-or-not-started")
    _require(run["projectId"] == project_id and run["apiOrigin"] == api_origin, "target-mismatch")
    _require(match_id in run["matchIds"], "match-not-allowed")
    role = next((item["role"] for item in run["participants"] if item["uid"] == uid), None)
    _require(role is not None, "not-a-participant")
    _require(isinstance(operation, str) and operation in run["operations"]
             and operation in _ROLES[role], "operation-not-allowed")
    return run


class ScoringTestRegistry:
    """Internal registry; deployment and request handlers are deliberately absent.

    Reservation limits count distinct accepted request IDs, including subsequent
    operation failures. Replays do not consume another slot. This is not an HTTP
    rate limiter and does not implement commit idempotency or server egress guards.
    """

    def __init__(self, db, *, project_id, api_origin):
        self.db = db
        self.project_id = project_id
        self.api_origin = api_origin

    def _ref(self, run_id):
        _require(_id(run_id) and run_id.startswith("TEST_RUN_"), "invalid-run-id")
        return self.db.collection("scoringTestRuns").document(run_id)

    def create_disabled(self, raw, *, actor_uid, operator_authorized, approval_audit=None):
        """Only an explicitly authorized test operator may register a closed run."""
        _require(operator_authorized is True and _id(actor_uid), "operator-required")
        run = validate_run(raw)
        _require(run["status"] == "disabled", "registration-must-be-disabled")
        _require(run["approvedByUid"] == actor_uid, "approver-mismatch")
        _require(run["projectId"] == self.project_id and run["apiOrigin"] == self.api_origin, "target-mismatch")
        # Whitelist registry fields; caller cannot seed counters or activation state.
        fields = ("version", "runId", "projectId", "apiOrigin", "status", "createdAtMs",
                  "expiresAtMs", "approvedAtMs", "approvedByUid", "matchIds",
                  "participants", "operations", "maxRequests")
        registration = {**{key: run[key] for key in fields}, "requestCount": 0}
        if approval_audit is not None:
            # Internal application adapter supplies this, never raw request data.
            registration["approvalAudit"] = deepcopy(approval_audit)
        self._ref(run["runId"]).create(registration)
        return {"runId": run["runId"], "status": "disabled"}

    def stop(self, run_id, *, actor_uid, operator_authorized):
        _require(operator_authorized is True and _id(actor_uid), "operator-required")
        from firebase_admin import firestore

        ref = self._ref(run_id)

        @firestore.transactional
        def commit(transaction):
            current = ref.get(transaction=transaction).to_dict()
            _require(isinstance(current, dict), "run-not-found")
            # Allow emergency stop even if other registry fields became invalid.
            if current.get("status") != "closed":
                transaction.update(ref, {"status": "stopped", "stoppedByUid": actor_uid,
                                         "stoppedAtMs": time.time_ns() // 1000000})
            return {"runId": run_id, "status": "closed" if current.get("status") == "closed" else "stopped"}

        from scoring_test_transactions import run_transaction
        return run_transaction(self.db, commit)

    def reserve(self, run_id, *, uid, match_id, operation, request_id, payload_hash, upload_bytes=0):
        _require(os.environ.get("SCORING_TEST_SERVER_ENABLED") == "true", "server-test-disabled")
        _require(_id(request_id), "invalid-request-id")
        _require(isinstance(payload_hash, str) and re.fullmatch(r"[0-9a-f]{64}", payload_hash), "invalid-payload-hash")
        from firebase_admin import firestore
        from scoring_test_resources import plan_resources

        ref = self._ref(run_id)
        receipt = ref.collection("requestReservations").document(hashlib.sha256(request_id.encode()).hexdigest())
        binding = {"requestId": request_id, "uid": uid, "matchId": match_id,
                   "operation": operation, "payloadHash": payload_hash}

        @firestore.transactional
        def commit(transaction):
            raw = ref.get(transaction=transaction).to_dict()
            run = authorize_run(raw, uid=uid, match_id=match_id, operation=operation,
                                project_id=self.project_id, api_origin=self.api_origin,
                                now_ms=time.time_ns() // 1000000)
            _require(run["runId"] == run_id, "registry-id-mismatch")
            previous = receipt.get(transaction=transaction).to_dict()
            if previous is not None:
                _require(all(previous.get(key) == value for key, value in binding.items()), "request-id-conflict")
                _require(previous.get("uploadBytes", 0) == upload_bytes, "request-id-conflict")
                resources = plan_resources(raw, now_ms=time.time_ns() // 1000000,
                                           upload_bytes=upload_bytes, replayed=True)
                transaction.update(ref, resources)
                return {"requestId": request_id, "replayed": True}
            count = raw.get("requestCount")
            _require(_integer(count), "invalid-request-counter")
            _require(count < run["maxRequests"], "request-budget-exhausted")
            resources = plan_resources(raw, now_ms=time.time_ns() // 1000000,
                                       upload_bytes=upload_bytes, replayed=False)
            transaction.create(receipt, {**binding, "uploadBytes": upload_bytes,
                                         "reservedAtMs": time.time_ns() // 1000000})
            transaction.update(ref, {"requestCount": count + 1, **resources})
            return {"requestId": request_id, "replayed": False}

        from scoring_test_transactions import run_transaction
        return run_transaction(self.db, commit)

    def scoped_reference(self, run_id, match_id, collection):
        """Path construction only. Callers MUST authorize the actual operation."""
        _require(_id(match_id) and match_id.startswith("TEST_SCORING_"), "invalid-match-id")
        _require(isinstance(collection, str) and collection in _COLLECTIONS, "invalid-collection")
        return self._ref(run_id).collection(collection).document(match_id)
