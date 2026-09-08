"""Private storage checkpoint sealing; not baseball completion certification."""
import hashlib
import os
import re
import time

from scoring_test_boundary import ScoringTestBoundaryError
from scoring_test_commits import validate_manifest
from scoring_test_sessions import assert_writer
from scoring_test_transfer import ScoringTestTransferService, _digest
from scoring_test_transactions import run_transaction


def _require(condition, code):
    if not condition:
        raise ScoringTestBoundaryError(code)


class ScoringTestSeals:
    def __init__(self, registry):
        self.registry = registry
        self.boundary = ScoringTestTransferService(registry)

    def seal(self, run_id, *, uid, match_id, writer_session_id, lock_epoch, request_id,
             final_request_id, revision, commit_id, payload_hash, last_input_sequence):
        from firebase_admin import firestore

        _require(os.environ.get("SCORING_TEST_SEAL_ENABLED") == "true", "test-seal-disabled")
        for value in (request_id, final_request_id):
            _require(isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value), "invalid-seal-request-id")
        for value in (revision, lock_epoch, last_input_sequence):
            _require(type(value) is int and 1 <= value <= 9007199254740991, "invalid-seal-sequence")
        for value in (commit_id, payload_hash):
            _require(isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value), "invalid-seal-hash")
        ref = self.registry._ref(run_id)
        _, approval_hash = self.boundary._authorized(ref, uid=uid, match_id=match_id, operation="record")
        head_ref = ref.collection("scoringHeads").document(match_id)
        session_ref = ref.collection("writerSessions").document(match_id)
        receipt_ref = head_ref.collection("receipts").document(hashlib.sha256(final_request_id.encode()).hexdigest())
        seal_ref = head_ref.collection("seals").document(hashlib.sha256(request_id.encode()).hexdigest())
        binding = {"runId": run_id, "matchId": match_id, "uid": uid, "writerSessionId": writer_session_id,
            "lockEpoch": lock_epoch, "requestId": request_id, "finalRequestId": final_request_id,
            "revision": revision, "commitId": commit_id, "payloadHash": payload_hash,
            "lastInputSequence": last_input_sequence, "approvalHash": approval_hash}
        seal_id = _digest(binding)

        @firestore.transactional
        def apply(transaction):
            _, current_approval = self.boundary._authorized(ref, uid=uid, match_id=match_id,
                                                           operation="record", transaction=transaction)
            _require(current_approval == approval_hash, "approval-changed")
            head = head_ref.get(transaction=transaction).to_dict()
            session = session_ref.get(transaction=transaction).to_dict()
            existing = seal_ref.get(transaction=transaction).to_dict()
            _require(isinstance(head, dict) and head.get("status") == "private"
                     and head.get("runId") == run_id and head.get("matchId") == match_id, "seal-head-not-found")
            _require(isinstance(session, dict) and session.get("runId") == run_id
                     and session.get("matchId") == match_id and session.get("approvalHash") == approval_hash,
                     "seal-session-mismatch")
            if existing is not None:
                _require(all(existing.get(key) == value for key, value in binding.items()), "seal-request-conflict")
                _require(head.get("sealed") is True and head.get("sealId") == seal_id
                         and session.get("status") == "sealed" and session.get("sealId") == seal_id,
                         "incomplete-seal-state")
                return {**existing, "replayed": True}
            assert_writer(session, uid=uid, writer_session_id=writer_session_id, lock_epoch=lock_epoch)
            _require(not head.get("sealed"), "already-sealed")
            for key, value in (("revision", revision), ("commitId", commit_id), ("payloadHash", payload_hash),
                               ("writerSessionId", writer_session_id), ("lockEpoch", lock_epoch),
                               ("lastInputSequence", last_input_sequence)):
                _require(head.get(key) == value, "seal-head-changed")
            receipt = receipt_ref.get(transaction=transaction).to_dict()
            expected_receipt = {"runId": run_id, "matchId": match_id, "uid": uid,
                "writerSessionId": writer_session_id, "lockEpoch": lock_epoch,
                "requestId": final_request_id, "committedRevision": revision, "commitId": commit_id,
                "payloadHash": payload_hash, "lastInputSequence": last_input_sequence, "approvalHash": approval_hash}
            _require(isinstance(receipt, dict) and all(receipt.get(key) == value for key, value in expected_receipt.items()),
                     "seal-final-receipt-mismatch")
            manifest = head_ref.collection("manifests").document(commit_id).get(transaction=transaction).to_dict()
            _require(isinstance(manifest, dict) and manifest.get("runId") == run_id
                     and manifest.get("commitId") == commit_id and manifest.get("revision") == revision
                     and manifest.get("approvalHash") == approval_hash, "seal-manifest-mismatch")
            fields = ("version", "matchId", "ruleProfileVersion", "engineVersion", "projectionVersion", "blocks")
            normalized = validate_manifest({key: manifest.get(key) for key in fields}, match_id)
            _require(_digest(normalized) == payload_hash and manifest.get("payloadHash") == payload_hash,
                     "seal-manifest-hash-mismatch")
            for descriptor in normalized["blocks"]:
                block = ref.collection("uploadBlocks").document(descriptor["blockId"]).get(transaction=transaction).to_dict()
                _require(isinstance(block, dict) and block.get("runId") == run_id
                         and block.get("matchId") == match_id, "seal-block-missing-or-foreign")
                body = block.get("body")
                _require(isinstance(body, bytes) and len(body) == descriptor["size"]
                         and block.get("size") == descriptor["size"]
                         and block.get("sha256") == descriptor["sha256"]
                         and hashlib.sha256(body).hexdigest() == descriptor["sha256"]
                         and block.get("blockId") == descriptor["blockId"]
                         and descriptor["blockId"] == _digest({"matchId": match_id, "sha256": descriptor["sha256"]}),
                         "seal-block-integrity-failed")
            now = time.time_ns() // 1000000
            result = {**binding, "sealId": seal_id, "sealedAtMs": now,
                      "sealKind": "storage-checkpoint", "published": False}
            transaction.create(seal_ref, result)
            transaction.update(head_ref, {"sealed": True, "sealId": seal_id, "sealedAtMs": now})
            transaction.update(session_ref, {"status": "sealed", "sealId": seal_id, "updatedAtMs": now})
            return {**result, "replayed": False}

        return run_transaction(self.registry.db, apply)
