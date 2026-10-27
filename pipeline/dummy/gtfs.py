"""Minimal GTFS reader and canonical pattern selection for the dummy build."""

from __future__ import annotations

import csv
import hashlib
import io
import math
import os
import re
import unicodedata
import urllib.request
import zipfile
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

GTFS_URL = (
    "https://dados.gov.pt/s/resources/gtfs-do-metropolitano-de-lisboa/"
    "20261026-150924-d399cedf/googletransit.zip"
)
GTFS_FILENAME = "lisboa-gtfs-20261026.zip"
EARTH_RADIUS_M = 6_371_000.0


def ensure_gtfs(raw_dir: Path) -> Path:
    raw_dir.mkdir(parents=True, exist_ok=True)
    path = raw_dir / GTFS_FILENAME
    if path.exists() and path.stat().st_size > 0:
        return path

    request = urllib.request.Request(
        GTFS_URL,
        headers={"User-Agent": "lisboa-metro-depth/0.1 (+local research build)"},
    )
    tmp = path.with_suffix(".part")
    with urllib.request.urlopen(request, timeout=120) as response:
        with open(tmp, "wb") as handle:
            while True:
                chunk = response.read(1024 * 256)
                if not chunk:
                    break
                handle.write(chunk)
    os.replace(tmp, path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    (raw_dir / (GTFS_FILENAME + ".sha256")).write_text(digest + "\n", encoding="utf-8")
    return path


def _rows(archive: zipfile.ZipFile, name: str) -> list[dict[str, str]]:
    with archive.open(name) as raw:
        text = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
        return list(csv.DictReader(text))


def _number(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def slugify(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")
    return slug


def feed_date(shape_id: str) -> int:
    match = re.search(r"I2_(?:PE_)?(\d{8})_", shape_id)
    if not match:
        return 0
    try:
        return int(datetime.strptime(match.group(1), "%d%m%Y").strftime("%Y%m%d"))
    except ValueError:
        return 0


class Gtfs:
    def __init__(self, path: Path) -> None:
        with zipfile.ZipFile(path) as archive:
            self.routes = {row["route_id"]: row for row in _rows(archive, "routes.txt")}
            self.stops = {row["stop_id"]: row for row in _rows(archive, "stops.txt")}
            self.trips = {row["trip_id"]: row for row in _rows(archive, "trips.txt")}

            self.stop_times: dict[str, list[dict[str, str]]] = defaultdict(list)
            for row in _rows(archive, "stop_times.txt"):
                self.stop_times[row["trip_id"]].append(row)
            for rows in self.stop_times.values():
                rows.sort(key=lambda row: int(row["stop_sequence"]))

            self.shapes: dict[str, list[dict[str, float]]] = defaultdict(list)
            for row in _rows(archive, "shapes.txt"):
                self.shapes[row["shape_id"]].append(
                    {
                        "lat": float(row["shape_pt_lat"]),
                        "lon": float(row["shape_pt_lon"]),
                        "d": float(row.get("shape_dist_traveled") or 0.0),
                        "seq": int(row["shape_pt_sequence"]),
                    }
                )
            for points in self.shapes.values():
                points.sort(key=lambda point: point["seq"])
                self._normalize_shape_distances(points)

    @staticmethod
    def _normalize_shape_distances(points: list[dict[str, float]]) -> None:
        if not points:
            return
        points[0]["d"] = 0.0
        previous = 0.0
        previous_lat = points[0]["lat"]
        previous_lon = points[0]["lon"]
        for point in points[1:]:
            if point["d"] <= previous:
                point["d"] = previous + haversine_m(
                    previous_lat, previous_lon, point["lat"], point["lon"]
                )
            previous = point["d"]
            previous_lat = point["lat"]
            previous_lon = point["lon"]

    def station_stop(self, stop_id: str) -> dict[str, str]:
        stop = self.stops[stop_id]
        parent = stop.get("parent_station") or ""
        if parent:
            return self.stops[parent]
        return stop

    def station_sequence(self, trip_id: str) -> list[dict[str, object]]:
        sequence: list[dict[str, object]] = []
        seen: set[str] = set()
        for time in self.stop_times[trip_id]:
            stop = self.station_stop(time["stop_id"])
            station_id = stop["stop_id"]
            if station_id in seen:
                continue
            seen.add(station_id)
            sequence.append(
                {
                    "station_id": station_id,
                    "slug": slugify(stop["stop_name"]),
                    "name": stop["stop_name"],
                    "lat": float(stop["stop_lat"]),
                    "lon": float(stop["stop_lon"]),
                    "distance_m": _number(time.get("shape_dist_traveled")),
                }
            )
        return sequence

    def select_canonical(self) -> list[dict[str, object]]:
        lines: list[dict[str, object]] = []
        for route_id in sorted(self.routes):
            route_trips = [trip for trip in self.trips.values() if trip["route_id"] == route_id]
            if not route_trips:
                continue

            by_direction: dict[str, list[dict[str, str]]] = defaultdict(list)
            for trip in route_trips:
                by_direction[trip["direction_id"]].append(trip)
            direction = max(by_direction, key=lambda key: len(by_direction[key]))
            candidates = by_direction[direction]

            scored: list[tuple[int, int, dict[str, str], list[dict[str, object]]]] = []
            for trip in candidates:
                sequence = self.station_sequence(trip["trip_id"])
                if len(sequence) < 2:
                    continue
                scored.append(
                    (
                        len(sequence),
                        feed_date(trip["shape_id"]),
                        trip,
                        sequence,
                    )
                )
            if not scored:
                continue

            longest = max(item[0] for item in scored)
            newest = max(item[1] for item in scored if item[0] == longest)
            full = [item for item in scored if item[0] == longest and item[1] == newest]
            shape_counts = Counter(item[2]["shape_id"] for item in full)
            shape_id = max(shape_counts, key=lambda key: (shape_counts[key], feed_date(key), key))
            trip = next(item[2] for item in full if item[2]["shape_id"] == shape_id)
            sequence = next(item[3] for item in full if item[2]["trip_id"] == trip["trip_id"])

            points = self.shapes[shape_id]
            normalized: list[dict[str, object]] = []
            previous_distance = -1.0
            for station in sequence:
                distance = station["distance_m"]
                projected = project_point_to_shape(
                    float(station["lat"]), float(station["lon"]), points
                )
                if distance is None or float(distance) <= previous_distance:
                    distance = projected["distance_m"]
                    station["lat"] = projected["lat"]
                    station["lon"] = projected["lon"]
                station["distance_m"] = float(distance)
                previous_distance = float(distance)
                normalized.append(station)

            route = self.routes[route_id]
            lines.append(
                {
                    "id": route_id,
                    "name": route["route_long_name"],
                    "short_name": route.get("route_short_name", ""),
                    "color": "#" + (route.get("route_color") or "999999"),
                    "direction": direction,
                    "headsign": trip.get("trip_headsign", ""),
                    "shape_id": shape_id,
                    "trip_id": trip["trip_id"],
                    "shape": points,
                    "stations": normalized,
                }
            )
        return lines


def project_point_to_shape(
    lat: float, lon: float, points: list[dict[str, float]]
) -> dict[str, float]:
    best = {"lat": points[0]["lat"], "lon": points[0]["lon"], "distance_m": points[0]["d"], "offset_m": 1e18}
    cos_lat = math.cos(math.radians(lat))
    for index in range(len(points) - 1):
        a = points[index]
        b = points[index + 1]
        ax = (a["lon"] - lon) * 111_320.0 * cos_lat
        az = (a["lat"] - lat) * 110_540.0
        bx = (b["lon"] - lon) * 111_320.0 * cos_lat
        bz = (b["lat"] - lat) * 110_540.0
        dx = bx - ax
        dz = bz - az
        length_sq = dx * dx + dz * dz
        t = 0.0 if length_sq == 0 else max(0.0, min(1.0, -(ax * dx + az * dz) / length_sq))
        px = ax + t * dx
        pz = az + t * dz
        offset = math.hypot(px, pz)
        if offset < best["offset_m"]:
            best = {
                "lat": a["lat"] + t * (b["lat"] - a["lat"]),
                "lon": a["lon"] + t * (b["lon"] - a["lon"]),
                "distance_m": a["d"] + t * (b["d"] - a["d"]),
                "offset_m": offset,
            }
    return best


def shape_slice(
    points: list[dict[str, float]], start: float, end: float
) -> list[dict[str, float]]:
    if end < start:
        start, end = end, start
    result: list[dict[str, float]] = []
    for point in points:
        if start < point["d"] < end:
            result.append({"lat": point["lat"], "lon": point["lon"], "d": point["d"]})
    result.insert(0, interpolate_shape(points, start))
    result.append(interpolate_shape(points, end))
    return result


def interpolate_shape(points: list[dict[str, float]], distance: float) -> dict[str, float]:
    if distance <= points[0]["d"]:
        return {"lat": points[0]["lat"], "lon": points[0]["lon"], "d": distance}
    if distance >= points[-1]["d"]:
        return {"lat": points[-1]["lat"], "lon": points[-1]["lon"], "d": distance}
    for index in range(len(points) - 1):
        a = points[index]
        b = points[index + 1]
        if a["d"] <= distance <= b["d"]:
            span = b["d"] - a["d"]
            t = 0.0 if span == 0 else (distance - a["d"]) / span
            return {
                "lat": a["lat"] + t * (b["lat"] - a["lat"]),
                "lon": a["lon"] + t * (b["lon"] - a["lon"]),
                "d": distance,
            }
    return {"lat": points[-1]["lat"], "lon": points[-1]["lon"], "d": distance}
