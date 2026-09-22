"""Callable boundary unit tests: no Admin client, tokens, network or DB writes."""
import base64
import hashlib
import os
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from scoring_test_boundary import ScoringTestBoundaryError
from scoring_test_transfer import _digest
from scoring_test_rpc import dispatch_scoring_test_writer, scoring_test_writer_from_request, _registry


class RpcTests(unittest.TestCase):
    def setUp(self):
        self.env = dict(SCORING_TEST_RPC_ENABLED="true", FUNCTIONS_EMULATOR="true", SCORING_TEST_SERVER_ENABLED="true",
            SCORING_TEST_COMMIT_ENABLED="true", GCLOUD_PROJECT="demo-aubl-scoring",
            FIRESTORE_EMULATOR_HOST="127.0.0.1:8088", FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9098")
        self.enterContext(patch.dict(os.environ, self.env, clear=True))
        self.registry = Mock(project_id="demo-aubl-scoring", api_origin="https://scoring-emulator.invalid")
        self.factory = Mock(return_value=self.registry)
        self.sessions = self.enterContext(patch("scoring_test_rpc.ScoringTestWriterSessions")).return_value
        self.sessions.acquire.return_value = dict(writerSessionId="tab", lockEpoch=1, replayed=False)
        self.transfer_class = self.enterContext(patch("scoring_test_rpc.ScoringTestTransferService"))
        self.transfer_class.BLOCK_LIMIT = 128 * 1024
        self.transfer = self.transfer_class.return_value
        self.commits = self.enterContext(patch("scoring_test_rpc.ScoringTestCommits")).return_value
        self.token = dict(aud="demo-aubl-scoring", sub="scorer", iss="https://securetoken.google.com/demo-aubl-scoring")
        self.data = dict(action="acquire", runId="TEST_RUN_RPC", matchId="TEST_SCORING_RPC", writerSessionId="tab", requestId="request")

    def req(self):
        return SimpleNamespace(data=self.data, auth=SimpleNamespace(uid="scorer", token=self.token))

    def call(self):
        return dispatch_scoring_test_writer(self.req(), self.factory)

    def denied_before_db(self, code):
        with self.assertRaisesRegex(ScoringTestBoundaryError, code):
            self.call()
        self.factory.assert_not_called()

    def test_acquire_uses_authenticated_uid_and_reserves(self):
        result = self.call()
        self.assertEqual(result["uid"], "scorer")
        self.sessions.acquire.assert_called_once_with("TEST_RUN_RPC", uid="scorer", match_id="TEST_SCORING_RPC", writer_session_id="tab")
        self.registry.reserve.assert_called_once()
        self.transfer._authorized.assert_called_once()

    def test_missing_auth(self):
        req = self.req(); req.auth = None
        with self.assertRaisesRegex(ScoringTestBoundaryError, "unauthenticated"):
            dispatch_scoring_test_writer(req, self.factory)
        self.factory.assert_not_called()

    def test_token_project_mismatch(self):
        self.token["aud"] = "aubl-backup"; self.denied_before_db("rpc-auth-project-mismatch")

    def test_token_uid_mismatch(self):
        self.token["sub"] = "admin"; self.denied_before_db("rpc-auth-project-mismatch")

    def test_token_issuer_mismatch(self):
        self.token["iss"] = "https://example.invalid"; self.denied_before_db("rpc-auth-project-mismatch")

    def test_payload_uid_spoofing(self):
        self.data["uid"] = "admin"; self.denied_before_db("invalid-rpc-fields")

    def test_no_arbitrary_operation(self):
        self.data["action"] = "promote"; self.denied_before_db("invalid-rpc-fields")

    def test_no_arbitrary_path(self):
        self.data["matchId"] = "matches/real"; self.denied_before_db("invalid-rpc-scope")

    def test_run_authorization_denial_does_not_dispatch(self):
        self.transfer._authorized.side_effect = ScoringTestBoundaryError("not-a-participant")
        with self.assertRaisesRegex(ScoringTestBoundaryError, "not-a-participant"): self.call()
        self.sessions.acquire.assert_not_called(); self.registry.reserve.assert_not_called()

    def test_budget_denial_does_not_acquire(self):
        self.registry.reserve.side_effect = ScoringTestBoundaryError("request-budget-exhausted")
        with self.assertRaisesRegex(ScoringTestBoundaryError, "request-budget-exhausted"): self.call()
        self.sessions.acquire.assert_not_called()

    def upload(self):
        self.data.update(action="upload", lockEpoch=1, bodyBase64=base64.b64encode(b"{}").decode(), size=2,
                         sha256=hashlib.sha256(b"{}").hexdigest())

    def test_upload_passes_bounded_bytes_and_writer(self):
        self.upload(); self.call()
        args = self.transfer.stage_block.call_args.kwargs
        self.assertEqual(args["source"].read(), b"{}"); self.assertEqual(args["uid"], "scorer")
        self.assertEqual(args["lock_epoch"], 1); self.registry.reserve.assert_not_called()

    def test_invalid_base64(self):
        self.upload(); self.data["bodyBase64"] = "###"; self.denied_before_db("invalid-upload-body")

    def test_oversized_block(self):
        self.upload(); self.data["size"] = 128 * 1024 + 1; self.denied_before_db("invalid-upload-size")

    def test_size_mismatch(self):
        self.upload(); self.data["size"] = 1; self.denied_before_db("upload-size-mismatch")

    def test_boolean_epoch(self):
        self.upload(); self.data["lockEpoch"] = True; self.denied_before_db("invalid-lock-epoch")

    def commit(self):
        manifest = dict(version=1, matchId=self.data["matchId"], ruleProfileVersion="test", engineVersion="test", projectionVersion="test",
            blocks=[dict(kind=kind, blockId=str(index) * 64, sha256="a" * 64, size=2)
                    for index, kind in enumerate(("state", "feed", "events", "stats"), 1)])
        self.data.update(action="commit", lockEpoch=1, expectedRevision=0, firstInputSequence=1, lastInputSequence=1,
                         manifest=manifest, payloadHash=_digest(manifest))

    def test_commit_contract_and_budget(self):
        self.commit(); self.commits.commit.return_value = {"LOCAL_ACK": True}
        self.assertEqual(self.call(), {"LOCAL_ACK": True})
        args = self.commits.commit.call_args.kwargs
        self.assertEqual(args["first_input_sequence"], 1); self.assertEqual(args["uid"], "scorer")
        self.registry.reserve.assert_called_once()

    def test_commit_hash_mismatch(self):
        self.commit(); self.data["payloadHash"] = "b" * 64; self.denied_before_db("manifest-hash-mismatch")

    def test_commit_flag_disabled(self):
        self.commit(); os.environ["SCORING_TEST_COMMIT_ENABLED"] = "false"; self.denied_before_db("test-commit-disabled")

    def test_internal_error_is_redacted(self):
        with patch("scoring_test_rpc.dispatch_scoring_test_writer", side_effect=RuntimeError("PRIVATE_TOKEN")):
            with self.assertRaises(Exception) as caught: scoring_test_writer_from_request(self.req())
        self.assertEqual(caught.exception.message, "scoring-test-rpc-failed")

    def test_local_registry_uses_anonymous_credentials_without_adc(self):
        from google.auth.credentials import AnonymousCredentials
        with patch("google.cloud.firestore.Client") as client, patch("google.auth.default", side_effect=AssertionError("ADC forbidden")):
            registry = _registry("demo-aubl-scoring")
        self.assertIs(registry.db, client.return_value)
        self.assertEqual(client.call_args.kwargs["project"], "demo-aubl-scoring")
        self.assertIsInstance(client.call_args.kwargs["credentials"], AnonymousCredentials)

    def test_direct_registry_factory_rejects_production_project(self):
        with patch("google.cloud.firestore.Client") as client:
            with self.assertRaisesRegex(ScoringTestBoundaryError, "rpc-project-mismatch"):
                _registry("aubl-backup")
            client.assert_not_called()

    def test_direct_registry_factory_rejects_external_host(self):
        os.environ["FIRESTORE_EMULATOR_HOST"] = "external.invalid:8188"
        with patch("google.cloud.firestore.Client") as client:
            with self.assertRaisesRegex(ScoringTestBoundaryError, "rpc-emulator-required"):
                _registry("demo-aubl-scoring")
            client.assert_not_called()

    def test_direct_registry_factory_requires_functions_emulator(self):
        os.environ["FUNCTIONS_EMULATOR"] = "false"
        with patch("google.cloud.firestore.Client") as client:
            with self.assertRaisesRegex(ScoringTestBoundaryError, "rpc-project-mismatch"):
                _registry("demo-aubl-scoring")
            client.assert_not_called()


def env_test(key, value, expected):
    def case(self):
        os.environ[key] = value; self.denied_before_db(expected)
    return case

for index, values in enumerate([
    ("SCORING_TEST_RPC_ENABLED", "false", "rpc-disabled"),
    ("FUNCTIONS_EMULATOR", "false", "rpc-disabled"),
    ("SCORING_TEST_SERVER_ENABLED", "false", "rpc-disabled"),
    ("GCLOUD_PROJECT", "aubl-backup", "rpc-project-mismatch"),
    ("FIRESTORE_EMULATOR_HOST", "prod.invalid:8088", "rpc-emulator-required"),
    ("FIREBASE_AUTH_EMULATOR_HOST", "", "rpc-emulator-required"),
    ("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8088/path", "rpc-emulator-required"),
    ("FIRESTORE_EMULATOR_HOST", "127.0.0.1:0", "rpc-emulator-required"),
]):
    setattr(RpcTests, f"test_environment_boundary_{index}", env_test(*values))
