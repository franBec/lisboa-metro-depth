"""Curated parallel-interchange geometry for the Lisbon Metro.

Baixa-Chiado and Campo Grande are cross-platform interchanges: the two lines run
side by side through a shared station axis. The OSM route ways do not always
preserve that local arrangement, so this module straightens a short window of
each line onto the curated axis and blends back into the original alignment.
"""

from __future__ import annotations

import csv
import math
from dataclasses import dataclass
from pathlib import Path

from gtfs import haversine_m, project_point_to_shape

METERS_PER_DEG_LAT = 110_540.0
METERS_PER_DEG_LON = 111_320.0
HERMITE_SAMPLES = 16
TANGENT_STEP_M = 0.5


@dataclass(frozen=True)
class InterchangeTrack:
    station_id: str
    line_id: str
    axis_lat: float
    axis_lon: float
    bearing_deg: float
    offset_m: float
    platform_length_m: float
    platform_width_m: float
    blend_m: float
    structure: str
    source: str


@dataclass(frozen=True)
class Interchange:
    station_id: str
    axis_lat: float
    axis_lon: float
    bearing_deg: float
    platform_length_m: float
    platform_width_m: float
    spacing_m: float
    structure: str
    tracks: dict[str, InterchangeTrack]


def _to_local(
    lat: float, lon: float, lat0: float, lon0: float
) -> tuple[float, float]:
    return (
        (lon - lon0) * METERS_PER_DEG_LON * math.cos(math.radians(lat0)),
        (lat - lat0) * METERS_PER_DEG_LAT,
    )


def _to_latlon(
    x: float, y: float, lat0: float, lon0: float
) -> tuple[float, float]:
    return (
        lat0 + y / METERS_PER_DEG_LAT,
        lon0 + x / (METERS_PER_DEG_LON * math.cos(math.radians(lat0))),
    )


def load_interchanges(path: Path) -> dict[str, Interchange]:
    with open(path, encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))

    grouped: dict[str, list[InterchangeTrack]] = {}
    for row in rows:
        track = InterchangeTrack(
            station_id=row["station_id"].strip(),
            line_id=row["line_id"].strip(),
            axis_lat=float(row["axis_lat"]),
            axis_lon=float(row["axis_lon"]),
            bearing_deg=float(row["bearing_deg"]),
            offset_m=float(row["offset_m"]),
            platform_length_m=float(row["platform_length_m"]),
            platform_width_m=float(row["platform_width_m"]),
            blend_m=float(row["blend_m"]),
            structure=row["structure"].strip(),
            source=row["source"].strip(),
        )
        grouped.setdefault(track.station_id, []).append(track)

    interchanges: dict[str, Interchange] = {}
    for station_id, tracks in grouped.items():
        if len(tracks) != 2:
            raise RuntimeError(
                f"{station_id}: expected two interchange tracks, found {len(tracks)}"
            )
        first, second = tracks
        for value, other in (
            (first.axis_lat, second.axis_lat),
            (first.axis_lon, second.axis_lon),
            (first.bearing_deg, second.bearing_deg),
            (first.platform_length_m, second.platform_length_m),
            (first.platform_width_m, second.platform_width_m),
            (first.blend_m, second.blend_m),
            (first.structure, second.structure),
        ):
            if value != other:
                raise RuntimeError(
                    f"{station_id}: interchange rows disagree on {value!r} and {other!r}"
                )
        if first.offset_m * second.offset_m >= 0:
            raise RuntimeError(f"{station_id}: interchange offsets must have opposite signs")

        interchanges[station_id] = Interchange(
            station_id=station_id,
            axis_lat=first.axis_lat,
            axis_lon=first.axis_lon,
            bearing_deg=first.bearing_deg,
            platform_length_m=first.platform_length_m,
            platform_width_m=first.platform_width_m,
            spacing_m=abs(first.offset_m - second.offset_m),
            structure=first.structure,
            tracks={track.line_id: track for track in tracks},
        )
    return interchanges


def _local_at(points: list[dict[str, float]], distance: float) -> tuple[float, float]:
    for first, second in zip(points, points[1:]):
        if first["d"] <= distance <= second["d"]:
            span = second["d"] - first["d"]
            t = 0.0 if span == 0 else (distance - first["d"]) / span
            return (
                first["x"] + t * (second["x"] - first["x"]),
                first["y"] + t * (second["y"] - first["y"]),
            )
    return (points[-1]["x"], points[-1]["y"])


def _local_tangent(
    points: list[dict[str, float]], distance: float
) -> tuple[float, float]:
    low = max(distance - TANGENT_STEP_M, points[0]["d"])
    high = min(distance + TANGENT_STEP_M, points[-1]["d"])
    before = _local_at(points, low)
    after = _local_at(points, high)
    dx = after[0] - before[0]
    dy = after[1] - before[1]
    length = math.hypot(dx, dy)
    if length == 0:
        return (0.0, 1.0)
    return (dx / length, dy / length)


def _hermite(
    start: tuple[float, float],
    end: tuple[float, float],
    start_tangent: tuple[float, float],
    end_tangent: tuple[float, float],
    samples: int,
) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    for index in range(1, samples + 1):
        t = index / samples
        t2 = t * t
        t3 = t2 * t
        h00 = 2 * t3 - 3 * t2 + 1
        h10 = t3 - 2 * t2 + t
        h01 = -2 * t3 + 3 * t2
        h11 = t3 - t2
        points.append(
            (
                h00 * start[0] + h10 * start_tangent[0] + h01 * end[0] + h11 * end_tangent[0],
                h00 * start[1] + h10 * start_tangent[1] + h01 * end[1] + h11 * end_tangent[1],
            )
        )
    return points


def _with_distances(
    points: list[tuple[float, float]]
) -> list[dict[str, float]]:
    shape: list[dict[str, float]] = []
    distance = 0.0
    previous: tuple[float, float] | None = None
    for point in points:
        if previous is not None:
            step = haversine_m(previous[0], previous[1], point[0], point[1])
            if step < 1e-6:
                continue
            distance += step
        shape.append({"lat": point[0], "lon": point[1], "d": distance})
        previous = point
    return shape


def deform_shape_for_interchange(
    shape: list[dict[str, float]], track: InterchangeTrack
) -> tuple[list[dict[str, float]], dict[str, float]]:
    """Straighten the station window and return the new shape plus the target point."""
    lat0 = track.axis_lat
    lon0 = track.axis_lon
    local = []
    for point in shape:
        x, y = _to_local(float(point["lat"]), float(point["lon"]), lat0, lon0)
        local.append({"x": x, "y": y, "d": float(point["d"])})
    total = local[-1]["d"]
    station_distance = float(project_point_to_shape(lat0, lon0, shape)["distance_m"])
    half = track.platform_length_m / 2.0
    blend = min(
        track.blend_m,
        station_distance - half,
        total - station_distance - half,
    )
    if blend <= 0:
        raise RuntimeError(
            f"{track.station_id}/{track.line_id}: station window does not fit the shape"
        )

    start_distance = station_distance - half - blend
    end_distance = station_distance + half + blend
    start_point = _local_at(local, start_distance)
    end_point = _local_at(local, end_distance)
    start_tangent = _local_tangent(local, start_distance)
    end_tangent = _local_tangent(local, end_distance)

    bearing = math.radians(track.bearing_deg)
    along = (math.sin(bearing), math.cos(bearing))
    right = (math.cos(bearing), -math.sin(bearing))
    target = (track.offset_m * right[0], track.offset_m * right[1])
    window_start = (
        target[0] - along[0] * half,
        target[1] - along[1] * half,
    )
    window_end = (
        target[0] + along[0] * half,
        target[1] + along[1] * half,
    )

    points: list[tuple[float, float]] = []
    for point in local:
        if point["d"] < start_distance:
            points.append((point["x"], point["y"]))
    points.append(start_point)
    points.extend(
        _hermite(
            start_point,
            window_start,
            (start_tangent[0] * blend, start_tangent[1] * blend),
            (along[0] * blend, along[1] * blend),
            HERMITE_SAMPLES,
        )
    )
    points.append(window_end)
    points.extend(
        _hermite(
            window_end,
            end_point,
            (along[0] * blend, along[1] * blend),
            (end_tangent[0] * blend, end_tangent[1] * blend),
            HERMITE_SAMPLES,
        )
    )
    for point in local:
        if point["d"] > end_distance:
            points.append((point["x"], point["y"]))

    deformed = _with_distances([_to_latlon(x, y, lat0, lon0) for x, y in points])
    target_latlon = _to_latlon(target[0], target[1], lat0, lon0)
    target_projection = project_point_to_shape(
        target_latlon[0], target_latlon[1], deformed
    )
    return deformed, {
        "lat": target_latlon[0],
        "lon": target_latlon[1],
        "distance_m": float(target_projection["distance_m"]),
    }
