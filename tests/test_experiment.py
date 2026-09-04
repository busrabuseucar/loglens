import unittest
from pathlib import Path

from loglens import analyze, parse_csv
from loglens.experiment import run_r3_experiment


class R3ExperimentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sample = Path("dist/sample.csv").read_text()

    def test_first_failure_leaves_at_one_second_past_boundary(self):
        exact = run_r3_experiment(self.sample, 300)
        outside = run_r3_experiment(self.sample, 301)
        self.assertTrue(exact["active"])
        self.assertEqual(exact["inWindowRows"], [118, 119, 121])
        self.assertFalse(outside["active"])
        self.assertEqual(outside["inWindowRows"], [119, 121])
        self.assertEqual((exact["findings"], outside["findings"]), (4, 3))

    def test_original_and_late_downloads_reproduce_full_dataset_counts(self):
        for delay, expected in [(160, 4), (600, 3)]:
            exp = run_r3_experiment(self.sample, delay)
            parsed = parse_csv(exp["csv"])
            self.assertEqual(len(parsed["events"]), 161)
            self.assertFalse(parsed["errors"])
            self.assertEqual(len(analyze(parsed["events"])["alerts"]), expected)
        self.assertEqual(len(analyze(parse_csv(self.sample)["events"])["alerts"]), 4)

    def test_invalid_controls_are_rejected(self):
        for delay in [159, 601, 300.5, "300", True]:
            with self.assertRaises(ValueError):
                run_r3_experiment(self.sample, delay)
