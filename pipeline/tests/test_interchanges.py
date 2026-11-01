from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline" / "dummy"))

from interchanges import (  # noqa: E402
    InterchangeTrack,
    deform_shape_for_interchange,
    load_interchanges,
)

LAT0 = 38.700000
LON0 = -9.150000
METERS_PER_DEG_LAT = 110_540.0
METERS_PER_DEG_LON = 111_320.0


def to_latlon(x: float, y: float) -> tuple[float, float]:
    return (
        LAT0 + y / METERS_PER_DEG_LAT,
        LON0 + x / (METERS_PER_DEG_LON * math.cos(math.radians(LAT0))),
    )


def to_local(lat: float, lon: float) -> tuple[float, float]:
    return (
        (lon - LON0) * METERS_PER_DEG_LON * math.cos(math.radians(LAT0)),
        (lat - LAT0) * METERS_PER_DEG_LAT,
    )


def build_shape(offset_m: float) -> list[dict[str, float]]:
    points: list[dict[str, float]] = []
    distance = 0.0
    previous: tuple[float, float] | None = None
    for y in range(-500, 501, 25):
        lat, lon = to_latlon(offset_m, y)
        if previous is not None:
            distance += math.hypot(
                (lat - previous[0]) * METERS_PER_DEG_LAT,
                (lon - previous[1])
                * METERS_PER_DEG_LON
                * math.cos(math.radians(LAT0)),
            )
        points.append({"lat": lat, "lon": lon, "d": distance})
        previous = (lat, lon)
    return points


class InterchangeDeformationTest(unittest.TestCase):
    def test_curated_file_has_two_parallel_interchanges(self) -> None:
        interchanges = load_interchanges(
            ROOT / "pipeline" / "curated" / "interchanges.csv"
        )
        self.assertEqual(set(interchanges), {"baixa-chiado", "campo-grande"})
        for interchange in interchanges.values():
            self.assertEqual(len(interchange.tracks), 2)
            self.assertGreater(interchange.spacing_m, 0)
            self.assertGreater(interchange.platform_length_m, 0)

    def test_window_is_straight_and_offset(self) -> None:
        track = InterchangeTrack(
            station_id="test",
            line_id="T",
            axis_lat=LAT0,
            axis_lon=LON0,
            bearing_deg=0.0,
            offset_m=5.0,
            platform_length_m=100.0,
            platform_width_m=4.5,
            blend_m=100.0,
            structure="underground",
            source="test",
        )
        shape = build_shape(offset_m=30.0)
        deformed, target = deform_shape_for_interchange(shape, track)

        target_x, target_y = to_local(target["lat"], target["lon"])
        self.assertAlmostEqual(target_x, 5.0, delta=0.2)
        self.assertAlmostEqual(target_y, 0.0, delta=0.2)

        near_window = [
            point
            for point in deformed
            if abs(to_local(point["lat"], point["lon"])[1]) <= 55.0
        ]
        self.assertGreaterEqual(len(near_window), 2)
        for point in near_window:
            x, _ = to_local(point["lat"], point["lon"])
            self.assertAlmostEqual(x, 5.0, delta=0.3)

        distances = [point["d"] for point in deformed]
        self.assertEqual(distances, sorted(distances))
        self.assertTrue(all(b > a for a, b in zip(distances, distances[1:])))

        first_x, _ = to_local(deformed[0]["lat"], deformed[0]["lon"])
        last_x, _ = to_local(deformed[-1]["lat"], deformed[-1]["lon"])
        self.assertAlmostEqual(first_x, 30.0, delta=0.3)
        self.assertAlmostEqual(last_x, 30.0, delta=0.3)


if __name__ == "__main__":
    unittest.main()
