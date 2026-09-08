"""Faults injected at the real emulator commit RPC client boundary."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from threading import Barrier
from unittest.mock import patch

from google.api_core.exceptions import DeadlineExceeded, ServiceUnavailable
import test_scoring_commits_emulator as commits
from scoring_test_boundary import ScoringTestBoundaryError
from scoring_test_transfer import _digest


class CommitFaultsEmulatorTests(commits.CommitsEmulatorTests):
    def test_rpc_failure_before_commit_has_no_partial_writes(self):
        self.prepare_commit()
        # The real SDK builds the transaction; its commit RPC is then rejected
        # before reaching the emulator. Reads/rollback remain real emulator RPCs.
        with patch.object(self.registry.db._firestore_api, "commit", side_effect=ServiceUnavailable("injected pre-commit outage")) as rpc:
            with self.assertRaises(ServiceUnavailable):
                self.commit()
        self.assertEqual(rpc.call_count, 1)
        self.assert_empty_commit()
        self.assertEqual(self.commit()["committedRevision"], 1)

    def test_rpc_response_loss_after_server_commit_replays_once(self):
        self.prepare_commit()
        actual_commit = self.registry.db._firestore_api.commit
        delivered = []
        def lose_response(*args, **kwargs):
            response = actual_commit(*args, **kwargs)
            delivered.append(response)
            raise DeadlineExceeded("injected loss after emulator commit")
        with patch.object(self.registry.db._firestore_api, "commit", side_effect=lose_response) as rpc:
            with self.assertRaises(DeadlineExceeded):
                self.commit()
        self.assertEqual(rpc.call_count, 1)
        self.assertEqual(len(delivered), 1)
        before = self.head.get().to_dict()
        self.assertEqual(before["revision"], 1)
        replay = self.commit()
        self.assertTrue(replay["replayed"])
        self.assertEqual(replay["committedRevision"], 1)
        self.assertEqual(self.head.get().to_dict(), before)
        for name in ("manifests", "receipts"):
            self.assertEqual(len(list(self.head.collection(name).stream())), 1)

    def test_same_request_concurrent_commit_is_idempotent(self):
        self.prepare_commit()
        barrier = Barrier(2)
        def attempt(_):
            barrier.wait(timeout=10)
            return self.commit()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(attempt, range(2)))
        self.assertEqual(sum(not result["replayed"] for result in results), 1)
        self.assertEqual(len({result["commitId"] for result in results}), 1)
        self.assertEqual(self.head.get().to_dict()["revision"], 1)
        for name in ("manifests", "receipts"):
            self.assertEqual(len(list(self.head.collection(name).stream())), 1)

    def test_new_writer_sequence_restarts_but_game_revision_continues(self):
        self.prepare_commit()
        self.commit(last_input_sequence=3)
        self.handoff()
        args = dict(writer_session_id="tab_two", lock_epoch=2, request_id="after_handoff", expected_revision=1)
        with self.assertRaisesRegex(ScoringTestBoundaryError, "input-sequence-gap"):
            self.commit(**args, first_input_sequence=4, last_input_sequence=4)
        result = self.commit(**args)
        self.assertEqual(result["committedRevision"], 2)
        self.assertEqual(self.head.get().to_dict()["lastInputSequence"], 1)

    def test_rule_profile_change_preserves_previous_commit(self):
        self.prepare_commit()
        self.commit()
        before = self.head.get().to_dict()
        changed = deepcopy(self.manifest)
        changed["ruleProfileVersion"] = "other-profile"
        with self.assertRaisesRegex(ScoringTestBoundaryError, "rule-profile-changed"):
            self.commit(request_id="profile_change", expected_revision=1, first_input_sequence=2,
                        last_input_sequence=2, manifest=changed, payload_hash=_digest(changed))
        self.assertEqual(self.head.get().to_dict(), before)
        for name in ("manifests", "receipts"):
            self.assertEqual(len(list(self.head.collection(name).stream())), 1)

    def test_stop_racing_final_commit(self):
        self.prepare_commit()
        barrier = Barrier(2)
        def commit():
            barrier.wait(timeout=10)
            try:
                return self.commit()
            except ScoringTestBoundaryError as error:
                return str(error)
        def stop():
            barrier.wait(timeout=10)
            return self.registry.stop(self.run["runId"], actor_uid="admin", operator_authorized=True)
        with ThreadPoolExecutor(max_workers=2) as pool:
            pending = pool.submit(commit)
            stopped = pool.submit(stop)
            result, stopped_result = pending.result(), stopped.result()
        self.assertEqual(stopped_result["status"], "stopped")
        if isinstance(result, dict):
            self.assertEqual(self.head.get().to_dict()["revision"], 1)
            for name in ("manifests", "receipts"):
                self.assertEqual(len(list(self.head.collection(name).stream())), 1)
        else:
            self.assertEqual(result, "run-not-active")
            self.assert_empty_commit()
        with self.assertRaisesRegex(ScoringTestBoundaryError, "run-not-active"):
            self.commit(request_id="late_commit")
