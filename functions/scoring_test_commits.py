"""Private manifest commit engine. Not a public scoring or official writer."""
import hashlib
import os
import re
import time
from copy import deepcopy

from scoring_test_boundary import ScoringTestBoundaryError
from scoring_test_sessions import assert_writer
from scoring_test_transfer import ScoringTestTransferService, _digest
from scoring_test_transactions import run_transaction


def _require(condition, code):
    if not condition:
        raise ScoringTestBoundaryError(code)


def _integer(value):
    return type(value) is int and 0 <= value <= 9007199254740991


def _hash(value):
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def validate_manifest(raw, match_id):
    fields = {"version", "matchId", "ruleProfileVersion", "engineVersion", "projectionVersion", "blocks"}
    _require(isinstance(raw, dict) and set(raw) == fields, "invalid-manifest")
    _require(type(raw["version"]) is int and raw["version"] == 1 and raw["matchId"] == match_id,
             "manifest-scope-mismatch")
    for key in ("ruleProfileVersion", "engineVersion", "projectionVersion"):
        _require(isinstance(raw[key], str) and re.fullmatch(r"[A-Za-z0-9_.:-]{1,128}", raw[key]),
                 "invalid-manifest-version")
    blocks = raw["blocks"]
    _require(isinstance(blocks, list) and 4 <= len(blocks) <= 64, "invalid-manifest-blocks")
    kinds, identities, total = set(), set(), 0
    for block in blocks:
        _require(isinstance(block, dict) and set(block) == {"kind", "blockId", "sha256", "size"},
                 "invalid-block-descriptor")
        kind = block["kind"]
        _require(isinstance(kind, str) and kind in ("state", "feed", "events", "stats"), "invalid-block-kind")
        _require(_hash(block["blockId"]) and _hash(block["sha256"]), "invalid-block-hash")
        _require(_integer(block["size"]) and block["size"] <= ScoringTestTransferService.BLOCK_LIMIT,
                 "invalid-block-size")
        identity = (kind, block["blockId"])
        _require(identity not in identities, "duplicate-manifest-block")
        identities.add(identity)
        kinds.add(kind)
        total += block["size"]
    _require(kinds == {"state", "feed", "events", "stats"}, "incomplete-manifest")
    _require(total <= 8 * 1024 * 1024, "manifest-too-large")
    return deepcopy(raw)


class ScoringTestCommits:
    def __init__(self, registry):
        self.registry = registry
        self.boundary = ScoringTestTransferService(registry)

    def commit(self, run_id, *, uid, match_id, writer_session_id, lock_epoch, request_id,
               expected_revision, first_input_sequence, last_input_sequence, manifest, payload_hash):
        from firebase_admin import firestore

        _require(os.environ.get("SCORING_TEST_COMMIT_ENABLED") == "true", "test-commit-disabled")
        _require(isinstance(request_id, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,128}", request_id), "invalid-commit-request-id")
        _require(_integer(expected_revision) and expected_revision < 9007199254740991, "invalid-revision")
        _require(_integer(first_input_sequence) and _integer(last_input_sequence)
                 and 1 <= first_input_sequence <= last_input_sequence, "invalid-input-sequence")
        normalized = validate_manifest(manifest, match_id)
        _require(_hash(payload_hash) and payload_hash == _digest(normalized), "manifest-hash-mismatch")
        ref = self.registry._ref(run_id)
        _, approval_hash = self.boundary._authorized(ref, uid=uid, match_id=match_id, operation="record")
        session_ref = ref.collection("writerSessions").document(match_id)
        head_ref = ref.collection("scoringHeads").document(match_id)
        request_key = hashlib.sha256(request_id.encode()).hexdigest()
        receipt_ref = head_ref.collection("receipts").document(request_key)
        binding = {"runId": run_id, "matchId": match_id, "uid": uid, "writerSessionId": writer_session_id,
                   "lockEpoch": lock_epoch, "requestId": request_id, "expectedRevision": expected_revision,
                   "firstInputSequence": first_input_sequence, "lastInputSequence": last_input_sequence,
                   "payloadHash": payload_hash, "approvalHash": approval_hash}
        commit_id = _digest(binding)
        manifest_ref = head_ref.collection("manifests").document(commit_id)

        @firestore.transactional
        def apply(transaction):
            _, current_approval = self.boundary._authorized(ref, uid=uid, match_id=match_id,
                                                           operation="record", transaction=transaction)
            _require(current_approval == approval_hash, "approval-changed")
            session = session_ref.get(transaction=transaction).to_dict()
            assert_writer(session, uid=uid, writer_session_id=writer_session_id, lock_epoch=lock_epoch)
            _require(session.get("runId") == run_id and session.get("matchId") == match_id
                     and session.get("approvalHash") == approval_hash, "writer-scope-mismatch")
            head = head_ref.get(transaction=transaction).to_dict()
            receipt = receipt_ref.get(transaction=transaction).to_dict()
            if receipt is not None:
                _require(all(receipt.get(key) == value for key, value in binding.items()), "commit-request-conflict")
                _require(isinstance(head, dict) and _integer(head.get("revision")), "missing-commit-head")
                return {**receipt, "replayed": True, "headRevision": head["revision"]}
            revision = 0 if head is None else head.get("revision")
            _require(_integer(revision) and revision == expected_revision, "commit-revision-conflict")
            if head is not None:
                _require(head.get("runId") == run_id and head.get("matchId") == match_id
                         and head.get("status") == "private", "invalid-commit-head")
                _require(not head.get("sealed"), "commit-head-sealed")
                _require(head.get("ruleProfileVersion") == normalized["ruleProfileVersion"], "rule-profile-changed")
            same_writer = (head is not None and head.get("writerSessionId") == writer_session_id
                           and head.get("lockEpoch") == lock_epoch)
            previous_sequence = head.get("lastInputSequence") if same_writer else 0
            _require(_integer(previous_sequence) and first_input_sequence == previous_sequence + 1,
                     "input-sequence-gap")
            for descriptor in normalized["blocks"]:
                block = ref.collection("uploadBlocks").document(descriptor["blockId"]).get(transaction=transaction).to_dict()
                _require(isinstance(block, dict) and block.get("runId") == run_id
                         and block.get("matchId") == match_id, "missing-or-foreign-block")
                body = block.get("body")
                _require(isinstance(body, bytes) and len(body) == descriptor["size"]
                         and block.get("size") == descriptor["size"]
                         and block.get("sha256") == descriptor["sha256"]
                         and hashlib.sha256(body).hexdigest() == descriptor["sha256"], "commit-block-integrity-failed")
                _require(block.get("blockId") == descriptor["blockId"]
                         and descriptor["blockId"] == _digest({"matchId": match_id, "sha256": descriptor["sha256"]}),
                         "commit-block-address-mismatch")
            now = time.time_ns() // 1000000
            revision += 1
            ack = {**binding, "commitId": commit_id, "committedRevision": revision, "committedAtMs": now}
            transaction.create(manifest_ref, {**normalized, "runId": run_id, "commitId": commit_id,
                "revision": revision, "parentCommitId": None if head is None else head["commitId"],
                "payloadHash": payload_hash, "approvalHash": approval_hash})
            transaction.create(receipt_ref, ack)
            transaction.set(head_ref, {"runId": run_id, "matchId": match_id, "status": "private",
                "revision": revision, "commitId": commit_id, "payloadHash": payload_hash,
                "writerSessionId": writer_session_id, "lockEpoch": lock_epoch,
                "lastInputSequence": last_input_sequence, "ruleProfileVersion": normalized["ruleProfileVersion"],
                "updatedAtMs": now})
            return {**ack, "replayed": False, "headRevision": revision}

        return run_transaction(self.registry.db, apply)
