from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline" / "dummy"))

from structures import load_station_structures  # noqa: E402

CURATED = ROOT / "pipeline" / "curated" / "station_structure.csv"


class StationStructureTest(unittest.TestCase):
    def test_elevated_and_at_grade_stations(self) -> None:
        structures = load_station_structures(CURATED)
        self.assertEqual(structures["campo-grande"], "overground")
        self.assertEqual(structures["senhor-roubado"], "overground")
        self.assertEqual(structures["odivelas"], "at-grade")

    def test_unlisted_stations_have_no_structure(self) -> None:
        structures = load_station_structures(CURATED)
        self.assertNotIn("alameda", structures)
        self.assertNotIn("baixa-chiado", structures)

    def test_conflicting_rows_fail(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "structures.csv"
            path.write_text(
                "station_id,line_id,structure,height_above_street_m,source,note\n"
                "odivelas,B,at-grade,,test,\n"
                "odivelas,B,overground,,test,\n"
            )
            with self.assertRaises(ValueError):
                load_station_structures(path)

    def test_unknown_structure_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "structures.csv"
            path.write_text(
                "station_id,line_id,structure,height_above_street_m,source,note\n"
                "odivelas,B,shallow,,test,\n"
            )
            with self.assertRaises(ValueError):
                load_station_structures(path)


if __name__ == "__main__":
    unittest.main()
