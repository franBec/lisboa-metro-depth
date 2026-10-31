from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIELD = ROOT / "data" / "measurements" / "field" / "LX_3193.csv"
sys.path.insert(0, str(ROOT / "pipeline" / "ingest"))

from read_log import aggregate, read_log  # noqa: E402


class FieldMeasurementTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.rows = read_log(FIELD)
        cls.platforms, cls.profiles = aggregate(cls.rows)

    def test_platform_depths_are_positive(self) -> None:
        expected = {
            ("C", "areeiro"): 8.96,
            ("C", "alameda"): 6.82,
            ("C", "arroios"): 6.42,
            ("D", "alameda"): 17.55,
            ("D", "olaias"): 20.21,
            ("D", "saldanha"): 19.60,
        }
        self.assertEqual(set(self.platforms), set(expected))
        for key, depth in expected.items():
            self.assertAlmostEqual(self.platforms[key].depth_m, depth, places=2)

    def test_alameda_crossing_gap(self) -> None:
        gap = self.platforms[("D", "alameda")].depth_m - self.platforms[("C", "alameda")].depth_m
        self.assertAlmostEqual(gap, 10.73, places=2)

    def test_segment_endpoints_use_platform_anchors(self) -> None:
        expected = {
            "C:alameda-areeiro": (6.82, 8.96),
            "C:alameda-arroios": (6.42, 6.82),
            "D:alameda-olaias": (20.21, 17.55),
            "D:alameda-saldanha": (17.55, 19.60),
        }
        self.assertEqual(set(self.profiles), set(expected))
        for segment_id, (start, end) in expected.items():
            profile = self.profiles[segment_id]
            self.assertAlmostEqual(profile.points[0][1], start, places=2)
            self.assertAlmostEqual(profile.points[-1][1], end, places=2)


if __name__ == "__main__":
    unittest.main()
