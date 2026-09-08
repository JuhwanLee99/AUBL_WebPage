"""Bounded fresh-transaction retry for confirmed Firestore contention only."""
import random
import time


def run_transaction(db, transactional_callback):
    from google.api_core.exceptions import Aborted

    for attempt in range(5):
        try:
            # The SDK rolls back before raising. Disable its immediate retry
            # loop so each attempt releases locks before an independent retry.
            return transactional_callback(db.transaction(max_attempts=1))
        except (Aborted, ValueError) as error:
            contention = isinstance(error, Aborted) or (
                type(error) is ValueError and isinstance(error.__cause__, Aborted))
            if not contention or attempt == 4:
                raise
            # Same five-attempt budget, with jitter outside the transaction.
            # Unknown commit outcomes and business rejections are never retried.
            time.sleep(random.uniform(0.05, min(0.8, 0.1 * (2 ** attempt))))
