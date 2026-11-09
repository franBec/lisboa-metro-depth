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

from merge import _apply_profiles, _cap_grades, merge_data  # noqa: E402
from read_log import SegmentProfile  # noqa: E402


class IngestMergeTest(unittest.TestCase):
    def test_crossing_fixture_merges_only_target_segments(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "v1"
            shutil.copytree(DATA, target)
            before_manifest = json.loads((target / "manifest.json").read_text(encoding="utf-8"))
            before_network = json.loads((target / "network.json").read_text(encoding="utf-8"))
            before_stations = json.loads((target / "stations.json").read_text(encoding="utf-8"))

            with self.assertWarnsRegex(UserWarning, "C:alameda-areeiro.*4% grade cap"):
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

            targeted_segments = {
                "C:alameda-areeiro",
                "C:alameda-arroios",
                "D:alameda-olaias",
                "D:alameda-saldanha",
            }
            already_measured = {
                segment["id"]
                for line in before_network["lines"]
                for segment in line["segments"]
                if segment["depth_source"] == "measured"
            }
            expected_segments = targeted_segments | already_measured
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
                if segment_id in targeted_segments:
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
            self.assertIn(saldanha_platforms["B"]["depth_source"], ("official", "measured"))

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


    def test_cap_grades_preserves_platform_anchors(self) -> None:
        """Anchor drag regression: interior barometric noise above both anchors
        used to pull the end anchor up to the grade cap.
        """
        distances = [0.0, 400.0, 800.0, 1200.0]
        depths = [3.43, 30.0, 30.0, 0.0]
        capped = _cap_grades(depths, distances)
        self.assertAlmostEqual(capped[0], 3.43)
        self.assertAlmostEqual(capped[-1], 0.0)

    def test_profile_smoothing_keeps_signed_anchors_and_direction(self) -> None:
        vertices = [
            {"lat": 38.0, "lon": -9.0, "distance_m": 0.0, "surface_elevation_m": 10.0,
             "depth_m": None, "source": "unknown"},
            {"lat": 38.001, "lon": -9.001, "distance_m": 200.0, "surface_elevation_m": 12.0,
             "depth_m": None, "source": "unknown"},
            {"lat": 38.002, "lon": -9.0, "distance_m": 400.0, "surface_elevation_m": 10.0,
             "depth_m": None, "source": "unknown"},
        ]
        points = [(0.0, -5.0), (0.1, 10.0), (0.25, 12.0), (0.5, 14.0),
                  (0.75, 13.0), (0.9, 11.0), (1.0, 3.0)]

        def apply(from_station: str, to_station: str, samples: list[tuple[float, float]]) -> list[dict]:
            segment = {"id": "B:a-b", "from": "a", "to": "b", "vertices": [dict(v) for v in vertices]}
            network = {"lines": [{"id": "B", "segments": [segment]}]}
            profile = SegmentProfile("B", from_station, to_station, samples, ["survey:1"])
            self.assertEqual(_apply_profiles(network, {segment["id"]: profile}), 1)
            return segment["vertices"]

        forward = apply("a", "b", points)
        reverse = apply("b", "a", [(1.0 - t, depth) for t, depth in reversed(points)])
        self.assertEqual(forward, reverse)
        self.assertEqual((forward[0]["depth_m"], forward[-1]["depth_m"]), (-5.0, 3.0))
        self.assertGreater(len(forward), len(vertices))
        for original in vertices:
            self.assertTrue(any(v["lat"] == original["lat"] and v["lon"] == original["lon"] for v in forward))
        for first, second in zip(forward, forward[1:]):
            level1 = first["surface_elevation_m"] - first["depth_m"]
            level2 = second["surface_elevation_m"] - second["depth_m"]
            self.assertLessEqual(abs(level2 - level1), 0.04 * (second["distance_m"] - first["distance_m"]) + 0.02)
        for first, second in ((forward[0], forward[1]), (forward[-2], forward[-1])):
            level1 = first["surface_elevation_m"] - first["depth_m"]
            level2 = second["surface_elevation_m"] - second["depth_m"]
            self.assertLess(abs(level2 - level1), 0.01 * (second["distance_m"] - first["distance_m"]))

    def test_infeasible_grade_keeps_anchors_and_warns(self) -> None:
        with self.assertWarnsRegex(UserWarning, "exceed the 4% grade cap"):
            result = _cap_grades([0.0, 1.0, 10.0], [0.0, 50.0, 100.0])
        self.assertEqual(result, [0.0, 5.0, 10.0])

    def test_measured_platform_joins(self) -> None:
        stations = json.loads((DATA / "stations.json").read_text(encoding="utf-8"))
        network = json.loads((DATA / "network.json").read_text(encoding="utf-8"))
        platforms = {
            (platform["line"], station["id"]): platform
            for station in stations for platform in station["platforms"]
        }
        for line in network["lines"]:
            for segment in line["segments"]:
                if segment["depth_source"] != "measured":
                    continue
                for station_id, vertex in ((segment["from"], segment["vertices"][0]),
                                           (segment["to"], segment["vertices"][-1])):
                    platform = platforms[(line["id"], station_id)]
                    self.assertAlmostEqual(vertex["depth_m"], platform["platform_depth_m"], places=2)

    def test_repeated_merge_does_not_change_geometry(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "v1"
            shutil.copytree(DATA, target)
            log = ROOT / "data" / "measurements" / "field" / "LX_1446.csv"
            merge_data(target, log)
            first = json.loads((target / "network.json").read_text(encoding="utf-8"))
            merge_data(target, log)
            second = json.loads((target / "network.json").read_text(encoding="utf-8"))
            self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
