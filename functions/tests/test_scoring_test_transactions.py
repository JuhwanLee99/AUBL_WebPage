"""Retry budget and error classification, independent of emulator timing."""
import unittest
from unittest.mock import Mock, patch

from google.api_core.exceptions import Aborted, DeadlineExceeded, PermissionDenied
from scoring_test_boundary import ScoringTestBoundaryError
from scoring_test_transactions import run_transaction


def exhausted():
    error = ValueError("Failed to commit transaction in 1 attempts.")
    error.__cause__ = Aborted("contention")
    return error


class TransactionRetryTests(unittest.TestCase):
    def setUp(self):
        self.db = Mock()
        self.db.transaction.side_effect = lambda **kwargs: object()
        sleeper = patch("scoring_test_transactions.time.sleep")
        self.sleep = sleeper.start()
        self.addCleanup(sleeper.stop)

    def test_success_no_delay(self):
        callback = Mock(return_value="committed")
        self.assertEqual(run_transaction(self.db, callback), "committed")
        self.db.transaction.assert_called_once_with(max_attempts=1)
        self.sleep.assert_not_called()

    def test_wrapped_contention_uses_fresh_transaction(self):
        callback = Mock(side_effect=[exhausted(), "committed"])
        self.assertEqual(run_transaction(self.db, callback), "committed")
        first, second = callback.call_args_list
        self.assertIsNot(first.args[0], second.args[0])
        self.assertEqual(self.sleep.call_count, 1)

    def test_direct_aborted_retries(self):
        callback = Mock(side_effect=[Aborted("read contention"), "committed"])
        self.assertEqual(run_transaction(self.db, callback), "committed")
        self.assertEqual(callback.call_count, 2)

    def test_five_attempt_cap(self):
        callback = Mock(side_effect=lambda transaction: (_ for _ in ()).throw(exhausted()))
        with self.assertRaises(ValueError):
            run_transaction(self.db, callback)
        self.assertEqual(callback.call_count, 5)
        self.assertEqual(self.sleep.call_count, 4)
        for call in self.sleep.call_args_list:
            self.assertGreaterEqual(call.args[0], 0.05)
            self.assertLessEqual(call.args[0], 0.8)

    def test_business_and_unknown_outcome_not_retried(self):
        for error in (ScoringTestBoundaryError("request-rate-exhausted"), ValueError("invalid"),
                      PermissionDenied("denied"), DeadlineExceeded("unknown outcome")):
            callback = Mock(side_effect=error)
            with self.subTest(error=type(error).__name__), self.assertRaises(type(error)):
                run_transaction(self.db, callback)
            self.assertEqual(callback.call_count, 1)
        self.sleep.assert_not_called()
