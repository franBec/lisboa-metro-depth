from __future__ import annotations

import csv
import json
import math
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "web" / "public" / "data" / "v1"

with open(ROOT / "pipeline" / "curated" / "station_structure.csv", encoding="utf-8") as _handle:
    NON_UNDERGROUND = {
        row["station_id"] for row in csv.DictReader(_handle) if row["structure"] != "underground"
    }


class DummyDataTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.manifest = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
        cls.stations = json.loads((DATA / "stations.json").read_text(encoding="utf-8"))
        cls.network = json.loads((DATA / "network.json").read_text(encoding="utf-8"))
        cls.landmarks = json.loads((DATA / "landmarks.json").read_text(encoding="utf-8"))
        with open(
            ROOT / "pipeline" / "curated" / "station_elevations.csv",
            encoding="utf-8",
            newline="",
        ) as handle:
            cls.ground_elevations = {
                row["station_id"]: float(row["elevation_m"])
                for row in csv.DictReader(handle)
            }

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
            self.assertAlmostEqual(
                station["ground_elevation_m"],
                self.ground_elevations[station["id"]],
                places=1,
            )
            self.assertTrue(station["ground_elevation_source"])
            for platform in station["platforms"]:
                self.assertAlmostEqual(
                    platform["ground_elevation_m"],
                    station["ground_elevation_m"],
                )
                if platform["depth_source"] == "unknown":
                    self.assertIsNone(platform["platform_depth_m"])
                else:
                    self.assertIsNotNone(platform["platform_depth_m"])
                    if station["id"] not in NON_UNDERGROUND:
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

    def test_landmarks(self) -> None:
        with open(ROOT / "pipeline" / "curated" / "landmarks.csv", encoding="utf-8", newline="") as handle:
            curated = {row["id"]: row for row in csv.DictReader(handle)}
        bbox = self.manifest["bbox"]
        self.assertEqual(self.manifest["counts"]["landmarks"], len(self.landmarks))
        seen = set()
        for landmark in self.landmarks:
            self.assertNotIn(landmark["id"], seen)
            seen.add(landmark["id"])
            self.assertIn(landmark["id"], curated)
            row = curated[landmark["id"]]
            self.assertEqual(landmark["name"], row["name"])
            self.assertEqual(landmark["kind"], row["kind"])
            self.assertAlmostEqual(landmark["lat"], float(row["lat"]), places=5)
            self.assertAlmostEqual(landmark["lon"], float(row["lon"]), places=5)
            self.assertIn(landmark["kind"], ("landmark", "park", "water"))
            self.assertTrue(
                bbox["min_lat"] < landmark["lat"] < bbox["max_lat"]
                and bbox["min_lon"] < landmark["lon"] < bbox["max_lon"],
                landmark["id"],
            )
            self.assertFalse(math.isnan(landmark["surface_elevation_m"]))
            self.assertGreaterEqual(landmark["surface_elevation_m"], 0.0)

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

    @staticmethod
    def _bearing(first: dict, second: dict) -> float:
        dx = (second["lon"] - first["lon"]) * 111_320 * math.cos(
            math.radians(first["lat"])
        )
        dz = (second["lat"] - first["lat"]) * 110_540
        return (math.degrees(math.atan2(dx, dz)) + 360) % 360

    def test_parallel_interchanges(self) -> None:
        station_by_id = {station["id"]: station for station in self.stations}
        segments_by_line = {
            line["id"]: line["segments"] for line in self.network["lines"]
        }

        for station_id, line_ids in (
            ("baixa-chiado", ("A", "C")),
            ("campo-grande", ("B", "C")),
        ):
            station = station_by_id[station_id]
            interchange = station["interchange"]
            self.assertEqual(interchange["kind"], "parallel")
            self.assertIn(station["structure"], ("underground", "overground"))

            platforms = {platform["line"]: platform for platform in station["platforms"]}
            first, second = (platforms[line_id] for line_id in line_ids)
            dx = (second["lon"] - first["lon"]) * 111_320 * math.cos(
                math.radians(first["lat"])
            )
            dz = (second["lat"] - first["lat"]) * 110_540
            self.assertAlmostEqual(
                math.hypot(dx, dz), interchange["spacing_m"], delta=0.6
            )

            center_lat = (first["lat"] + second["lat"]) / 2
            center_lon = (first["lon"] + second["lon"]) / 2
            bearing = math.radians(interchange["axis_bearing_deg"])
            along = (math.sin(bearing), math.cos(bearing))
            right = (math.cos(bearing), -math.sin(bearing))
            for platform in platforms.values():
                px = (platform["lon"] - center_lon) * 111_320 * math.cos(
                    math.radians(center_lat)
                )
                pz = (platform["lat"] - center_lat) * 110_540
                self.assertAlmostEqual(
                    px * along[0] + pz * along[1], 0.0, delta=0.6
                )
                self.assertAlmostEqual(
                    abs(px * right[0] + pz * right[1]),
                    interchange["spacing_m"] / 2,
                    delta=0.6,
                )

            for line_id in line_ids:
                platform = platforms[line_id]
                unique: dict[tuple[float, float], dict] = {}
                for segment in segments_by_line[line_id]:
                    for vertex in segment["vertices"]:
                        key = (round(vertex["lat"], 9), round(vertex["lon"], 9))
                        unique.setdefault(key, vertex)
                vertices = list(unique.values())

                def distance_to_platform(vertex: dict) -> float:
                    return math.hypot(
                        (vertex["lat"] - platform["lat"]) * 110_540,
                        (vertex["lon"] - platform["lon"])
                        * 111_320
                        * math.cos(math.radians(platform["lat"])),
                    )

                station_vertex = min(vertices, key=distance_to_platform)
                station_distance = station_vertex["distance_m"]
                before = max(
                    (
                        vertex
                        for vertex in vertices
                        if vertex["distance_m"] < station_distance
                    ),
                    key=lambda vertex: vertex["distance_m"],
                )
                after = min(
                    (
                        vertex
                        for vertex in vertices
                        if vertex["distance_m"] > station_distance
                    ),
                    key=lambda vertex: vertex["distance_m"],
                )
                bearing = self._bearing(before, after)
                difference = abs(bearing - interchange["axis_bearing_deg"]) % 180
                self.assertLess(
                    min(difference, 180 - difference),
                    1.5,
                    f"{station_id}/{line_id}: bearing {bearing:.1f} does not match axis",
                )

                ax = (before["lon"] - platform["lon"]) * 111_320 * math.cos(
                    math.radians(platform["lat"])
                )
                az = (before["lat"] - platform["lat"]) * 110_540
                bx = (after["lon"] - platform["lon"]) * 111_320 * math.cos(
                    math.radians(platform["lat"])
                )
                bz = (after["lat"] - platform["lat"]) * 110_540
                length = math.hypot(bx - ax, bz - az)
                offset = (
                    abs(ax * (bz - az) - az * (bx - ax)) / length
                    if length
                    else 0.0
                )
                self.assertLess(
                    offset,
                    1.0,
                    f"{station_id}/{line_id}: platform is {offset:.2f} m off its track",
                )


if __name__ == "__main__":
    unittest.main()
