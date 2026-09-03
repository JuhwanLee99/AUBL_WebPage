from __future__ import annotations

import unittest

from scripts.allstar_result_perf import run_benchmark


class ResultPerformanceHarnessTests(unittest.TestCase):
    def test_small_rehearsal_exercises_integrity_contract(self) -> None:
        report = run_benchmark(
            25,
            max_aggregation_seconds=30,
            max_peak_mib=256,
        )
        self.assertTrue(report["passed"])
        self.assertEqual(report["ballots"], 25)
        self.assertEqual(report["candidateCount"], 90)
        self.assertEqual(report["contestCount"], 14)
        self.assertEqual(report["selectedCandidateReferences"], 25 * 24)
        self.assertEqual(report["eligibilityDocuments"], 25)
        self.assertTrue(report["checks"]["integrity"])

    def test_rehearsal_rejects_counts_above_production_limit(self) -> None:
        with self.assertRaises(ValueError):
            run_benchmark(20_001)


if __name__ == "__main__":
    unittest.main()
