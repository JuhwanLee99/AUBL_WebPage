"""Emulator-only authenticated callable bridge. Never enables production scoring."""
import base64
import binascii
import io
import os
import re
from urllib.parse import urlsplit

from firebase_functions import https_fn
from scoring_test_boundary import ScoringTestBoundaryError, ScoringTestRegistry
from scoring_test_commits import ScoringTestCommits, validate_manifest
from scoring_test_sessions import ScoringTestWriterSessions
from scoring_test_transfer import ScoringTestTransferService, _digest


def _require(condition, code):
    if not condition:
        raise ScoringTestBoundaryError(code)


def _id(value):
    return isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value) is not None


def _integer(value, minimum=0):
    return type(value) is int and minimum <= value <= 9007199254740991


def _loopback(value):
    if not isinstance(value, str) or not value:
        return False
    try:
        url = urlsplit("http://" + value)
        return (url.hostname in ("127.0.0.1", "localhost", "::1") and url.port is not None
                and url.port > 0 and not url.username and not url.password
                and not url.path and not url.query and not url.fragment)
    except ValueError:
        return False


def _registry(project):
    # Recheck before constructing a client, even when this factory is called directly.
    _require(os.environ.get("FUNCTIONS_EMULATOR") == "true"
             and _id(project) and project.startswith("demo-")
             and project == os.environ.get("GCLOUD_PROJECT"), "rpc-project-mismatch")
    _require(_loopback(os.environ.get("FIRESTORE_EMULATOR_HOST"))
             and _loopback(os.environ.get("FIREBASE_AUTH_EMULATOR_HOST")), "rpc-emulator-required")
    from google.auth.credentials import AnonymousCredentials
    from google.cloud.firestore import Client
    # Legacy: firebase_admin.firestore.client() required ADC even for the emulator.
    db = Client(project=project, credentials=AnonymousCredentials())
    # Approval manifests must use this inert origin. No outbound API is called.
    return ScoringTestRegistry(db, project_id=project, api_origin="https://scoring-emulator.invalid")


def dispatch_scoring_test_writer(req, registry_factory=_registry):
    _require(os.environ.get("SCORING_TEST_RPC_ENABLED") == "true"
             and os.environ.get("FUNCTIONS_EMULATOR") == "true"
             and os.environ.get("SCORING_TEST_SERVER_ENABLED") == "true", "rpc-disabled")
    project = os.environ.get("GCLOUD_PROJECT", "")
    _require(_id(project) and project.startswith("demo-"), "rpc-project-mismatch")
    _require(_loopback(os.environ.get("FIRESTORE_EMULATOR_HOST"))
             and _loopback(os.environ.get("FIREBASE_AUTH_EMULATOR_HOST")), "rpc-emulator-required")
    # req.auth is populated by Firebase's callable authentication middleware.
    auth = getattr(req, "auth", None)
    uid = getattr(auth, "uid", None)
    token = getattr(auth, "token", None)
    _require(_id(uid) and isinstance(token, dict), "unauthenticated")
    _require(token.get("aud") == project and token.get("sub") == uid
             and token.get("iss") == f"https://securetoken.google.com/{project}", "rpc-auth-project-mismatch")
    data = getattr(req, "data", None)
    _require(isinstance(data, dict), "invalid-rpc-request")
    action = data.get("action")
    fields = {
        "acquire": {"action", "runId", "matchId", "writerSessionId", "requestId"},
        "upload": {"action", "runId", "matchId", "writerSessionId", "lockEpoch", "requestId", "bodyBase64", "size", "sha256"},
        "commit": {"action", "runId", "matchId", "writerSessionId", "lockEpoch", "requestId", "expectedRevision",
                   "firstInputSequence", "lastInputSequence", "manifest", "payloadHash"},
    }
    _require(isinstance(action, str) and action in fields and set(data) == fields[action], "invalid-rpc-fields")
    _require(_id(data["runId"]) and data["runId"].startswith("TEST_RUN_")
             and _id(data["matchId"]) and data["matchId"].startswith("TEST_SCORING_")
             and _id(data["writerSessionId"]) and _id(data["requestId"]), "invalid-rpc-scope")
    if action != "acquire":
        _require(_integer(data["lockEpoch"], 1), "invalid-lock-epoch")
    body = None
    if action == "upload":
        limit = ScoringTestTransferService.BLOCK_LIMIT
        _require(_integer(data["size"]) and data["size"] <= limit, "invalid-upload-size")
        encoded = data["bodyBase64"]
        _require(isinstance(encoded, str) and len(encoded) <= 4 * ((limit + 2) // 3), "invalid-upload-body")
        try:
            body = base64.b64decode(encoded, validate=True)
        except (ValueError, binascii.Error):
            raise ScoringTestBoundaryError("invalid-upload-body") from None
        _require(len(body) == data["size"], "upload-size-mismatch")
        _require(isinstance(data["sha256"], str) and re.fullmatch(r"[a-f0-9]{64}", data["sha256"]), "invalid-upload-hash")
    if action == "commit":
        _require(os.environ.get("SCORING_TEST_COMMIT_ENABLED") == "true", "test-commit-disabled")
        validate_manifest(data["manifest"], data["matchId"])
        _require(_integer(data["expectedRevision"]) and _integer(data["firstInputSequence"], 1)
                 and _integer(data["lastInputSequence"], data["firstInputSequence"]), "invalid-commit-sequence")
        _require(data["payloadHash"] == _digest(data["manifest"]), "manifest-hash-mismatch")
    registry = registry_factory(project)
    _require(registry.project_id == project and registry.api_origin == "https://scoring-emulator.invalid", "rpc-target-mismatch")
    run_id, match_id = data["runId"], data["matchId"]
    transfer = ScoringTestTransferService(registry)
    transfer._authorized(registry._ref(run_id), uid=uid, match_id=match_id, operation="record")
    if action != "upload":
        # Upload already reserves in stage_block. Other operations also obey run budgets.
        registry.reserve(run_id, uid=uid, match_id=match_id, operation="record",
                         request_id="rpc_" + action + "_" + _digest(data["requestId"]),
                         payload_hash=_digest({"uid": uid, "request": data}))
    if action == "acquire":
        receipt = ScoringTestWriterSessions(registry).acquire(run_id, uid=uid, match_id=match_id,
                                                            writer_session_id=data["writerSessionId"])
        return {**receipt, "runId": run_id, "matchId": match_id, "uid": uid}
    if action == "upload":
        return transfer.stage_block(run_id, uid=uid, match_id=match_id, request_id=data["requestId"],
            source=io.BytesIO(body), expected_bytes=data["size"], expected_sha256=data["sha256"],
            writer_session_id=data["writerSessionId"], lock_epoch=data["lockEpoch"])
    return ScoringTestCommits(registry).commit(run_id, uid=uid, match_id=match_id,
        writer_session_id=data["writerSessionId"], lock_epoch=data["lockEpoch"], request_id=data["requestId"],
        expected_revision=data["expectedRevision"], first_input_sequence=data["firstInputSequence"],
        last_input_sequence=data["lastInputSequence"], manifest=data["manifest"], payload_hash=data["payloadHash"])


def scoring_test_writer_from_request(req):
    try:
        return dispatch_scoring_test_writer(req)
    except ScoringTestBoundaryError as error:
        code = https_fn.FunctionsErrorCode.UNAUTHENTICATED if str(error) == "unauthenticated" else https_fn.FunctionsErrorCode.FAILED_PRECONDITION
        raise https_fn.HttpsError(code, str(error)) from None
    except Exception:
        # Do not expose database details, payloads or tokens to the caller.
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.INTERNAL, "scoring-test-rpc-failed") from None
