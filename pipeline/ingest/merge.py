"""Merge processed survey logs into the static data contract.

The viewer never reads the raw log. This command writes the same five assets
the dummy and final pipelines produce.
"""

from __future__ import annotations

import argparse
import json
import math
import warnings
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from read_log import (
    PlatformMeasurement,
    SegmentProfile,
    aggregate,
    read_log,
)

GRADE_CAP = 0.04
PROFILE_STEP_M = 20.0


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


def _cap_grades(
    elevations: list[float], distances: list[float], segment_id: str = ""
) -> list[float]:
    """Limit track elevation changes while keeping both platform anchors fixed."""
    elevations = list(elevations)
    first_anchor, last_anchor = elevations[0], elevations[-1]
    span = distances[-1] - distances[0]
    if abs(last_anchor - first_anchor) > GRADE_CAP * span:
        warnings.warn(
            f"{segment_id}: platform anchors exceed the 4% grade cap; using their average grade",
            stacklevel=2,
        )
        return [
            first_anchor + (distance - distances[0]) / span * (last_anchor - first_anchor)
            for distance in distances
        ]
    for index in range(1, len(elevations) - 1):
        max_change = GRADE_CAP * max(distances[index] - distances[index - 1], 0.0)
        elevations[index] = min(
            max(elevations[index], elevations[index - 1] - max_change),
            elevations[index - 1] + max_change,
        )
    for index in range(len(elevations) - 2, 0, -1):
        max_change = GRADE_CAP * max(distances[index + 1] - distances[index], 0.0)
        elevations[index] = min(
            max(elevations[index], elevations[index + 1] - max_change),
            elevations[index + 1] + max_change,
        )
    return elevations


def _smooth_profile(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Filter ride samples and remove their linear offset between the anchors."""
    samples = points[1:-1]
    if not samples:
        return [(0.0, 0.0), (1.0, 0.0)]

    # A 10% window suppresses pressure noise without treating it as track detail.
    radius = max(1, round(len(samples) * 0.05))
    sums = [0.0]
    for _, depth in samples:
        sums.append(sums[-1] + depth)
    filtered = []
    for index, (t, _) in enumerate(samples):
        start = max(0, index - radius)
        end = min(len(samples), index + radius + 1)
        filtered.append((t, (sums[end] - sums[start]) / (end - start)))

    start_depth, end_depth = filtered[0][1], filtered[-1][1]
    start_t, end_t = filtered[0][0], filtered[-1][0]
    residuals = [(0.0, 0.0)]
    for t, depth in filtered:
        fraction = (t - start_t) / (end_t - start_t) if end_t > start_t else 0.0
        baseline = start_depth + fraction * (end_depth - start_depth)
        residuals.append((t, depth - baseline))
    residuals.append((1.0, 0.0))
    return residuals


def _densify(vertices: list[dict]) -> list[dict]:
    """Add samples along existing straight horizontal edges, without moving them."""
    result = [vertices[0]]
    for first, second in zip(vertices, vertices[1:]):
        span = float(second["distance_m"]) - float(first["distance_m"])
        steps = max(1, math.ceil((span - 1e-9) / PROFILE_STEP_M))
        for index in range(1, steps):
            t = index / steps
            point = dict(first)
            for key in ("lat", "lon", "distance_m", "surface_elevation_m"):
                value = float(first[key]) + t * (float(second[key]) - float(first[key]))
                point[key] = round(value, 8 if key in ("lat", "lon") else 2)
            result.append(point)
        result.append(second)
    return result


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
            vertices = _densify(vertices)
            reversed_run = profile.from_station != segment["from"]
            distances = [float(vertex["distance_m"]) for vertex in vertices]
            residuals = _smooth_profile(profile.points)
            start_depth = profile.points[-1 if reversed_run else 0][1]
            end_depth = profile.points[0 if reversed_run else -1][1]
            start_elevation = float(vertices[0]["surface_elevation_m"]) - start_depth
            end_elevation = float(vertices[-1]["surface_elevation_m"]) - end_depth
            average_grade = abs(end_elevation - start_elevation) / span
            easing = (
                min(1.0, max(0.0, 2.0 * (GRADE_CAP * 0.98 / average_grade - 1.0)))
                if average_grade else 1.0
            )
            baseline = []
            corrections = []
            for vertex in vertices:
                t = (float(vertex["distance_m"]) - first) / span
                eased = t + easing * (t * t * (3.0 - 2.0 * t) - t)
                # Fade uncertain ride details into the fixed platform anchors.
                taper = 16.0 * t * t * (1.0 - t) * (1.0 - t)
                residual = _interpolate(residuals, 1.0 - t if reversed_run else t)
                baseline.append(start_elevation + eased * (end_elevation - start_elevation))
                corrections.append(-taper * residual)
            # Scale the whole correction rather than clipping it into sharp corners.
            strength = 1.0
            if average_grade <= GRADE_CAP:
                for index in range(1, len(vertices)):
                    limit = GRADE_CAP * (distances[index] - distances[index - 1])
                    base_change = baseline[index] - baseline[index - 1]
                    correction_change = corrections[index] - corrections[index - 1]
                    if correction_change > 0:
                        strength = min(
                            strength, max(0.0, (limit - base_change) / correction_change)
                        )
                    elif correction_change < 0:
                        strength = min(
                            strength, max(0.0, (-limit - base_change) / correction_change)
                        )
            elevations = [
                base + strength * correction
                for base, correction in zip(baseline, corrections, strict=True)
            ]
            capped = _cap_grades(elevations, distances, segment["id"])
            for vertex, elevation in zip(vertices, capped, strict=True):
                vertex["depth_m"] = round(float(vertex["surface_elevation_m"]) - elevation, 2)
                vertex["source"] = "measured"
            segment["vertices"] = vertices
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
        "Local demo: real OSM/GTFS geometry, documented depths, measured overlay, synthetic terrain. "
        "Toggle X-ray terrain to see remaining estimated tunnels."
    )
    note = (
        "Measured ride profiles are filtered and aligned to platform anchors; "
        "their intermediate shapes are estimates, not surveyed track geometry. "
        "The 4% display-grade cap cannot be enforced when fixed anchors exceed it."
    )
    if note not in manifest["source_notes"]:
        manifest["source_notes"].append(note)

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
