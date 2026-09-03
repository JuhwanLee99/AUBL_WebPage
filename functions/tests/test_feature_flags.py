from __future__ import annotations

import unittest
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch

from firebase_functions import https_fn

from feature_flags import FEATURE_FLAG_SCHEMA_VERSION
from feature_flags import parse_allstar_feature
from feature_flags import require_allstar_feature_enabled
from allstar_admin import set_allstar_feature_enabled
from allstar_voting import get_event_config
from allstar_voting import get_vote_results


class _Snapshot:
    def __init__(self, data: object | None, *, exists: bool = True) -> None:
        self.exists = exists
        self._data = data

    def to_dict(self) -> object | None:
        return self._data


class _Document:
    def __init__(self, snapshot: _Snapshot) -> None:
        self.snapshot = snapshot
        self.transactions: list[object | None] = []

    def get(self, transaction: object | None = None) -> _Snapshot:
        self.transactions.append(transaction)
        return self.snapshot


class _Collection:
    def __init__(self, document: _Document) -> None:
        self._document = document

    def document(self, _document_id: str) -> _Document:
        return self._document


class _Database:
    def __init__(self, snapshot: _Snapshot) -> None:
        self.document = _Document(snapshot)

    def collection(self, _collection_id: str) -> _Collection:
        return _Collection(self.document)


class _FailingDocument(_Document):
    def get(self, transaction: object | None = None) -> _Snapshot:
        del transaction
        raise RuntimeError("simulated read failure")


class _FailingDatabase(_Database):
    def __init__(self) -> None:
        self.document = _FailingDocument(_Snapshot(None, exists=False))


class _StoreSnapshot:
    def __init__(self, value: dict[str, object] | None) -> None:
        self.exists = value is not None
        self._value = deepcopy(value)

    def to_dict(self) -> dict[str, object] | None:
        return deepcopy(self._value)


class _StoreDocument:
    def __init__(self, database: _StoreDatabase, path: str) -> None:
        self.database = database
        self.path = path

    def get(self, transaction: object | None = None) -> _StoreSnapshot:
        del transaction
        return _StoreSnapshot(self.database.documents.get(self.path))


class _StoreCollection:
    def __init__(self, database: _StoreDatabase, path: str) -> None:
        self.database = database
        self.path = path

    def document(self, document_id: str | None = None) -> _StoreDocument:
        resolved_id = document_id or f"auto-{self.database.next_id}"
        if document_id is None:
            self.database.next_id += 1
        return _StoreDocument(self.database, f"{self.path}/{resolved_id}")


class _StoreTransaction:
    def __init__(self, database: _StoreDatabase) -> None:
        self.database = database

    def set(self, reference: _StoreDocument, value: dict[str, object]) -> None:
        self.database.documents[reference.path] = deepcopy(value)

    def update(self, reference: _StoreDocument, value: dict[str, object]) -> None:
        existing = deepcopy(self.database.documents.get(reference.path, {}))
        existing.update(deepcopy(value))
        self.database.documents[reference.path] = existing

    def create(self, reference: _StoreDocument, value: dict[str, object]) -> None:
        if reference.path in self.database.documents:
            raise AssertionError("document already exists")
        self.database.documents[reference.path] = deepcopy(value)


class _StoreDatabase:
    def __init__(self, documents: dict[str, dict[str, object]]) -> None:
        self.documents = deepcopy(documents)
        self.next_id = 1

    def collection(self, collection_id: str) -> _StoreCollection:
        return _StoreCollection(self, collection_id)

    def transaction(self) -> _StoreTransaction:
        return _StoreTransaction(self)


def _admin_request(data: dict[str, object]) -> SimpleNamespace:
    return SimpleNamespace(
        data=data,
        auth=SimpleNamespace(uid="admin-user", token={"admin": True}),
    )


class FeatureFlagTests(unittest.TestCase):
    def test_only_exact_valid_true_enables_allstar(self) -> None:
        enabled = parse_allstar_feature(
            _Snapshot(
                {
                    "schemaVersion": FEATURE_FLAG_SCHEMA_VERSION,
                    "enabled": True,
                    "revision": 3,
                }
            )
        )
        self.assertTrue(enabled["enabled"])
        self.assertEqual(enabled["revision"], 3)

        invalid_values = [
            _Snapshot(None, exists=False),
            _Snapshot({"schemaVersion": FEATURE_FLAG_SCHEMA_VERSION, "enabled": "true", "revision": 3}),
            _Snapshot({"schemaVersion": 0, "enabled": True, "revision": 3}),
            _Snapshot({"schemaVersion": FEATURE_FLAG_SCHEMA_VERSION, "enabled": True, "revision": True}),
            _Snapshot({"schemaVersion": FEATURE_FLAG_SCHEMA_VERSION, "enabled": True, "revision": -1}),
            _Snapshot({"schemaVersion": FEATURE_FLAG_SCHEMA_VERSION, "enabled": True, "revision": 0}),
        ]
        for snapshot in invalid_values:
            with self.subTest(snapshot=snapshot.to_dict()):
                self.assertFalse(parse_allstar_feature(snapshot)["enabled"])

    def test_missing_or_invalid_flag_fails_closed(self) -> None:
        database = _Database(_Snapshot(None, exists=False))
        with self.assertRaises(https_fn.HttpsError) as raised:
            require_allstar_feature_enabled(database)
        self.assertEqual(raised.exception.details["reason"], "FEATURE_DISABLED")

        with self.assertRaises(https_fn.HttpsError) as read_failure:
            require_allstar_feature_enabled(_FailingDatabase())
        self.assertEqual(read_failure.exception.details["reason"], "FEATURE_DISABLED")

    def test_transaction_read_is_used_for_submission_gate(self) -> None:
        database = _Database(
            _Snapshot(
                {
                    "schemaVersion": FEATURE_FLAG_SCHEMA_VERSION,
                    "enabled": True,
                    "revision": 7,
                }
            )
        )
        transaction = object()
        state = require_allstar_feature_enabled(database, transaction)
        self.assertTrue(state["enabled"])
        self.assertEqual(database.document.transactions, [transaction])

    def test_public_candidate_and_result_endpoints_are_blocked_before_event_read(self) -> None:
        database = _Database(_Snapshot(None, exists=False))
        with patch("allstar_voting.admin_firestore.client", return_value=database):
            for operation in (get_event_config, get_vote_results):
                with self.subTest(operation=operation.__name__):
                    with self.assertRaises(https_fn.HttpsError) as raised:
                        operation({"eventId": "event", "division": "allstar"})
                    self.assertEqual(raised.exception.details["reason"], "FEATURE_DISABLED")


class FeatureFlagAdminTests(unittest.TestCase):
    def _call(self, database: _StoreDatabase, data: dict[str, object]) -> dict[str, object]:
        with (
            patch("allstar_admin.admin_firestore.client", return_value=database),
            patch("allstar_admin.google_firestore.transactional", side_effect=lambda function: function),
        ):
            return set_allstar_feature_enabled(_admin_request(data))

    def test_activation_requires_phrase_and_existing_event(self) -> None:
        database = _StoreDatabase({})
        with self.assertRaises(https_fn.HttpsError) as confirmation_error:
            self._call(
                database,
                {"eventId": "event", "enabled": True, "expectedRevision": 0},
            )
        self.assertEqual(
            confirmation_error.exception.details["reason"],
            "FEATURE_CONFIRMATION_REQUIRED",
        )

        with self.assertRaises(https_fn.HttpsError) as readiness_error:
            self._call(
                database,
                {
                    "eventId": "event",
                    "enabled": True,
                    "expectedRevision": 0,
                    "confirmation": "올스타 기능 공개",
                },
            )
        self.assertEqual(
            readiness_error.exception.details["reason"],
            "FEATURE_ACTIVATION_NOT_READY",
        )

    def test_activation_changes_only_public_gate(self) -> None:
        database = _StoreDatabase(
            {
                "publicFeatureFlags/allstar": {
                    "schemaVersion": FEATURE_FLAG_SCHEMA_VERSION,
                    "enabled": False,
                    "revision": 6,
                },
                "allstarVotingEvents/event": {
                    "enabled": False,
                    "divisions": {"allstar": {"enabled": False, "status": "DRAFT"}},
                },
            }
        )
        result = self._call(
            database,
            {
                "eventId": "event",
                "enabled": True,
                "expectedRevision": 6,
                "confirmation": "올스타 기능 공개",
            },
        )
        self.assertTrue(result["enabled"])
        self.assertEqual(result["revision"], 7)
        # Turning on the public page must never reopen ballot intake.
        self.assertFalse(database.documents["allstarVotingEvents/event"]["enabled"])
        self.assertFalse(
            database.documents["allstarVotingEvents/event"]["divisions"]["allstar"]["enabled"]
        )

    def test_disable_is_audited_and_closes_event_intake(self) -> None:
        database = _StoreDatabase(
            {
                "publicFeatureFlags/allstar": {
                    "schemaVersion": FEATURE_FLAG_SCHEMA_VERSION,
                    "enabled": True,
                    "revision": 4,
                },
                "allstarVotingEvents/event": {
                    "enabled": True,
                    "divisions": {
                        "allstar": {"enabled": True, "status": "OPEN"},
                        "rookie": {"enabled": True, "status": "DRAFT"},
                    },
                },
            }
        )
        result = self._call(
            database,
            {"eventId": "event", "enabled": False, "expectedRevision": 4},
        )
        self.assertFalse(result["enabled"])
        self.assertEqual(result["revision"], 5)
        event = database.documents["allstarVotingEvents/event"]
        self.assertFalse(event["enabled"])
        self.assertTrue(all(not item["enabled"] for item in event["divisions"].values()))
        audits = [
            value
            for path, value in database.documents.items()
            if path.startswith("featureFlagAudit/")
        ]
        self.assertEqual(len(audits), 1)
        self.assertEqual(audits[0]["actorUid"], "admin-user")
        self.assertEqual(audits[0]["before"], True)
        self.assertEqual(audits[0]["after"], False)

    def test_stale_admin_revision_is_rejected(self) -> None:
        database = _StoreDatabase(
            {
                "publicFeatureFlags/allstar": {
                    "schemaVersion": FEATURE_FLAG_SCHEMA_VERSION,
                    "enabled": False,
                    "revision": 2,
                },
                "allstarVotingEvents/event": {
                    "enabled": False,
                    "divisions": {"allstar": {"enabled": False}},
                },
            }
        )
        with self.assertRaises(https_fn.HttpsError) as raised:
            self._call(
                database,
                {"eventId": "event", "enabled": False, "expectedRevision": 1},
            )
        self.assertEqual(
            raised.exception.details["reason"],
            "FEATURE_FLAG_REVISION_CONFLICT",
        )


if __name__ == "__main__":
    unittest.main()
