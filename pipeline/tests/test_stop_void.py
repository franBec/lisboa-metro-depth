from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline" / "ingest"))

from read_log import extract_segment_profiles  # noqa: E402


def row(
    seq: int,
    record_type: str,
    event: str,
    station: str = "",
    depth: str = "",
    note: str = "",
) -> dict[str, str]:
    return {
        "session_id": "TEST",
        "seq": str(seq),
        "record_type": record_type,
        "event": event,
        "line": "C",
        "station": station,
        "platform": "C",
        "direction": "to-Cais Do Sodre",
        "depth_m": depth,
        "note": note,
    }


def sample(seq: int, depth: float) -> dict[str, str]:
    return row(seq, "sample", "", depth=str(depth))


class StopVoidTest(unittest.TestCase):
    def test_voided_stop_is_dropped_from_profiles(self) -> None:
        rows = [
            row(1, "event", "RIDE_START"),
            sample(2, 10.0),
            sample(3, 10.2),
            row(4, "event", "STATION_STOP", station="alameda", depth="10.3"),
            sample(5, 11.0),
            sample(6, 11.2),
            row(
                7,
                "event",
                "STATION_STOP",
                station="anjo-doce",
                depth="11.3",
            ),
            row(
                8,
                "event",
                "STOP_VOID",
                station="anjo-doce",
                note="void seq 7",
            ),
            sample(9, 12.0),
            sample(10, 12.2),
            row(11, "event", "STATION_STOP", station="arroios", depth="12.3"),
            row(12, "event", "RIDE_END"),
        ]

        profiles = extract_segment_profiles(rows)

        self.assertEqual(len(profiles), 1)
        profile = profiles["C:alameda-arroios"]
        self.assertEqual(profile.from_station, "alameda")
        self.assertEqual(profile.to_station, "arroios")
        self.assertNotIn("TEST:7", profile.measurement_ids)
        self.assertIn("TEST:4", profile.measurement_ids)
        self.assertIn("TEST:11", profile.measurement_ids)

    def test_tunnel_stop_does_not_create_an_anchor(self) -> None:
        rows = [
            row(1, "event", "RIDE_START"),
            sample(2, 10.0),
            sample(3, 10.2),
            row(4, "event", "STATION_STOP", station="alameda", depth="10.3"),
            sample(5, 14.0),
            row(6, "event", "TUNNEL_STOP"),
            sample(7, 14.2),
            sample(8, 15.0),
            row(9, "event", "STATION_STOP", station="arroios", depth="15.1"),
            row(10, "event", "RIDE_END"),
        ]

        profiles = extract_segment_profiles(rows)
        self.assertEqual(len(profiles), 1)
        profile = profiles["C:alameda-arroios"]
        self.assertAlmostEqual(profile.points[0][1], 10.3, places=2)
        self.assertAlmostEqual(profile.points[-1][1], 15.1, places=2)


if __name__ == "__main__":
    unittest.main()
