"""Consistent private commit reconstruction; no public endpoint or cache."""
import hashlib
import os
import re

from scoring_test_boundary import ScoringTestBoundaryError
from scoring_test_commits import validate_manifest
from scoring_test_transfer import ScoringTestTransferService, _digest
from scoring_test_transactions import run_transaction


def _require(condition, code):
    if not condition:
        raise ScoringTestBoundaryError(code)


class ScoringTestReadback:
    def __init__(self, registry):
        self.registry = registry
        self.boundary = ScoringTestTransferService(registry)

    def read(self, run_id, *, uid, match_id, expected_revision=None):
        from firebase_admin import firestore

        _require(os.environ.get("SCORING_TEST_READBACK_ENABLED") == "true", "test-readback-disabled")
        _require(expected_revision is None or (type(expected_revision) is int
                 and 1 <= expected_revision <= 9007199254740991), "invalid-readback-revision")
        ref = self.registry._ref(run_id)
        self.boundary._authorized(ref, uid=uid, match_id=match_id, operation="read")
        head_ref = ref.collection("scoringHeads").document(match_id)

        @firestore.transactional
        def reconstruct(transaction):
            _, approval_hash = self.boundary._authorized(ref, uid=uid, match_id=match_id,
                                                         operation="read", transaction=transaction)
            head = head_ref.get(transaction=transaction).to_dict()
            _require(isinstance(head, dict), "committed-record-not-found")
            _require(head.get("runId") == run_id and head.get("matchId") == match_id
                     and head.get("status") == "private", "invalid-readback-head")
            revision, commit_id = head.get("revision"), head.get("commitId")
            _require(type(revision) is int and 1 <= revision <= 9007199254740991, "invalid-readback-head")
            _require(isinstance(commit_id, str) and re.fullmatch(r"[0-9a-f]{64}", commit_id), "invalid-readback-head")
            _require(expected_revision is None or expected_revision == revision, "readback-revision-changed")
            manifest = head_ref.collection("manifests").document(commit_id).get(transaction=transaction).to_dict()
            _require(isinstance(manifest, dict), "committed-manifest-not-found")
            _require(manifest.get("runId") == run_id and manifest.get("matchId") == match_id
                     and manifest.get("commitId") == commit_id and type(manifest.get("revision")) is int
                     and manifest["revision"] == revision, "readback-manifest-binding-mismatch")
            _require(manifest.get("approvalHash") == approval_hash, "readback-approval-mismatch")
            source_fields = ("version", "matchId", "ruleProfileVersion", "engineVersion", "projectionVersion", "blocks")
            normalized = validate_manifest({key: manifest.get(key) for key in source_fields}, match_id)
            digest = _digest(normalized)
            _require(manifest.get("payloadHash") == digest and head.get("payloadHash") == digest,
                     "readback-manifest-hash-mismatch")
            _require(head.get("ruleProfileVersion") == normalized["ruleProfileVersion"], "readback-profile-mismatch")
            groups = {kind: [] for kind in ("state", "feed", "events", "stats")}
            # Same content may intentionally appear in different projection
            # groups. Read once within this snapshot, preserve descriptor order.
            loaded = {}
            for descriptor in normalized["blocks"]:
                block_id = descriptor["blockId"]
                if block_id not in loaded:
                    loaded[block_id] = ref.collection("uploadBlocks").document(block_id).get(transaction=transaction).to_dict()
                block = loaded[block_id]
                _require(isinstance(block, dict) and block.get("runId") == run_id
                         and block.get("matchId") == match_id and block.get("blockId") == block_id,
                         "readback-block-missing-or-foreign")
                body = block.get("body")
                _require(isinstance(body, bytes) and type(block.get("size")) is int
                         and block["size"] == descriptor["size"] and len(body) == descriptor["size"]
                         and block.get("sha256") == descriptor["sha256"]
                         and hashlib.sha256(body).hexdigest() == descriptor["sha256"], "readback-block-integrity-failed")
                _require(block_id == _digest({"matchId": match_id, "sha256": descriptor["sha256"]}),
                         "readback-block-address-mismatch")
                groups[descriptor["kind"]].append(body)
            return {"runId": run_id, "matchId": match_id, "revision": revision, "commitId": commit_id,
                    "payloadHash": digest, "approvalHash": approval_hash,
                    "ruleProfileVersion": normalized["ruleProfileVersion"],
                    "engineVersion": normalized["engineVersion"], "projectionVersion": normalized["projectionVersion"],
                    "blocksByKind": groups, "published": False}

        return run_transaction(self.registry.db, reconstruct)
