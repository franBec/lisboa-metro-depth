from __future__ import annotations

import json
import math
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "web" / "public" / "data" / "v1"


class DummyDataTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.manifest = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
        cls.stations = json.loads((DATA / "stations.json").read_text(encoding="utf-8"))
        cls.network = json.loads((DATA / "network.json").read_text(encoding="utf-8"))

    def test_manifest_contract(self) -> None:
        self.assertEqual(self.manifest["schema_version"], 1)
        self.assertTrue(self.manifest["demo"])
        measured = self.manifest["counts"].get("measured_platforms", 0) + self.manifest[
            "counts"
        ].get("measured_segments", 0)
        self.assertEqual(self.manifest["capabilities"]["measured_depths"], measured > 0)
        self.assertFalse(self.manifest["capabilities"]["real_terrain"])
        self.assertEqual(self.manifest["counts"]["stations"], len(self.stations))
        self.assertEqual(self.manifest["counts"]["lines"], len(self.network["lines"]))
        segments = [segment for line in self.network["lines"] for segment in line["segments"]]
        self.assertEqual(self.manifest["counts"]["segments"], len(segments))

    def test_stations_and_platforms(self) -> None:
        self.assertEqual(len(self.stations), 50)
        seen = set()
        for station in self.stations:
            self.assertNotIn(station["id"], seen)
            seen.add(station["id"])
            self.assertTrue(station["platforms"])
            self.assertEqual(
                sorted(station["lines"]),
                sorted(platform["line"] for platform in station["platforms"]),
            )
            for platform in station["platforms"]:
                if platform["depth_source"] == "unknown":
                    self.assertIsNone(platform["platform_depth_m"])
                else:
                    self.assertIsNotNone(platform["platform_depth_m"])
                    self.assertGreaterEqual(platform["platform_depth_m"], 0)

    def test_alameda_is_two_platforms(self) -> None:
        alameda = next(station for station in self.stations if station["id"] == "alameda")
        self.assertEqual(sorted(alameda["lines"]), ["C", "D"])
        self.assertEqual(len(alameda["platforms"]), 2)

    def test_network_segments(self) -> None:
        station_ids = {station["id"] for station in self.stations}
        segment_ids = set()
        for line in self.network["lines"]:
            self.assertEqual(len(line["segments"]) > 0, True)
            for segment in line["segments"]:
                self.assertNotIn(segment["id"], segment_ids)
                segment_ids.add(segment["id"])
                self.assertIn(segment["from"], station_ids)
                self.assertIn(segment["to"], station_ids)
                expected_id = f"{line['id']}:{'-'.join(sorted((segment['from'], segment['to'])))}"
                self.assertEqual(segment["id"], expected_id)
                self.assertGreaterEqual(len(segment["vertices"]), 2)
                distances = [vertex["distance_m"] for vertex in segment["vertices"]]
                self.assertEqual(distances, sorted(distances))
                for vertex in segment["vertices"]:
                    self.assertFalse(math.isnan(vertex["lat"]))
                    self.assertFalse(math.isnan(vertex["lon"]))
                    self.assertFalse(math.isnan(vertex["surface_elevation_m"]))
                    if vertex["depth_m"] is not None:
                        self.assertFalse(math.isnan(vertex["depth_m"]))
                if segment["depth_source"] == "unknown":
                    self.assertTrue(all(vertex["depth_m"] is None for vertex in segment["vertices"]))
                else:
                    self.assertTrue(all(vertex["depth_m"] is not None for vertex in segment["vertices"]))

    def test_grade_cap(self) -> None:
        for line in self.network["lines"]:
            for segment in line["segments"]:
                vertices = segment["vertices"]
                for first, second in zip(vertices, vertices[1:]):
                    if first["depth_m"] is None or second["depth_m"] is None:
                        continue
                    horizontal = abs(second["distance_m"] - first["distance_m"])
                    vertical = abs(second["depth_m"] - first["depth_m"])
                    self.assertLessEqual(vertical, horizontal * 0.04 + 0.02, segment["id"])

    def test_provenance_counts(self) -> None:
        segments = [segment for line in self.network["lines"] for segment in line["segments"]]
        estimated = sum(segment["depth_source"] == "estimated" for segment in segments)
        unknown = sum(segment["depth_source"] == "unknown" for segment in segments)
        for source in ("measured", "estimated", "unknown"):
            expected = sum(segment["depth_source"] == source for segment in segments)
            self.assertEqual(self.manifest["provenance_counts"]["segments"][source], expected)
        self.assertGreater(estimated, 0)
        self.assertGreater(unknown, 0)

    def test_terrain_assets(self) -> None:
        terrain = self.manifest["terrain"]
        expected_bytes = terrain["width"] * terrain["height"] * 4
        self.assertEqual((DATA / "terrain.bin").stat().st_size, expected_bytes)
        self.assertGreater((DATA / "ground.png").stat().st_size, 50_000)
        self.assertGreater(terrain["max_m"], terrain["min_m"])
        self.assertEqual(terrain["kind"], "synthetic-illustrative")

    def test_crossing_segments_exist(self) -> None:
        segment_ids = {
            segment["id"] for line in self.network["lines"] for segment in line["segments"]
        }
        for expected in (
            "C:alameda-areeiro",
            "C:alameda-arroios",
            "D:alameda-olaias",
            "D:alameda-saldanha",
        ):
            self.assertIn(expected, segment_ids)


if __name__ == "__main__":
    unittest.main()
