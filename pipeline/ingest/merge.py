"""Merge processed survey logs into the static data contract.

The viewer never reads the raw log. This command writes the same five assets
the dummy and final pipelines produce.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from read_log import (
    PlatformMeasurement,
    SegmentProfile,
    aggregate,
    read_log,
)


def _interpolate(points: list[tuple[float, float]], t: float) -> float:
    if t <= points[0][0]:
        return points[0][1]
    if t >= points[-1][0]:
        return points[-1][1]
    for index in range(len(points) - 1):
        t0, d0 = points[index]
        t1, d1 = points[index + 1]
        if t0 <= t <= t1:
            span = t1 - t0
            return d0 if span == 0 else d0 + (t - t0) / span * (d1 - d0)
    return points[-1][1]


def _find_station(stations: list[dict], station_id: str) -> dict | None:
    for station in stations:
        if station["id"] == station_id:
            return station
    return None


def _apply_platforms(
    stations: list[dict], measurements: dict[tuple[str, str], PlatformMeasurement]
) -> int:
    applied = 0
    for (line_id, station_id), measurement in measurements.items():
        station = _find_station(stations, station_id)
        if station is None:
            continue
        for platform in station["platforms"]:
            if platform["line"] != line_id:
                continue
            platform["platform_depth_m"] = round(measurement.depth_m, 2)
            platform["measured_depth_m"] = round(measurement.depth_m, 2)
            platform["depth_source"] = "measured"
            platform["depth_basis"] = "platform"
            if measurement.confidence_m is not None:
                platform["confidence_m"] = round(measurement.confidence_m, 2)
            platform["measurement_ids"] = sorted(
                set(platform.get("measurement_ids", [])) | set(measurement.measurement_ids)
            )
            platform["note"] = "Measured platform depth."
            applied += 1
            break
    return applied


def _apply_profiles(network: dict, profiles: dict[str, SegmentProfile]) -> int:
    applied = 0
    for line in network["lines"]:
        for segment in line["segments"]:
            profile = profiles.get(segment["id"])
            if profile is None:
                continue
            vertices = segment["vertices"]
            if len(vertices) < 2:
                continue
            first = float(vertices[0]["distance_m"])
            last = float(vertices[-1]["distance_m"])
            span = last - first
            if span <= 0:
                continue
            reversed_run = profile.from_station != segment["from"]
            for vertex in vertices:
                t = (float(vertex["distance_m"]) - first) / span
                if reversed_run:
                    t = 1.0 - t
                vertex["depth_m"] = round(_interpolate(profile.points, t), 2)
                vertex["source"] = "measured"
            segment["depth_source"] = "measured"
            segment["measurement_ids"] = profile.measurement_ids
            applied += 1
    return applied


def _counts(stations: list[dict], network: dict) -> dict[str, dict[str, int]]:
    platform_counts = Counter(
        platform["depth_source"]
        for station in stations
        for platform in station["platforms"]
    )
    segment_counts = Counter(
        segment["depth_source"]
        for line in network["lines"]
        for segment in line["segments"]
    )
    keys = ("measured", "official", "estimated", "unknown")
    return {
        "platforms": {key: platform_counts.get(key, 0) for key in keys},
        "segments": {key: segment_counts.get(key, 0) for key in keys},
    }


def merge_data(data_dir: Path, log_path: Path) -> dict[str, object]:
    manifest_path = data_dir / "manifest.json"
    stations_path = data_dir / "stations.json"
    network_path = data_dir / "network.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    stations = json.loads(stations_path.read_text(encoding="utf-8"))
    network = json.loads(network_path.read_text(encoding="utf-8"))

    rows = read_log(log_path)
    platform_measurements, profiles = aggregate(rows)
    applied_platforms = _apply_platforms(stations, platform_measurements)
    applied_segments = _apply_profiles(network, profiles)

    manifest["dataset_version"] = f"{manifest['dataset_version'].split('+')[0]}+measured"
    manifest["capabilities"]["measured_depths"] = applied_platforms > 0 or applied_segments > 0
    manifest["provenance_counts"] = _counts(stations, network)
    manifest["counts"]["measured_platforms"] = applied_platforms
    manifest["counts"]["measured_segments"] = applied_segments
    manifest["last_measurement_merge"] = {
        "source": str(log_path),
        "merged_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "platform_records": applied_platforms,
        "segment_records": applied_segments,
    }
    manifest["demo_note"] = (
        "Local demo: real GTFS geometry, documented depths, measured overlay, synthetic terrain. "
        "Toggle X-ray terrain to see remaining estimated tunnels."
    )

    stations_path.write_text(
        json.dumps(stations, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    network_path.write_text(
        json.dumps(network, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return {
        "platform_records": applied_platforms,
        "segment_records": applied_segments,
        "provenance_counts": manifest["provenance_counts"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="Cardputer CSV log")
    parser.add_argument(
        "--data",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "web" / "public" / "data" / "v1",
        help="data directory to update in place",
    )
    args = parser.parse_args()
    result = merge_data(args.data, args.input)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
