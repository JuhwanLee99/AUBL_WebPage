"""Internal single-writer sessions. No automatic takeover or public endpoint."""
import hashlib
import re
import time

from scoring_test_boundary import ScoringTestBoundaryError
from scoring_test_transfer import ScoringTestTransferService
from scoring_test_transactions import run_transaction


def _require(condition, code):
    if not condition:
        raise ScoringTestBoundaryError(code)


def _session_id(value):
    return isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value) is not None


def assert_writer(session, *, uid, writer_session_id, lock_epoch):
    """Call in the final write transaction, not just once before upload."""
    _require(isinstance(session, dict) and session.get("status") == "active", "writer-not-active")
    _require(type(lock_epoch) is int and 1 <= lock_epoch <= 9007199254740991, "invalid-lock-epoch")
    _require(session.get("uid") == uid and session.get("writerSessionId") == writer_session_id
             and type(session.get("lockEpoch")) is int and session["lockEpoch"] == lock_epoch,
             "writer-session-mismatch")


class ScoringTestWriterSessions:
    def __init__(self, registry):
        self.registry = registry
        self.boundary = ScoringTestTransferService(registry)

    def acquire(self, run_id, *, uid, match_id, writer_session_id):
        from firebase_admin import firestore

        _require(_session_id(writer_session_id), "invalid-writer-session-id")
        ref = self.registry._ref(run_id)
        # Validate match membership before using it in a document path.
        self.boundary._authorized(ref, uid=uid, match_id=match_id, operation="record")
        session_ref = ref.collection("writerSessions").document(match_id)

        @firestore.transactional
        def commit(transaction):
            _, approval_hash = self.boundary._authorized(ref, uid=uid, match_id=match_id,
                                                         operation="record", transaction=transaction)
            previous = session_ref.get(transaction=transaction).to_dict()
            if previous is not None:
                assert_writer(previous, uid=uid, writer_session_id=writer_session_id,
                              lock_epoch=previous.get("lockEpoch"))
                _require(previous.get("approvalHash") == approval_hash, "writer-approval-mismatch")
                return {"writerSessionId": writer_session_id, "lockEpoch": previous["lockEpoch"], "replayed": True}
            transaction.create(session_ref, {"version": 1, "runId": run_id, "matchId": match_id,
                "uid": uid, "writerSessionId": writer_session_id, "lockEpoch": 1, "status": "active",
                "approvalHash": approval_hash, "updatedAtMs": time.time_ns() // 1000000})
            return {"writerSessionId": writer_session_id, "lockEpoch": 1, "replayed": False}

        return run_transaction(self.registry.db, commit)

    def handoff(self, run_id, *, actor_uid, operator_authorized, match_id, request_id,
                expected_epoch, next_uid, next_writer_session_id):
        from firebase_admin import firestore

        _require(operator_authorized is True, "test-operator-required")
        _require(_session_id(request_id) and _session_id(next_writer_session_id), "invalid-handoff-id")
        _require(type(expected_epoch) is int and 1 <= expected_epoch < 9007199254740991, "invalid-lock-epoch")
        ref = self.registry._ref(run_id)
        self.boundary._authorized(ref, uid=actor_uid, match_id=match_id, operation="review")
        session_ref = ref.collection("writerSessions").document(match_id)
        receipt_ref = ref.collection("writerHandoffs").document(hashlib.sha256(request_id.encode()).hexdigest())
        binding = {"requestId": request_id, "matchId": match_id, "actorUid": actor_uid,
                   "expectedEpoch": expected_epoch, "nextUid": next_uid,
                   "nextWriterSessionId": next_writer_session_id}

        @firestore.transactional
        def commit(transaction):
            run, approval_hash = self.boundary._authorized(ref, uid=actor_uid, match_id=match_id,
                                                          operation="review", transaction=transaction)
            _require(any(person["uid"] == actor_uid and person["role"] == "admin"
                         for person in run["participants"]), "run-admin-required")
            _require("record" in run["operations"] and any(person["uid"] == next_uid
                         and person["role"] in ("admin", "scorer") for person in run["participants"]),
                     "next-writer-not-authorized")
            current = session_ref.get(transaction=transaction).to_dict()
            receipt = receipt_ref.get(transaction=transaction).to_dict()
            if receipt is not None:
                _require(all(receipt.get(key) == value for key, value in binding.items()), "handoff-request-conflict")
                # This is the historical receipt, not a claim to still own the
                # latest session after a subsequent handoff.
                return {"writerSessionId": next_writer_session_id, "lockEpoch": receipt["lockEpoch"], "replayed": True}
            _require(isinstance(current, dict) and current.get("status") == "active", "writer-not-active")
            _require(type(current.get("lockEpoch")) is int and current["lockEpoch"] == expected_epoch,
                     "writer-epoch-conflict")
            _require(current.get("approvalHash") == approval_hash, "writer-approval-mismatch")
            _require(current.get("writerSessionId") != next_writer_session_id, "handoff-needs-new-session-id")
            epoch = expected_epoch + 1
            now = time.time_ns() // 1000000
            transaction.update(session_ref, {"uid": next_uid, "writerSessionId": next_writer_session_id,
                                            "lockEpoch": epoch, "updatedAtMs": now})
            transaction.create(receipt_ref, {**binding, "lockEpoch": epoch, "approvalHash": approval_hash,
                "previousUid": current["uid"], "previousWriterSessionId": current["writerSessionId"], "createdAtMs": now})
            return {"writerSessionId": next_writer_session_id, "lockEpoch": epoch, "replayed": False}

        return run_transaction(self.registry.db, commit)
