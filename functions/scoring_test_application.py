"""Internal adapter for Firebase-verified callable requests; not an endpoint.

Only pass requests constructed by Firebase's authenticated callable runtime.
No function in this module verifies arbitrary JWTs or accepts browser-supplied
claims as credentials. Test operator claims must be provisioned separately.
"""

import hashlib
import json
import time
from copy import deepcopy

from scoring_test_boundary import ScoringTestBoundaryError, validate_run


def _require(condition, code):
    if not condition:
        raise ScoringTestBoundaryError(code)


def authenticated_uid(req, *, operator=False):
    auth = getattr(req, "auth", None)
    uid = getattr(auth, "uid", None)
    token = getattr(auth, "token", None)
    _require(isinstance(uid, str) and bool(uid) and isinstance(token, dict), "unauthenticated")
    if operator:
        # A general admin claim must never implicitly grant test-operation access.
        _require(token.get("scoringTestOperator") is True, "test-operator-required")
    return uid


def validate_execution_manifest(raw, run):
    """Require an explicit, bounded operator-approved execution specification.

    These budgets are approval data only until transport/upload enforcement is
    connected. Registration does not authorize execution or change run status.
    """
    fields = {"version", "deploymentVersion", "stopOwnerUid", "scenarioByMatch",
              "limits", "cleanup", "approvalReference"}
    _require(isinstance(raw, dict) and set(raw) == fields, "invalid-execution-manifest")
    _require(type(raw["version"]) is int and raw["version"] == 1, "invalid-execution-version")
    for field in ("deploymentVersion", "approvalReference"):
        value = raw[field]
        _require(isinstance(value, str) and 1 <= len(value) <= 200
                 and value == value.strip() and not any(ord(char) < 32 for char in value),
                 "invalid-" + field)
    _require(any(item["uid"] == raw["stopOwnerUid"] and item["role"] == "admin"
                 for item in run["participants"]), "invalid-stop-owner")
    scenarios = raw["scenarioByMatch"]
    allowed_scenarios = {"full-game", "recovery-handoff", "official-comparison"}
    _require(isinstance(scenarios, dict) and set(scenarios) == set(run["matchIds"]), "invalid-scenario-matches")
    _require(all(isinstance(value, str) and value in allowed_scenarios for value in scenarios.values()),
             "invalid-scenario")
    _require(len(set(scenarios.values())) == len(scenarios), "duplicate-scenario")
    limits = raw["limits"]
    _require(isinstance(limits, dict)
             and set(limits) == {"maxRequests", "maxRequestsPerMinute", "maxUploadBytes"}, "invalid-execution-limits")
    _require(all(type(value) is int and 1 <= value <= 9007199254740991 for value in limits.values()),
             "invalid-execution-limit-value")
    _require(limits["maxRequests"] == run["maxRequests"]
             and limits["maxRequestsPerMinute"] <= limits["maxRequests"], "execution-limit-mismatch")
    cleanup = raw["cleanup"]
    _require(isinstance(cleanup, dict)
             and set(cleanup) == {"namespace", "deleteRunData", "revokeRunAccess", "verifyAbsence"},
             "invalid-cleanup")
    _require(cleanup["namespace"] == "scoringTestRuns/" + run["runId"], "cleanup-scope-mismatch")
    _require(all(cleanup[key] is True for key in ("deleteRunData", "revokeRunAccess", "verifyAbsence")),
             "cleanup-approval-required")
    return deepcopy(raw)


class ScoringTestApplication:
    """Authentication and approval adapter. No activation or game write method."""

    def __init__(self, registry):
        self.registry = registry

    def register_from_callable(self, req):
        uid = authenticated_uid(req, operator=True)
        data = getattr(req, "data", None)
        _require(isinstance(data, dict) and set(data) == {"run", "executionManifest"}, "invalid-registration-request")
        run = validate_run(data["run"])
        _require(run["status"] == "disabled", "registration-must-be-disabled")
        _require(run["approvedByUid"] == uid, "approver-mismatch")
        now = time.time_ns() // 1000000
        _require(run["createdAtMs"] <= run["approvedAtMs"] <= now < run["expiresAtMs"],
                 "invalid-registration-window")
        manifest = validate_execution_manifest(data["executionManifest"], run)
        # Audit digest binds execution details AND scope/participants/time window.
        approved = {"run": {key: run[key] for key in (
            "version", "runId", "projectId", "apiOrigin", "status", "createdAtMs", "approvedAtMs",
            "expiresAtMs", "approvedByUid", "matchIds", "participants", "operations", "maxRequests")},
            "executionManifest": manifest}
        canonical = json.dumps(approved, sort_keys=True, ensure_ascii=True, separators=(",", ":"), allow_nan=False)
        digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        audit = {"version": 1, "actorUid": uid, "registeredAtMs": now,
                 "approvalHash": digest, "hashFormat": "python-json-sort-ascii-v1",
                 "approvedSpecification": approved}
        result = self.registry.create_disabled(run, actor_uid=uid, operator_authorized=True,
                                               approval_audit=audit)
        return {**result, "approvalHash": digest}

    def stop_from_callable(self, req):
        uid = authenticated_uid(req, operator=True)
        data = getattr(req, "data", None)
        _require(isinstance(data, dict) and set(data) == {"runId"}, "invalid-stop-request")
        return self.registry.stop(data["runId"], actor_uid=uid, operator_authorized=True)

    def reserve_from_callable(self, req):
        # UID always comes from runtime auth, never from the request data.
        uid = authenticated_uid(req)
        data = getattr(req, "data", None)
        _require(isinstance(data, dict)
                 and set(data) == {"runId", "matchId", "operation", "requestId", "payloadHash"},
                 "invalid-reservation-request")
        return self.registry.reserve(data["runId"], uid=uid, match_id=data["matchId"],
                                     operation=data["operation"], request_id=data["requestId"],
                                     payload_hash=data["payloadHash"])
