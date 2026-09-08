"""Internal scoped transfers. No public endpoint, activation, or scoring head.

UID must come from verified authentication. Transport and registry configuration
must be constructed by the server, never from request payloads.
"""
import hashlib
import json
import os
import re
import time

from scoring_test_application import validate_execution_manifest
from scoring_test_boundary import ScoringTestBoundaryError, authorize_run, validate_run
from scoring_test_io import verified_upload
from scoring_test_transactions import run_transaction


def _require(condition, code):
    if not condition:
        raise ScoringTestBoundaryError(code)


def _digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=True,
                                    separators=(",", ":"), allow_nan=False).encode("utf-8")).hexdigest()


def verify_approval(run):
    """Reject drift between the registered approval and current run settings."""
    audit = run.get("approvalAudit")
    _require(isinstance(audit, dict) and audit.get("hashFormat") == "python-json-sort-ascii-v1",
             "approval-required")
    approved = audit.get("approvedSpecification")
    _require(isinstance(approved, dict) and set(approved) == {"run", "executionManifest"},
             "invalid-approved-specification")
    original = validate_run(approved["run"])
    _require(original["status"] == "disabled", "invalid-original-approval-state")
    validate_execution_manifest(approved["executionManifest"], original)
    _require(audit.get("actorUid") == original["approvedByUid"], "approval-actor-mismatch")
    _require(audit.get("approvalHash") == _digest(approved), "approval-hash-mismatch")
    # Status is the only registered field allowed to transition independently.
    # Counters/timestamps are separate, unapproved runtime fields.
    for key, value in original.items():
        if key != "status":
            _require(run.get(key) == value, "approved-run-drift")
    return audit["approvalHash"]


class ScoringTestTransferService:
    """Private immutable block staging, not final game commit/publication.

    The small per-block ceiling is deliberate for Firestore binary storage.
    Whole games must use a future manifest, never one expanding document.
    """
    BLOCK_LIMIT = 128 * 1024

    def __init__(self, registry, read_transport=None):
        self.registry = registry
        self.transport = read_transport

    def _authorized(self, ref, *, uid, match_id, operation, transaction=None):
        _require(os.environ.get("SCORING_TEST_SERVER_ENABLED") == "true", "server-test-disabled")
        raw = ref.get(transaction=transaction).to_dict()
        run = authorize_run(raw, uid=uid, match_id=match_id, operation=operation,
                            project_id=self.registry.project_id, api_origin=self.registry.api_origin,
                            now_ms=time.time_ns() // 1000000)
        _require(run["runId"] == ref.id, "registry-id-mismatch")
        return run, verify_approval(run)

    def read(self, run_id, *, uid, match_id, request_id, path):
        ref = self.registry._ref(run_id)
        _, approval_hash = self._authorized(ref, uid=uid, match_id=match_id, operation="read")
        _require(self.transport is not None and self.transport.origin == self.registry.api_origin,
                 "transport-target-mismatch")
        _require(isinstance(path, str) and path in self.transport.paths, "outbound-path-not-approved")
        payload_hash = _digest({"matchId": match_id, "path": path, "approvalHash": approval_hash})
        self.registry.reserve(run_id, uid=uid, match_id=match_id, operation="read",
                              request_id=request_id, payload_hash=payload_hash)
        # Recheck after reservation, and again before returning potentially
        # sensitive bytes. No caching or official publication happens here.
        _, before = self._authorized(ref, uid=uid, match_id=match_id, operation="read")
        _require(before == approval_hash, "approval-changed")
        body = self.transport.get(path)
        _, after = self._authorized(ref, uid=uid, match_id=match_id, operation="read")
        _require(after == approval_hash, "approval-changed")
        return body

    def stage_block(self, run_id, *, uid, match_id, request_id, source, expected_bytes, expected_sha256,
                    writer_session_id, lock_epoch):
        from firebase_admin import firestore
        from scoring_test_sessions import assert_writer

        ref = self.registry._ref(run_id)
        _, approval_hash = self._authorized(ref, uid=uid, match_id=match_id, operation="record")
        session_ref = ref.collection("writerSessions").document(match_id)

        def check_session(session):
            assert_writer(session, uid=uid, writer_session_id=writer_session_id, lock_epoch=lock_epoch)
            _require(session.get("runId") == run_id and session.get("matchId") == match_id,
                     "writer-scope-mismatch")
            _require(session.get("approvalHash") == approval_hash, "writer-approval-mismatch")

        check_session(session_ref.get().to_dict())
        _require(isinstance(expected_sha256, str) and re.fullmatch(r"[0-9a-f]{64}", expected_sha256),
                 "invalid-upload-hash")
        # Scope the content address to a match; identical bytes in another match
        # must not reuse its document or reveal its existence.
        block_id = _digest({"matchId": match_id, "sha256": expected_sha256})
        payload_hash = _digest({"blockId": block_id, "size": expected_bytes,
                                "sha256": expected_sha256, "approvalHash": approval_hash,
                                "writerSessionId": writer_session_id, "lockEpoch": lock_epoch})
        with verified_upload(source, expected_bytes=expected_bytes, expected_sha256=expected_sha256,
                             max_bytes=self.BLOCK_LIMIT) as staged:
            body = staged.read()
            # Avoid consuming budget for a writer already known to be obsolete.
            # The transactional check below remains authoritative for races.
            check_session(session_ref.get().to_dict())
            self.registry.reserve(run_id, uid=uid, match_id=match_id, operation="record",
                                  request_id=request_id, payload_hash=payload_hash, upload_bytes=len(body))
            receipt_ref = ref.collection("requestReservations").document(hashlib.sha256(request_id.encode()).hexdigest())
            block_ref = ref.collection("uploadBlocks").document(block_id)

            @firestore.transactional
            def commit(transaction):
                _, current_approval = self._authorized(ref, uid=uid, match_id=match_id,
                                                       operation="record", transaction=transaction)
                _require(current_approval == approval_hash, "approval-changed")
                check_session(session_ref.get(transaction=transaction).to_dict())
                receipt = receipt_ref.get(transaction=transaction).to_dict()
                existing = block_ref.get(transaction=transaction).to_dict()
                binding = {"requestId": request_id, "uid": uid, "matchId": match_id,
                           "operation": "record", "payloadHash": payload_hash, "uploadBytes": len(body)}
                _require(isinstance(receipt, dict) and all(receipt.get(key) == value for key, value in binding.items()),
                         "upload-reservation-mismatch")
                content = {"schemaVersion": 1, "runId": run_id, "matchId": match_id,
                           "blockId": block_id, "sha256": expected_sha256, "size": len(body), "body": body}
                if existing is not None:
                    _require(all(existing.get(key) == value for key, value in content.items()), "immutable-block-conflict")
                else:
                    transaction.create(block_ref, {**content, "createdByUid": uid,
                                                  "approvalHash": approval_hash,
                                                  "writerSessionId": writer_session_id, "lockEpoch": lock_epoch,
                                                  "createdAtMs": time.time_ns() // 1000000})
                return {"blockId": block_id, "sha256": expected_sha256, "size": len(body),
                        "replayed": existing is not None, "published": False,
                        "writerSessionId": writer_session_id, "lockEpoch": lock_epoch}

            return run_transaction(self.registry.db, commit)
