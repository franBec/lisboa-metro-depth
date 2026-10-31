from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "web" / "public" / "data" / "v1"
FIXTURE = ROOT / "pipeline" / "ingest" / "tests" / "fixtures" / "crossing_sample.csv"
sys.path.insert(0, str(ROOT / "pipeline" / "ingest"))

from merge import merge_data  # noqa: E402


class IngestMergeTest(unittest.TestCase):
    def test_crossing_fixture_merges_only_target_segments(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "v1"
            shutil.copytree(DATA, target)
            before_manifest = json.loads((target / "manifest.json").read_text(encoding="utf-8"))
            before_network = json.loads((target / "network.json").read_text(encoding="utf-8"))
            before_stations = json.loads((target / "stations.json").read_text(encoding="utf-8"))

            result = merge_data(target, FIXTURE)

            manifest = json.loads((target / "manifest.json").read_text(encoding="utf-8"))
            network = json.loads((target / "network.json").read_text(encoding="utf-8"))
            stations = json.loads((target / "stations.json").read_text(encoding="utf-8"))

            self.assertEqual(result["platform_records"], 6)
            self.assertEqual(result["segment_records"], 4)
            self.assertTrue(manifest["capabilities"]["measured_depths"])
            self.assertTrue(manifest["demo"])
            expected_version = before_manifest["dataset_version"].split("+")[0] + "+measured"
            self.assertEqual(manifest["dataset_version"], expected_version)

            expected_segments = {
                "C:alameda-areeiro",
                "C:alameda-arroios",
                "D:alameda-olaias",
                "D:alameda-saldanha",
            }
            after_segments = {
                segment["id"]: segment
                for line in network["lines"]
                for segment in line["segments"]
            }
            before_segments = {
                segment["id"]: segment
                for line in before_network["lines"]
                for segment in line["segments"]
            }
            measured = {
                segment_id
                for segment_id, segment in after_segments.items()
                if segment["depth_source"] == "measured"
            }
            self.assertEqual(measured, expected_segments)

            for segment_id, before_segment in before_segments.items():
                if segment_id in expected_segments:
                    continue
                self.assertEqual(after_segments[segment_id], before_segment)

            alameda = next(station for station in stations if station["id"] == "alameda")
            platforms = {platform["line"]: platform for platform in alameda["platforms"]}
            self.assertEqual(platforms["C"]["platform_depth_m"], 30.0)
            self.assertEqual(platforms["D"]["platform_depth_m"], 35.0)
            self.assertEqual(platforms["C"]["depth_source"], "measured")
            self.assertEqual(platforms["D"]["depth_source"], "measured")
            self.assertEqual(platforms["D"]["platform_depth_m"] - platforms["C"]["platform_depth_m"], 5.0)

            saldanha = next(station for station in stations if station["id"] == "saldanha")
            saldanha_platforms = {platform["line"]: platform for platform in saldanha["platforms"]}
            self.assertEqual(saldanha_platforms["D"]["depth_source"], "measured")
            self.assertEqual(saldanha_platforms["D"]["official_depth_m"], 19.95)
            self.assertEqual(saldanha_platforms["B"]["depth_source"], "official")

            self.assertAlmostEqual(after_segments["C:alameda-areeiro"]["vertices"][0]["depth_m"], 18.0)
            self.assertAlmostEqual(after_segments["C:alameda-areeiro"]["vertices"][-1]["depth_m"], 30.0)
            self.assertAlmostEqual(after_segments["C:alameda-arroios"]["vertices"][0]["depth_m"], 30.0)
            self.assertAlmostEqual(after_segments["C:alameda-arroios"]["vertices"][-1]["depth_m"], 22.0)
            self.assertAlmostEqual(after_segments["D:alameda-saldanha"]["vertices"][0]["depth_m"], 19.95)
            self.assertAlmostEqual(after_segments["D:alameda-saldanha"]["vertices"][-1]["depth_m"], 35.0)
            self.assertAlmostEqual(after_segments["D:alameda-olaias"]["vertices"][0]["depth_m"], 35.0)
            self.assertAlmostEqual(after_segments["D:alameda-olaias"]["vertices"][-1]["depth_m"], 25.0)

            unknown_stations = {
                station["id"]: station
                for station in before_stations
                if all(platform["platform_depth_m"] is None for platform in station["platforms"])
            }
            after_stations = {station["id"]: station for station in stations}
            affected = {'alameda', 'areeiro', 'arroios', 'olaias'}
            for station_id, before_station in unknown_stations.items():
                if station_id in affected:
                    continue
                self.assertEqual(after_stations[station_id], before_station)


if __name__ == "__main__":
    unittest.main()
